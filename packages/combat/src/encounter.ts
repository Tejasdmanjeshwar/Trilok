import type {
  AttackDelivery, CombatCatalog, CombatantId, EncounterActor, EncounterState,
  ReactionOption, ReactionPolicyOverride, ReactionResolution, ReactionTechnique,
  TimingAdjustments, PendingHit, AttackHitSpec, EncounterRules, DamageType,
  PendingCounter, CounterResolution, ProjectileContinuationResolution, ProjectileAttackGeometry,
} from "./encounter-types";
import { validateCombatCatalog } from "./encounter-catalog";
import { gradeReactionWindow, resolveEffectiveTiming, validateTimingAdjustments } from "./encounter-timing";
import { resolveDefaultRegion, resolveRegionDamage, validateActorTargets } from "./encounter-damage";
import { calculateProjectileClash } from "./encounter-clash";
import {
  findInterceptionWindow, planInterception, sampleTrajectory, validateTrajectory,
  type InterceptionMove, type InterceptionPlan, type InterceptionWindow,
} from "./projectile-motion";
import {
  emptyTurnBudget, LEGACY_ENCOUNTER_RULES, mayContinueTurn, recordAttackAction,
  transitionTurn, validateEncounterRules,
} from "./encounter-economy";
export { gradeReactionWindow as gradeReactionV2 } from "./encounter-timing";

const DEFAULT_BY_DELIVERY: Readonly<Record<AttackDelivery, readonly ReactionTechnique[]>> = {
  melee_contact: ["dodge", "weapon_deflect"],
  ranged_projectile: ["dodge", "weapon_deflect", "projectile_intercept"],
  area: [],
};

