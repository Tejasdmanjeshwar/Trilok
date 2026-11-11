import type {
  AttackDelivery, CombatCatalog, CombatantId, EncounterActor, EncounterState,
  ReactionOption, ReactionPolicyOverride, ReactionResolution, ReactionTechnique,
  TimingAdjustments, PendingHit, AttackHitSpec,
} from "./encounter-types";
import { validateCombatCatalog } from "./encounter-catalog";
import { gradeReactionWindow, resolveEffectiveTiming, validateTimingAdjustments } from "./encounter-timing";
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
): EncounterState {
  validateCombatCatalog(catalog);
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
    if (actor.switchedOnTurn !== null && !validTick(actor.switchedOnTurn)) {
      throw new Error("Invalid last-switch turn.");
    }
    map[actor.id] = {
      ...actor,
      loadoutIds: [...actor.loadoutIds],
      cooldownUntilTurn: { ...actor.cooldownUntilTurn },
    };
  }
  if (!ids.has(activeActorId)) throw new Error("Unknown initial combatant.");
  return {
    actors: map,
    turnOrder: actors.map(actor => actor.id),
    turn: 1,
    activeActorId,
    phase: "decision",
    pending: null,
    victorId: null,
  };
}

export function equipCombatant(
  state: EncounterState,
  actorId: string,
  equipmentId: string,
  catalog: CombatCatalog,
): EncounterState {
  const actor = assertDecision(state, actorId);
  if (!actor.loadoutIds.includes(equipmentId) || !catalog.equipment[equipmentId]) {
    throw new Error("Equipment is not in the combatant's loadout.");
  }
  if (actor.equippedId === equipmentId) return state;
  if (actor.switchedOnTurn === state.turn) throw new Error("Already switched equipment this turn.");
  const cost = catalog.equipment[equipmentId]!.switchCost;
  if (actor.resource < cost) throw new Error("Insufficient resources for equipment switch.");
  return withActor(state, {
    ...actor, equippedId: equipmentId, resource: actor.resource - cost,
    switchedOnTurn: state.turn,
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
  const equipment = catalog.equipment[attacker.equippedId];
  const move = catalog.attacks[input.moveId];
  if (!equipment || !move || !equipment.attackMoveIds.includes(move.id)) {
    throw new Error("Attack move is not equipped.");
  }
  if (input.distanceAtStartMeters > move.engageRangeMeters) {
    throw new Error("Target is too far to engage.");
  }
  if (attacker.resource < move.resourceCost) throw new Error("Insufficient attack resources.");
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
    phase: "reaction",
    pending: {
      attackerId: input.attackerId,
      defenderId: input.defenderId,
      moveId: input.moveId,
      startedTick: input.startedTick,
      hitIndex: 0,
      hits,
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
  const damage = inReach
    ? Math.min(defender.hp, Math.round(attack.damage * hit.damageMultiplier * (outcome?.[grade] ?? 1)))
    : 0;
  const updatedDefender: EncounterActor = {
    ...defender,
    hp: Math.max(0, defender.hp - damage),
    resource: defender.resource - (chosen?.resourceCost ?? 0),
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
  const nextState: EncounterState = {
    ...state,
    actors,
    turn: finalHit ? state.turn + 1 : state.turn,
    activeActorId: finalHit && !complete
      ? nextLivingActor(state, attacker.id, actors)
      : complete ? (remaining[0]?.id ?? attacker.id) : state.activeActorId,
    phase: complete ? "complete" : finalHit ? "decision" : "reaction",
    pending: finalHit ? null : {
      ...pending,
      hitIndex: nextIndex,
      impactTick: nextHit!.impactTick,
    },
    victorId: complete ? (remaining[0]?.id ?? null) : null,
  };
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
      result: !inReach ? "out_of_reach" : damage === 0 ? "countered" : "hit",
    },
  };
}
