import type {
  AttackTurnPolicy, EncounterActor, EncounterRules, EncounterState,
  TurnBudget,
} from "./encounter-types";

/** Existing one-action encounters keep their exact turn behavior during migration. */
export const LEGACY_ENCOUNTER_RULES: EncounterRules = {
  maxActionsPerTurn: 1,
  energyRegenPerTurn: 0,
  maxPerfectDefenseRefundPerTurn: 0,
};

/** Opt-in v0.4-A.2 tuning; the web adapter will adopt it in v0.4-B. */
export const STANDARD_ENCOUNTER_RULES: EncounterRules = {
  maxActionsPerTurn: 3,
  energyRegenPerTurn: 1,
  maxPerfectDefenseRefundPerTurn: 2,
};

function boundedInteger(value: number, maximum: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error("Invalid " + label + ".");
  }
}

export function validateEncounterRules(rules: EncounterRules): void {
  boundedInteger(rules.maxActionsPerTurn, 16, "maximum actions per turn");
  if (rules.maxActionsPerTurn === 0) throw new Error("A turn must permit at least one attack.");
  boundedInteger(rules.energyRegenPerTurn, 100, "turn Energy regeneration");
  boundedInteger(rules.maxPerfectDefenseRefundPerTurn, 20, "perfect defense refund limit");
}

export function validateAttackTurnPolicy(policy: AttackTurnPolicy): void {
  if (policy.continuation !== "continue" && policy.continuation !== "end") {
    throw new Error("Unknown attack turn continuation.");
  }
  if (policy.maxUsesPerTurn !== undefined) {
    boundedInteger(policy.maxUsesPerTurn, 16, "per-move use limit");
    if (policy.maxUsesPerTurn === 0) throw new Error("Move use limit must be positive.");
  }
  if (policy.energyGainOnCompletion !== undefined) {
    boundedInteger(policy.energyGainOnCompletion, 100, "Energy gain on completion");
    if (policy.energyGainOnCompletion > 0 && policy.continuation !== "end") {
      throw new Error("Energy-recovery moves must end the turn.");
    }
  }
}

/** No mutable references shared across turns. */
export function emptyTurnBudget(): TurnBudget {
  return { actionsUsed: 0, moveUses: {}, perfectRefundUsedByActor: {} };
}

export function recordAttackAction(budget: TurnBudget, moveId: string): TurnBudget {
  return {
    ...budget,
    actionsUsed: budget.actionsUsed + 1,
    moveUses: { ...budget.moveUses, [moveId]: (budget.moveUses[moveId] ?? 0) + 1 },
  };
}

export function mayContinueTurn(
  state: EncounterState,
  policy: AttackTurnPolicy,
): boolean {
  return policy.continuation === "continue" &&
    state.turnBudget.actionsUsed < state.rules.maxActionsPerTurn;
}

/** Called exactly once on a real actor transition (never per hit). */
export function transitionTurn(
  state: EncounterState,
  actors: Readonly<Record<string, EncounterActor>>,
  nextActorId: string,
): EncounterState {
  const next = actors[nextActorId];
  if (!next || next.hp <= 0) throw new Error("Cannot advance turn to defeated actor.");
  const regenerated: EncounterActor = {
    ...next,
    resource: Math.min(next.maxResource, next.resource + state.rules.energyRegenPerTurn),
  };
  return {
    ...state,
    actors: { ...actors, [nextActorId]: regenerated },
    activeActorId: nextActorId,
    turn: state.turn + 1,
    turnBudget: emptyTurnBudget(),
    phase: "decision",
    pending: null,
  };
}