function validTick(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
function assertDistance(distance: number): void {
  if (!Number.isFinite(distance) || distance < 0) throw new Error("Invalid target distance.");
}
function getActor(state: EncounterState, actorId: string): EncounterActor {
  const actor = state.actors[actorId];
  if (!actor) throw new Error("Unknown combatant: " + actorId);
  return actor;
}
function assertDecision(state: EncounterState, actorId: string): EncounterActor {
  if (state.phase !== "decision" || state.pending || state.pendingCounter || state.pendingProjectile || state.activeActorId !== actorId) {
    throw new Error("Combatant cannot act outside their decision phase.");
  }
  const actor = getActor(state, actorId);
  if (actor.hp <= 0 || actor.status !== "ready") throw new Error("Combatant cannot act.");
  return actor;
}
function withActor(state: EncounterState, actor: EncounterActor): EncounterState {
  return { ...state, actors: { ...state.actors, [actor.id]: actor } };
}

/** Validate loadouts, turn order and initial resources, then clone the authored data. */
export function createEncounter(
  actors: readonly EncounterActor[],
  catalog: CombatCatalog,
  activeActorId: CombatantId = actors[0]?.id ?? "",
  rules: EncounterRules = LEGACY_ENCOUNTER_RULES,
): EncounterState {
  validateCombatCatalog(catalog);
  validateEncounterRules(rules);
  if (actors.length < 2) throw new Error("An encounter requires at least two combatants.");
  const ids = new Set<string>();
  const map: Record<string, EncounterActor> = {};
  for (const actor of actors) {
    if (!actor.id || ids.has(actor.id)) throw new Error("Duplicate/invalid combatant ID.");
    ids.add(actor.id);
    if (!Number.isFinite(actor.hp) || !Number.isFinite(actor.maxHp) ||
        actor.maxHp <= 0 || actor.hp <= 0 || actor.hp > actor.maxHp ||
        !Number.isFinite(actor.resource) || !Number.isFinite(actor.maxResource) ||
        actor.resource < 0 || actor.resource > actor.maxResource ||
        actor.status !== "ready" && actor.status !== "stunned") {
      throw new Error("Invalid combatant stats.");
    }
    if (!actor.loadoutIds.length || new Set(actor.loadoutIds).size !== actor.loadoutIds.length ||
        !actor.loadoutIds.includes(actor.equippedId) ||
        actor.loadoutIds.some(id => !catalog.equipment[id])) {
      throw new Error("Combatant has an invalid equipment loadout.");
    }
    for (const [key, until] of Object.entries(actor.cooldownUntilTurn)) {
      if (!catalog.defenses[key] || !validTick(until)) throw new Error("Invalid reaction cooldown.");
    }
    validateActorTargets(actor, catalog);
    if (actor.switchedOnTurn !== null && !validTick(actor.switchedOnTurn)) {
      throw new Error("Invalid last-switch turn.");
    }
    map[actor.id] = {
      ...actor,
      loadoutIds: [...actor.loadoutIds],
      cooldownUntilTurn: { ...actor.cooldownUntilTurn },
      equippedArmorIds: actor.equippedArmorIds ? [...actor.equippedArmorIds] : undefined,
      regionExposure: actor.regionExposure ? { ...actor.regionExposure } : undefined,
    };
  }
  if (!ids.has(activeActorId)) throw new Error("Unknown initial combatant.");
  return {
    actors: map,
    turnOrder: actors.map(actor => actor.id),
    turn: 1,
    activeActorId,
    rules: { ...rules },
    turnBudget: emptyTurnBudget(),
    defenseUsesSinceTurn: {},
    phase: "decision",
    pending: null,
    pendingCounter: null,
    pendingProjectile: null,
    victorId: null,
  };
}

/** Domain-authoritative legal equipment options for humans and AI. */
export function getLegalEquipmentSwitches(
  state: EncounterState,
  catalog: CombatCatalog,
  actorId: CombatantId,
): readonly string[] {
  if (state.phase !== "decision" || state.pending || state.pendingCounter || state.pendingProjectile || state.activeActorId !== actorId) return [];
  const actor = state.actors[actorId];
  if (!actor || actor.hp <= 0 || actor.status !== "ready" ||
      actor.switchedOnTurn === state.turn) return [];
  return actor.loadoutIds.filter(id => {
    const equipment = catalog.equipment[id];
    return id !== actor.equippedId && equipment !== undefined &&
      actor.resource >= equipment.switchCost;
  });
}

export function equipCombatant(
  state: EncounterState,
  actorId: string,
  equipmentId: string,
  catalog: CombatCatalog,
): EncounterState {
  const actor = assertDecision(state, actorId);
  if (actor.equippedId === equipmentId) return state;
  if (!getLegalEquipmentSwitches(state, catalog, actorId).includes(equipmentId)) {
    throw new Error("Equipment switch unavailable: loadout, turn limit or Energy.");
  }
  const cost = catalog.equipment[equipmentId]!.switchCost;
  return withActor(state, {
    ...actor, equippedId: equipmentId, resource: actor.resource - cost,
    switchedOnTurn: state.turn,
  });
}

/** Authoritative affordable-move query, shared by UI, scripted opponents and AI. */
export function getLegalAttackMoves(
  state: EncounterState,
  catalog: CombatCatalog,
  defenderId: CombatantId,
  distanceMeters: number,
): readonly string[] {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0 ||
      state.phase !== "decision" || state.pending !== null || state.pendingCounter !== null ||
      state.pendingProjectile !== null) return [];
  const actor = state.actors[state.activeActorId];
  const defender = state.actors[defenderId];
  if (!actor || actor.hp <= 0 || actor.status !== "ready" ||
      !defender || defender.hp <= 0 || defender.id === actor.id ||
      state.turnBudget.actionsUsed >= state.rules.maxActionsPerTurn) return [];
  const equipment = catalog.equipment[actor.equippedId];
  if (!equipment) return [];
  return equipment.attackMoveIds.filter(id => {
    const move = catalog.attacks[id];
    if (!move) return false;
    return move.resourceCost <= actor.resource &&
      distanceMeters <= move.engageRangeMeters &&
      (move.turnPolicy?.maxUsesPerTurn === undefined ||
        (state.turnBudget.moveUses[id] ?? 0) < move.turnPolicy.maxUsesPerTurn);
  });
}

export interface QueueAttackInput {
  readonly attackerId: string;
  readonly defenderId: string;
  readonly moveId: string;
  readonly distanceAtStartMeters: number;
  readonly startedTick: number;
  /** Difficulty, accessibility and status adjustments snapshotted when queued. */
  readonly reactionTiming?: TimingAdjustments;
  /** Stable desired target; never inferred to be the actual impacted region. */
  readonly intendedRegionId?: string | null;
  /** Pure snapshots supplied by a spatial adapter, optional for legacy matches. */
  readonly projectileGeometry?: ProjectileAttackGeometry;
}

/**
 * An attack is pending until its authored contact tick.
 * Selecting a move does not deal damage, regardless of attacker identity.
 */
