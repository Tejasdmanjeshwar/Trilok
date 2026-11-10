/** Renderer-agnostic combat contracts for symmetric player/NPC encounters. */
export type AttackDelivery = "melee_contact" | "ranged_projectile" | "area";
export type ReactionTechnique = "dodge" | "weapon_deflect" | "projectile_intercept";
export type ReactionGradeV2 = "perfect" | "good" | "partial" | "miss";
export type CombatantId = string;

export interface ReactionPolicyOverride {
  /** inherit intersects the defaults; extend unions; replace discards defaults. */
  readonly mode?: "inherit" | "extend" | "replace";
  readonly allow?: readonly ReactionTechnique[];
  /** Deny always takes precedence over allow. */
  readonly deny?: readonly ReactionTechnique[];
}

export interface AttackSpec {
  readonly id: string;
  readonly delivery: AttackDelivery;
  readonly damage: number;
  readonly reachMeters: number;
  /** Upper bound at action selection; movement must reach weapon range by impact. */
  readonly engageRangeMeters: number;
  /** Milliseconds/ticks from attack start until contact. */
  readonly impactOffsetTicks: number;
  readonly resourceCost: number;
  readonly reactionPolicy?: ReactionPolicyOverride;
}

export interface DefenseSpec {
  readonly id: string;
  readonly technique: ReactionTechnique;
  readonly resourceCost: number;
  readonly cooldownTurns: number;
  readonly timingProfileId: string;
  readonly outcomeProfileId: string;
  /** A move can explicitly counter additional delivery types. */
  readonly grantsAgainst?: readonly AttackDelivery[];
}

export interface EquipmentSpec {
  readonly id: string;
  readonly label: string;
  readonly attackMoveIds: readonly string[];
  readonly defenseMoveIds: readonly string[];
  readonly switchCost: number;
}

export interface TimingProfile {
  readonly perfectTicks: number;
  readonly goodTicks: number;
  readonly partialTicks: number;
  readonly lateGraceTicks: number;
}

/** Damage multipliers; the attacker supplies base damage, not the defense. */
export type OutcomeProfile = Readonly<Record<ReactionGradeV2, number>>;

export interface CombatCatalog {
  readonly equipment: Readonly<Record<string, EquipmentSpec>>;
  readonly attacks: Readonly<Record<string, AttackSpec>>;
  readonly defenses: Readonly<Record<string, DefenseSpec>>;
  readonly timings: Readonly<Record<string, TimingProfile>>;
  readonly outcomes: Readonly<Record<string, OutcomeProfile>>;
}

export interface EncounterActor {
  readonly id: CombatantId;
  readonly hp: number;
  readonly maxHp: number;
  readonly resource: number;
  readonly maxResource: number;
  readonly equippedId: string;
  readonly loadoutIds: readonly string[];
  readonly status: "ready" | "stunned";
  readonly cooldownUntilTurn: Readonly<Record<string, number>>;
  readonly switchedOnTurn: number | null;
}

export interface PendingAttack {
  readonly attackerId: CombatantId;
  readonly defenderId: CombatantId;
  readonly moveId: string;
  readonly startedTick: number;
  readonly impactTick: number;
}

export interface EncounterState {
  readonly actors: Readonly<Record<CombatantId, EncounterActor>>;
  readonly turnOrder: readonly CombatantId[];
  readonly turn: number;
  readonly activeActorId: CombatantId;
  readonly phase: "decision" | "reaction" | "complete";
  readonly pending: PendingAttack | null;
  readonly victorId: CombatantId | null;
}

export interface ReactionOption {
  readonly moveId: string;
  readonly technique: ReactionTechnique;
  readonly resourceCost: number;
  readonly timingProfileId: string;
  readonly outcomeProfileId: string;
}

export interface ReactionResolution {
  readonly state: EncounterState;
  readonly outcome: {
    readonly attackerId: string;
    readonly defenderId: string;
    readonly defenseMoveId: string | null;
    readonly technique: ReactionTechnique | null;
    readonly grade: ReactionGradeV2;
    readonly damage: number;
    readonly result: "hit" | "countered" | "out_of_reach";
  };
}
