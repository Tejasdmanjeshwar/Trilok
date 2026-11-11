import type {
  AttackDelivery, CombatCatalog, CombatantId, EncounterActor, EncounterState,
  ReactionOption, ReactionPolicyOverride, ReactionResolution, ReactionTechnique,
  TimingAdjustments, PendingHit, AttackHitSpec, EncounterRules, DamageType,
} from "./encounter-types";
import { validateCombatCatalog } from "./encounter-catalog";
import { gradeReactionWindow, resolveEffectiveTiming, validateTimingAdjustments } from "./encounter-timing";
import { resolveDefaultRegion, resolveRegionDamage, validateActorTargets } from "./encounter-damage";
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
  if (state.phase !== "decision" || state.pending || state.activeActorId !== actorId) {
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
    phase: "decision",
    pending: null,
    victorId: null,
  };
}

/** Domain-authoritative legal equipment options for humans and AI. */
export function getLegalEquipmentSwitches(
  state: EncounterState,
  catalog: CombatCatalog,
  actorId: CombatantId,
): readonly string[] {
  if (state.phase !== "decision" || state.pending || state.activeActorId !== actorId) return [];
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
      state.phase !== "decision" || state.pending !== null) return [];
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
    for (const defenseId of defenseIds) {
      const defense = catalog.defenses[defenseId];
      if (!defense) throw new Error("Equipped defense is absent from the catalog.");
      timingByDefenseId[defenseId] =
        resolveEffectiveTiming(move, defense, catalog, adjustments, hit);
    }
    return {
      id: hit.id,
      impactTick,
      damageMultiplier: hit.damageMultiplier ?? 1,
      timingByDefenseId,
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
  return weapon.defenseMoveIds.flatMap(moveId => {
    const move = catalog.defenses[moveId];
    if (!move) throw new Error("Unknown equipped reaction move.");
    const denied = attack.reactionPolicy?.deny?.includes(move.technique) ?? false;
    const hasException = move.grantsAgainst?.includes(attack.delivery) &&
      attack.reactionPolicy?.mode !== "replace";
    if (denied || (!permitted.has(move.technique) && !hasException) ||
        defender.resource < move.resourceCost ||
        (defender.cooldownUntilTurn[move.id] ?? 0) > state.turn) return [];
    const hit = pending.hits[pending.hitIndex];
    const timing = hit?.timingByDefenseId[move.id];
    if (!timing) throw new Error("Missing snapshotted timing for equipped reaction.");
    return [{
      moveId: move.id,
      technique: move.technique,
      resourceCost: move.resourceCost,
      timingProfileId: timing.sourceProfileId,
      timing,
      outcomeProfileId: move.outcomeProfileId,
    }];
  });
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
  if (!validTick(input.resolvedTick) || input.resolvedTick < pending.impactTick) {
    throw new Error("Attack cannot resolve before its impact tick.");
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
  const grade = chosen
    ? gradeReactionWindow(input.reactionTick! - hit.impactTick, chosen.timing)
    : "miss";
  const outcome = chosen ? catalog.outcomes[chosen.outcomeProfileId]! : null;
  const inReach = input.distanceAtImpactMeters <= attack.reachMeters + 0.0001;
  if (pending.targeting.mode === "free_aim" &&
      pending.intendedRegionId !== null &&
      defender.anatomyId !== undefined &&
      input.actualRegionId === undefined) {
    throw new Error("Aimed shots require an authoritative impact region or explicit spatial miss.");
  }
  const actualRegionId = input.actualRegionId === undefined
    ? resolveDefaultRegion(defender, catalog) : input.actualRegionId;
  const breakdown = resolveRegionDamage({
    attackerId: attacker.id,
    defender,
    moveId: pending.moveId,
    hitId: hit.id,
    baseDamage: attack.damage * hit.damageMultiplier,
    damageType: pending.damageType,
    targeting: pending.targeting,
    intendedRegionId: pending.intendedRegionId,
    actualRegionId,
    reactionMultiplier: outcome?.[grade] ?? 1,
    inReach,
    contact: input.contact !== false,
  }, catalog);
  const damage = breakdown.finalDamage;
  const defenseCost = chosen?.resourceCost ?? 0;
  const requestedRefund = grade === "perfect" && chosen &&
    (chosen.technique === "weapon_deflect" || chosen.technique === "projectile_intercept")
    ? (catalog.defenses[chosen.moveId]?.perfectEnergyRefund ?? 0) : 0;
  const refundedSoFar = state.turnBudget.perfectRefundUsedByActor[defender.id] ?? 0;
  const refundAllowance = Math.max(0, state.rules.maxPerfectDefenseRefundPerTurn - refundedSoFar);
  const energyRefunded = Math.max(0, Math.min(
    requestedRefund, refundAllowance,
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
      energyRefunded,
      breakdown,
      result: !inReach ? "out_of_reach" :
        input.contact === false || breakdown.reasons.includes("region_miss") ? "missed" :
        damage === 0 ? "countered" : "hit",
    },
  };
}