export function queueAttack(
  state: EncounterState,
  input: QueueAttackInput,
  catalog: CombatCatalog,
): EncounterState {
  const attacker = assertDecision(state, input.attackerId);
  if (input.attackerId === input.defenderId) throw new Error("Self-targeting is not supported.");
  const defender = getActor(state, input.defenderId);
  if (defender.hp <= 0) throw new Error("Cannot target a defeated combatant.");
  if (!validTick(input.startedTick)) throw new Error("Invalid attack start tick.");
  assertDistance(input.distanceAtStartMeters);
  const move = catalog.attacks[input.moveId];
  if (!move || !getLegalAttackMoves(
    state, catalog, input.defenderId, input.distanceAtStartMeters,
  ).includes(input.moveId)) {
    if (move?.turnPolicy?.maxUsesPerTurn !== undefined &&
        (state.turnBudget.moveUses[input.moveId] ?? 0) >= move.turnPolicy.maxUsesPerTurn) {
      throw new Error("Attack move has reached its per-turn use limit.");
    }
    throw new Error("Attack unavailable: equipment, Energy, range or action budget.");
  }
  if(input.projectileGeometry){
    validateTrajectory(input.projectileGeometry.incoming);
    validateTrajectory(input.projectileGeometry.attackerPosition);
  }
  const targeting = move.targeting ?? { mode: "actor" as const };
  const intendedRegionId = input.intendedRegionId ?? null;
  if (intendedRegionId !== null) {
    const anatomy = defender.anatomyId ? catalog.anatomies?.[defender.anatomyId] : undefined;
    if (targeting.mode !== "free_aim" || !anatomy?.regions[intendedRegionId] ||
        defender.regionExposure?.[intendedRegionId] === "hidden") {
      throw new Error("Invalid or hidden aimed region.");
    }
  }
  const policy = move.turnPolicy ?? { continuation: "end" as const };
  const adjustments = input.reactionTiming ?? {};
  validateTimingAdjustments(adjustments);
  const rawHits: readonly AttackHitSpec[] = move.hits ??
    [{ id: "impact", offsetTicks: move.impactOffsetTicks }];
  const defenseIds = catalog.equipment[defender.equippedId]?.defenseMoveIds ?? [];
  const hits: PendingHit[] = rawHits.map(hit => {
    const impactTick = input.startedTick + hit.offsetTicks;
    if (!validTick(impactTick)) throw new Error("Invalid attack impact tick.");
    const timingByDefenseId: Record<string, ReturnType<typeof resolveEffectiveTiming>> = {};
    const interceptionWindows: Record<string, InterceptionWindow> = {};
    for (const defenseId of defenseIds) {
      const defense = catalog.defenses[defenseId];
      if (!defense) throw new Error("Equipped defense is absent from the catalog.");
      timingByDefenseId[defenseId] =
        resolveEffectiveTiming(move, defense, catalog, adjustments, hit);
      const flight = defense.projectileInterception?.flight;
      if (flight && input.projectileGeometry && move.delivery === "ranged_projectile") {
        const geometry = input.projectileGeometry;
        const incomingStart=geometry.incoming.kind==="ballistic"
          ? geometry.incoming.startTick : geometry.incoming.segments[0]!.startTick;
        const config: InterceptionMove = {
          minSpeed: flight.minSpeed, maxSpeed: flight.maxSpeed,
          releaseDelayTicks: flight.releaseDelayTicks,
          acceleration: flight.gravity,
          earliestClashTick: incomingStart + 18,
          latestClashTick: impactTick - 30,
          continuationHorizonTicks: 900,
          targetRadiusMeters: flight.targetRadiusMeters,
          contactRadiusMeters: flight.contactRadiusMeters,
        };
        const earliestInput=Math.max(input.startedTick,
          incomingStart-flight.releaseDelayTicks);
        const latestInput=impactTick-flight.releaseDelayTicks-38;
        const window = earliestInput<=latestInput ? findInterceptionWindow({
          attackStartedTick: input.startedTick, attackImpactTick: impactTick,
          earliestInputTick: earliestInput,
          latestInputTick: latestInput,
          inputStepTicks: 6,
          base: {
            incoming: geometry.incoming,
            launchOrigin: geometry.defenderLaunchOrigin,
            targetAtTick: tick => sampleTrajectory(geometry.attackerPosition,tick).position,
            move: config,
          },
        }) : null;
        if (window) interceptionWindows[defenseId] = window;
      }
    }
    return {
      id: hit.id,
      impactTick,
      damageMultiplier: hit.damageMultiplier ?? 1,
      timingByDefenseId,
      ...(Object.keys(interceptionWindows).length ?
        { interceptionWindows } : {}),
    };
  });
  const next = withActor(state, { ...attacker, resource: attacker.resource - move.resourceCost });
  return {
    ...next,
    turnBudget: recordAttackAction(next.turnBudget, move.id),
    phase: "reaction",
    pending: {
      attackerId: input.attackerId,
      defenderId: input.defenderId,
      moveId: input.moveId,
      startedTick: input.startedTick,
      hitIndex: 0,
      hits,
      turnPolicy: { ...policy },
      targeting: { ...targeting },
      intendedRegionId,
      damageType: (move.damageType ?? "blunt") as DamageType,
      ...(input.projectileGeometry ? { projectileGeometry: input.projectileGeometry } : {}),
      impactTick: hits[0]!.impactTick,
    },
  };
}

function permittedTechniques(
  delivery: AttackDelivery,
  policy?: ReactionPolicyOverride,
): ReadonlySet<ReactionTechnique> {
  const defaults = DEFAULT_BY_DELIVERY[delivery];
  let result: Set<ReactionTechnique>;
  switch (policy?.mode ?? "inherit") {
    case "replace":
      result = new Set(policy?.allow ?? []);
      break;
    case "extend":
      result = new Set([...defaults, ...(policy?.allow ?? [])]);
      break;
    case "inherit":
      result = policy?.allow ? new Set(defaults.filter(item => policy.allow!.includes(item))) : new Set(defaults);
      break;
  }
  for (const item of policy?.deny ?? []) result.delete(item);
  return result;
}

/** One legality query for controllers, UI, and future AI policies. */
export function getLegalReactions(
  state: EncounterState,
  catalog: CombatCatalog,
): readonly ReactionOption[] {
  const pending = state.pending;
  if (!pending || state.phase !== "reaction") return [];
  const defender = getActor(state, pending.defenderId);
  if (defender.hp <= 0 || defender.status !== "ready") return [];
  const weapon = catalog.equipment[defender.equippedId];
  const attack = catalog.attacks[pending.moveId];
  if (!weapon || !attack) throw new Error("Pending attack references invalid content.");
  const permitted = permittedTechniques(attack.delivery, attack.reactionPolicy);
  const uses = state.defenseUsesSinceTurn[defender.id] ?? 0;
  return weapon.defenseMoveIds.flatMap(moveId => {
    const move = catalog.defenses[moveId];
    if (!move) throw new Error("Unknown equipped reaction move.");
    const denied = attack.reactionPolicy?.deny?.includes(move.technique) ?? false;
    const hasException = move.grantsAgainst?.includes(attack.delivery) &&
      attack.reactionPolicy?.mode !== "replace";
    if (denied || (!permitted.has(move.technique) && !hasException) ||
        defender.resource < (uses === 0 ? 0 : move.resourceCost) ||
        (defender.cooldownUntilTurn[move.id] ?? 0) > state.turn) return [];
    const hit = pending.hits[pending.hitIndex];
    const timing = hit?.timingByDefenseId[move.id];
    if (!timing) throw new Error("Missing snapshotted timing for equipped reaction.");
    const clash = move.technique === "projectile_intercept" && attack.delivery === "ranged_projectile"
      ? move.projectileInterception : undefined;
    const computedWindow = clash?.flight && pending.projectileGeometry
      ? hit?.interceptionWindows?.[move.id] : undefined;
    if (clash?.flight && pending.projectileGeometry && !computedWindow) return [];
    const targetTick = computedWindow?.recommendedTick ??
      hit!.impactTick - (clash?.launchLeadTicks ?? 0);
    const recommendedPlan = computedWindow && clash?.flight && pending.projectileGeometry
      ? solveInterceptionPlan(pending, move, targetTick, hit!.impactTick)
      : null;
    const clashTick = recommendedPlan?.clashTick ??
      hit!.impactTick - (clash?.clashLeadTicks ?? 0);
    if (clash && (targetTick < pending.startedTick || clashTick <= targetTick)) return [];
    const effectiveTiming = computedWindow ? {
      ...timing,
      earlyTicks: targetTick-computedWindow.firstTick,
      lateTicks: computedWindow.lastTick-targetTick,
      perfectTicks: Math.max(0,Math.min(
        targetTick-computedWindow.perfectStartTick,
        computedWindow.perfectEndTick-targetTick,
      )),
      goodTicks: Math.max(0,Math.min(70,
        Math.max(targetTick-computedWindow.firstTick,
          computedWindow.lastTick-targetTick))),
    } : timing;
    return [{
      moveId: move.id,
      technique: move.technique,
      resourceCost: uses === 0 ? 0 : move.resourceCost,
      timingProfileId: timing.sourceProfileId,
      timing: effectiveTiming,
      targetTick,
      clashTick,
      ...(computedWindow ? {feasibleWindow:computedWindow} : {}),
      outcomeProfileId: move.outcomeProfileId,
    }];
  });
}

/** Shared by the core, browser and AI: exact planning for a committed input tick. */
function solveInterceptionPlan(
  pending: NonNullable<EncounterState["pending"]>,
  move: NonNullable<CombatCatalog["defenses"][string]>,
  inputTick: number,
  impactTick: number,
): InterceptionPlan | null {
  const spec=move.projectileInterception?.flight;
  const geometry=pending.projectileGeometry;
  if(!spec||!geometry)return null;
  const incomingStart=geometry.incoming.kind==="ballistic"
    ? geometry.incoming.startTick : geometry.incoming.segments[0]!.startTick;
  return planInterception({
    incoming:geometry.incoming,inputTick,
    launchOrigin:geometry.defenderLaunchOrigin,
    targetAtTick: tick=>sampleTrajectory(geometry.attackerPosition,tick).position,
    move:{
      minSpeed:spec.minSpeed,maxSpeed:spec.maxSpeed,
      acceleration:spec.gravity,releaseDelayTicks:spec.releaseDelayTicks,
      earliestClashTick:incomingStart+18,
      latestClashTick:impactTick-30,
      continuationHorizonTicks:900,
      contactRadiusMeters:spec.contactRadiusMeters,
      targetRadiusMeters:spec.targetRadiusMeters,
    },
  });
}
export function getInterceptionPlan(
  state: EncounterState,catalog:CombatCatalog,
  defenseMoveId:string,inputTick:number,
): InterceptionPlan|null {
  const pending=state.pending;
  const move=catalog.defenses[defenseMoveId];
  if(!pending||!move?.projectileInterception?.flight ||
    !pending.projectileGeometry)return null;
  const option=getLegalReactions(state,catalog).find(x=>x.moveId===defenseMoveId);
  if(!option?.feasibleWindow||inputTick<option.feasibleWindow.firstTick||
     inputTick>option.feasibleWindow.lastTick)return null;
  return solveInterceptionPlan(pending,move,inputTick,pending.impactTick);
}

export interface ResolveReactionInput {
  readonly defenderId: CombatantId;
  /** Optional stale-event guard for delayed animation/network adapters. */
  readonly hitId?: string;
  readonly defenseMoveId: string | null;
  readonly reactionTick: number | null;
  readonly resolvedTick: number;
  readonly distanceAtImpactMeters: number;
  /** Omitted = existing actor-targeted behavior (default region). Null = spatial miss. */
  readonly actualRegionId?: string | null;
  /** Explicit projectile/weapon contact outcome from the spatial adapter. */
  readonly contact?: boolean;
  /** Authoritative first swept contact: only legal for ranged contact=true. */
  readonly contactTick?: number;
}

function nextLivingActor(state: EncounterState, currentId: string, actors: Readonly<Record<string, EncounterActor>>): string {
  const order = state.turnOrder;
  const start = order.indexOf(currentId);
  for (let step = 1; step <= order.length; step++) {
    const id = order[(start + step) % order.length]!;
    const actor = actors[id];
    if (actor && actor.hp > 0 && actor.status === "ready") return id;
  }
  // Do not deadlock if the only living actor is stunned; statuses need a separate scheduler in v0.4-B.
  return currentId;
}

/**
 * Explicit turn completion is needed when an actor chooses not to spend all
 * of its possible actions. A move cannot be abandoned midway through impact.
 */
export function endTurn(
  state: EncounterState,
  actorId: CombatantId,
): EncounterState {
  assertDecision(state, actorId);
  const nextId = nextLivingActor(state, actorId, state.actors);
  return transitionTurn(state, state.actors, nextId);
}

/** Authored perfect-reaction counter selected by the incoming and defensive moves. */
function selectPerfectCounter(
  state: EncounterState, catalog: CombatCatalog, defenseMoveId: string,
  incomingMoveId: string, startedTick: number,
): PendingCounter | null {
  const incoming = catalog.attacks[incomingMoveId];
  const defense = catalog.defenses[defenseMoveId];
  if (!incoming || !defense || incoming.counterPolicy?.mode === "deny") return null;
  const counterId = incoming.counterPolicy?.mode === "override"
    ? incoming.counterPolicy.counterId : defense.perfectCounterId;
  if (!counterId) return null;
  const counter = catalog.counters?.[counterId];
  if (!counter) throw new Error("Perfect counter references missing authored move.");
  const pending = state.pending!;
  return {
    id: counter.id,
    attackerId: pending.defenderId,
    defenderId: pending.attackerId,
    startedTick,
    impactTick: startedTick + counter.impactOffsetTicks,
    damage: counter.damage,
    damageType: counter.damageType,
    delivery: counter.delivery,
    presentation: counter.presentation,
  };
}

/**
 * Exactly one reaction-generated counter, resolved on its own authored impact.
 * Counters are not new attack actions and cannot be countered recursively.
 */
export function resolveCounter(
  state: EncounterState,
  resolvedTick: number,
  catalog: CombatCatalog,
): CounterResolution {
  const pending = state.pendingCounter;
  if (!pending) throw new Error("No pending counter.");
  if (!validTick(resolvedTick) || resolvedTick < pending.impactTick) {
    throw new Error("Counter cannot resolve before its impact.");
  }
  const attacker = getActor(state, pending.attackerId);
  const defender = getActor(state, pending.defenderId);
  if (attacker.hp <= 0 || defender.hp <= 0) throw new Error("Counter combatants must be alive.");
  if (!catalog.counters?.[pending.id]) throw new Error("Missing counter definition.");
  const breakdown = resolveRegionDamage({
    attackerId: attacker.id,
    defender,
    moveId: pending.id,
    hitId: "counter-impact",
    baseDamage: pending.damage,
    damageType: pending.damageType,
    targeting: { mode: "actor" },
    intendedRegionId: null,
    actualRegionId: resolveDefaultRegion(defender, catalog),
    reactionMultiplier: 1,
    inReach: true,
    contact: true,
  }, catalog);
  const updatedDefender = { ...defender, hp: defender.hp - breakdown.finalDamage };
  const actors = { ...state.actors, [defender.id]: updatedDefender };
  const remaining = Object.values(actors).filter(actor => actor.hp > 0);
  const complete = remaining.length <= 1;
  return {
    state: {
      ...state, actors, pendingCounter: null,
      phase: complete ? "complete" : state.phase,
      victorId: complete ? remaining[0]?.id ?? null : state.victorId,
      activeActorId: complete ? remaining[0]?.id ?? attacker.id : state.activeActorId,
    },
    outcome: {
      counterId: pending.id,
      attackerId: attacker.id,
      defenderId: defender.id,
      damage: breakdown.finalDamage,
      breakdown,
    },
  };
}

/**
 * Apply damage only when a surviving projectile reaches a combatant.
 * Projectile identity is retained from launch through clash to final impact.
 */
export function resolveProjectileContinuation(
  state: EncounterState,
  input: {
    readonly projectileId: string;
    readonly resolvedTick: number;
    readonly actualRegionId?: string | null;
    readonly contact?: boolean;
    readonly distanceAtImpactMeters: number;
    /** First swept body contact; may precede planned arrival. */
    readonly contactTick?: number;
  },
  catalog: CombatCatalog,
): ProjectileContinuationResolution {
  const pending = state.pendingProjectile;
  if (!pending || pending.projectileId !== input.projectileId) {
    throw new Error("No matching surviving projectile.");
  }
  const gate=input.contactTick ?? pending.impactTick;
  if(input.contactTick!==undefined &&
     (!validTick(input.contactTick) || input.contact!==true ||
      input.contactTick<pending.startedTick || input.contactTick>pending.impactTick)){
    throw new Error("Invalid surviving projectile contact timestamp.");
  }
  if (!validTick(input.resolvedTick) || input.resolvedTick < gate) {
    throw new Error("Surviving projectile has not reached contact or expiry.");
  }
  assertDistance(input.distanceAtImpactMeters);
  const attacker = getActor(state, pending.attackerId);
  const defender = getActor(state, pending.defenderId);
  if (attacker.hp <= 0 || defender.hp <= 0) throw new Error("Projectile combatant defeated.");
  if (pending.targeting.mode === "free_aim" && pending.intendedRegionId !== null &&
      input.actualRegionId === undefined) {
    throw new Error("Free-aim survivor requires an authoritative impact result.");
  }
  const actualRegionId = input.actualRegionId === undefined
    ? resolveDefaultRegion(defender, catalog) : input.actualRegionId;
  const damage = resolveRegionDamage({
    attackerId: attacker.id, defender, moveId: pending.moveId,
    hitId: "survivor:" + pending.projectileId,
    baseDamage: pending.damage, damageType: pending.damageType,
    targeting: pending.targeting, intendedRegionId: pending.intendedRegionId,
    actualRegionId, reactionMultiplier: 1,
    inReach: input.distanceAtImpactMeters <=
      (pending.source === "incoming"
        ? catalog.attacks[pending.moveId]?.reachMeters ?? 36 : 36),
    contact: input.contact !== false,
  }, catalog);
  const actors = {
    ...state.actors,
    [defender.id]: { ...defender, hp: defender.hp - damage.finalDamage },
  };
  const alive = Object.values(actors).filter(actor => actor.hp > 0);
  const complete = alive.length <= 1;
  return {
    state: {
      ...state, actors, pendingProjectile: null,
      phase: complete ? "complete" : state.phase,
      victorId: complete ? alive[0]?.id ?? null : state.victorId,
      activeActorId: complete ? alive[0]?.id ?? attacker.id : state.activeActorId,
    },
    outcome: {
      projectileId: pending.projectileId, source: pending.source,
      attackerId: attacker.id, defenderId: defender.id,
      damage: damage.finalDamage, breakdown: damage,
      contact: input.contact !== false,
    },
  };
}

/**
 * Exactly one authoritative impact, with no user/AI branching.
 * The caller supplies observed distance and input timestamp; the domain
 * validates them against move reach, timing and equipped capabilities.
 */
export function resolveReaction(
  state: EncounterState,
  input: ResolveReactionInput,
  catalog: CombatCatalog,
): ReactionResolution {
  const pending = state.pending;
  if (!pending || state.phase !== "reaction") throw new Error("No pending reaction.");
  if (pending.defenderId !== input.defenderId) throw new Error("Wrong defending combatant.");
  const hit = pending.hits[pending.hitIndex];
  if (!hit || hit.impactTick !== pending.impactTick) throw new Error("Invalid pending hit cursor.");
  if (input.hitId !== undefined && input.hitId !== hit.id) {
    throw new Error("Reaction references a stale or unknown hit ID.");
  }
  if (!validTick(input.resolvedTick)) {
    throw new Error("Attack resolution tick must be valid.");
  }
  if (input.reactionTick !== null && (!validTick(input.reactionTick) ||
      input.reactionTick < pending.startedTick ||
      input.reactionTick > input.resolvedTick)) {
    throw new Error("Invalid reaction input timestamp.");
  }
  assertDistance(input.distanceAtImpactMeters);
  const attack = catalog.attacks[pending.moveId];
  if (!attack) throw new Error("Pending attack move no longer exists.");
  const defender = getActor(state, pending.defenderId);
  const attacker = getActor(state, pending.attackerId);
  let chosen: ReactionOption | undefined;
  if (input.defenseMoveId === null && input.reactionTick !== null) {
    throw new Error("Reaction timestamp requires an equipped defense move.");
  }
  if (input.defenseMoveId !== null) {
    chosen = getLegalReactions(state, catalog).find(option => option.moveId === input.defenseMoveId);
    if (!chosen) throw new Error("Unavailable or illegal defense move.");
    if (input.reactionTick === null) throw new Error("Selected defense requires an input timestamp.");
  }
  const trajectoryPlan = chosen && input.reactionTick!==null
    ? getInterceptionPlan(state,catalog,chosen.moveId,input.reactionTick)
    : null;
  if(chosen?.feasibleWindow && !trajectoryPlan){
    throw new Error("Reaction trajectory is not physically feasible at input time.");
  }
  const grade = chosen
    ? gradeReactionWindow(input.reactionTick! -
      (chosen.technique==="projectile_intercept" ? chosen.targetTick :
        input.contactTick ?? chosen.targetTick), chosen.timing)
    : "miss";
  const isClash = chosen?.technique === "projectile_intercept" &&
    attack.delivery === "ranged_projectile" && grade !== "miss" &&
    catalog.defenses[chosen.moveId]?.projectileInterception !== undefined;
  if(input.contactTick!==undefined &&
     (attack.delivery!=="ranged_projectile" || input.contact!==true ||
      !validTick(input.contactTick) ||
      input.contactTick<pending.startedTick || input.contactTick>pending.impactTick ||
      input.contactTick>input.resolvedTick)){
    throw new Error("Invalid ranged contact tick.");
  }
  const earliestResolution = isClash ?
    trajectoryPlan?.clashTick ?? chosen!.clashTick :
    input.contactTick ?? pending.impactTick;
  if (input.resolvedTick < earliestResolution) {
    throw new Error("Attack cannot resolve before its clash or impact tick.");
  }
  const outcome = chosen ? catalog.outcomes[chosen.outcomeProfileId]! : null;
  const inReach = input.distanceAtImpactMeters <= attack.reachMeters + 0.0001;
  if (!isClash && pending.targeting.mode === "free_aim" &&
      pending.intendedRegionId !== null &&
      defender.anatomyId !== undefined &&
      input.actualRegionId === undefined) {
    throw new Error("Aimed shots require an authoritative impact region or explicit spatial miss.");
  }
  const actualRegionId = isClash ? null : input.actualRegionId === undefined
    ? resolveDefaultRegion(defender, catalog) : input.actualRegionId;
  const rawBreakdown = resolveRegionDamage({
    attackerId: attacker.id,
    defender,
    moveId: pending.moveId,
    hitId: hit.id,
    baseDamage: attack.damage * hit.damageMultiplier,
    damageType: pending.damageType,
    targeting: pending.targeting,
    intendedRegionId: pending.intendedRegionId,
    actualRegionId,
    reactionMultiplier: isClash ? 0 : (outcome?.[grade] ?? 1),
    inReach,
    contact: !isClash && input.contact !== false,
  }, catalog);
  const clash = isClash ? calculateProjectileClash(
    pending, attack, catalog.defenses[chosen!.moveId]!, grade,
    catalog, trajectoryPlan?.clashTick ?? chosen!.clashTick,trajectoryPlan,
  ) : null;
  const breakdown = clash ? {
    ...rawBreakdown, reasons: ["projectile_clash", clash.verdict],
  } : rawBreakdown;
  const damage = breakdown.finalDamage;
  // One shared free first reaction per actor; any later dodge, deflect, or
  // intercept pays the authored cost. Changing technique cannot reset it.
  const defenseCost = chosen?.resourceCost ?? 0;
  const requestedRefund = grade === "perfect" && chosen &&
    (chosen.technique === "weapon_deflect" || chosen.technique === "projectile_intercept")
    ? (catalog.defenses[chosen.moveId]?.perfectEnergyRefund ?? 0) : 0;
  const refundedSoFar = state.turnBudget.perfectRefundUsedByActor[defender.id] ?? 0;
  const refundAllowance = Math.max(0, state.rules.maxPerfectDefenseRefundPerTurn - refundedSoFar);
  const energyRefunded = Math.max(0, Math.min(
    requestedRefund, refundAllowance, defenseCost,
    defender.maxResource - (defender.resource - defenseCost),
  ));
  const updatedDefender: EncounterActor = {
    ...defender,
    hp: Math.max(0, defender.hp - damage),
    resource: defender.resource - defenseCost + energyRefunded,
    cooldownUntilTurn: chosen ? {
      ...defender.cooldownUntilTurn,
      // A zero-turn cooldown permits independent reactions to each combo hit.
      [chosen.moveId]: state.turn +
        (catalog.defenses[chosen.moveId]!.cooldownTurns === 0
          ? 0 : catalog.defenses[chosen.moveId]!.cooldownTurns + 1),
    } : defender.cooldownUntilTurn,
  };
  const actors = { ...state.actors, [defender.id]: updatedDefender };
  const remaining = Object.values(actors).filter(actor => actor.hp > 0);
  const complete = remaining.length <= 1;
  const nextIndex = pending.hitIndex + 1;
  const nextHit = pending.hits[nextIndex];
  const finalHit = !nextHit || complete;
  const budget = energyRefunded > 0
    ? {
      ...state.turnBudget,
      perfectRefundUsedByActor: {
        ...state.turnBudget.perfectRefundUsedByActor,
        [defender.id]: refundedSoFar + energyRefunded,
      },
    }
    : state.turnBudget;
  const continuing: EncounterState = {
    ...state,
    actors,
    turnBudget: budget,
    defenseUsesSinceTurn: chosen ? {
      ...state.defenseUsesSinceTurn,
      [defender.id]: (state.defenseUsesSinceTurn[defender.id] ?? 0) + 1,
    } : state.defenseUsesSinceTurn,
    pending: finalHit ? null : {
      ...pending,
      hitIndex: nextIndex,
      impactTick: nextHit!.impactTick,
    },
  };
  let nextState: EncounterState;
  if (complete) {
    nextState = {
      ...continuing,
      phase: "complete",
      pending: null,
      victorId: remaining[0]?.id ?? null,
      activeActorId: remaining[0]?.id ?? attacker.id,
      turn: state.turn + 1,
    };
  } else if (!finalHit) {
    nextState = continuing;
  } else {
    const completedGain = pending.turnPolicy.energyGainOnCompletion ?? 0;
    // Recovery is awarded once, after the final impact, even on a miss.
    const currentAttacker = continuing.actors[attacker.id]!;
    const updatedAttacker: EncounterActor = {
      ...currentAttacker,
      resource: Math.min(currentAttacker.maxResource, currentAttacker.resource + completedGain),
    };
    const nextActors = {
      ...continuing.actors,
      [attacker.id]: updatedAttacker,
    };
    const afterCompletion = { ...continuing, actors: nextActors };
    if (mayContinueTurn(afterCompletion, pending.turnPolicy)) {
      nextState = {
        ...afterCompletion,
        phase: "decision",
        pending: null,
      };
    } else {
      const nextActor = nextLivingActor(state, attacker.id, nextActors);
      nextState = transitionTurn(afterCompletion, nextActors, nextActor);
    }
  }
  // Only final, successful perfect defenses may produce a retaliation.
  const counter = !isClash && finalHit && !complete && grade === "perfect" && chosen &&
    damage === 0 && inReach && input.contact !== false &&
    !breakdown.reasons.includes("region_miss")
    ? selectPerfectCounter(state, catalog, chosen.moveId, pending.moveId, input.resolvedTick)
    : null;
  if (counter) nextState = { ...nextState, pendingCounter: counter };
  if (clash) nextState = { ...nextState, pendingProjectile: clash.continuation };
  return {
    state: nextState,
    outcome: {
      attackerId: attacker.id,
      defenderId: defender.id,
      hitId: hit.id,
      hitIndex: pending.hitIndex,
      finalHit,
      defenseMoveId: chosen?.moveId ?? null,
      technique: chosen?.technique ?? null,
      grade,
      damage,
      energySpent: defenseCost,
      energyRefunded,
      counter,
      projectileClash: clash,
      breakdown,
      result: clash ? "clash" : !inReach ? "out_of_reach" :
        input.contact === false || breakdown.reasons.includes("region_miss") ? "missed" :
        damage === 0 ? "countered" : "hit",
    },
  };
}
