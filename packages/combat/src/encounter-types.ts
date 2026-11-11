/** Immutable, renderer-agnostic combat contracts shared by players and AI. */
export type AttackDelivery = "melee_contact" | "ranged_projectile" | "area";
export type ReactionTechnique = "dodge" | "weapon_deflect" | "projectile_intercept";
export type ReactionGradeV2 = "perfect" | "good" | "partial" | "miss";
export type CombatantId = string;

export interface ReactionPolicyOverride {
  /** Inherit intersects defaults, extend unions, replace overrides defaults. */
  readonly mode?: "inherit" | "extend" | "replace";
  readonly allow?: readonly ReactionTechnique[];
  /** Explicit deny takes precedence over allow. */
  readonly deny?: readonly ReactionTechnique[];
}

/** A hit has a stable identity and independent reaction resolution. */
export interface AttackHitSpec {
  readonly id: string;
  readonly offsetTicks: number;
  readonly damageMultiplier?: number;
  /** Optional timing replacement for this individual hit. */
  readonly timingProfileOverrides?: Partial<Record<ReactionTechnique, string>>;
}

export interface AttackSpec {
  readonly id: string;
  readonly delivery: AttackDelivery;
  readonly damage: number;
  readonly reachMeters: number;
  /** Selection range: movement must reach real weapon range by contact. */
  readonly engageRangeMeters: number;
  /** Legacy single-hit timestamp; used only when hits is omitted. */
  readonly impactOffsetTicks: number;
  /** One or more strictly increasing authored impact markers. */
  readonly hits?: readonly AttackHitSpec[];
  /** Per-technique move-level timing overrides, layered over delivery defaults. */
  readonly timingProfileOverrides?: Partial<Record<ReactionTechnique, string>>;
  readonly resourceCost: number;
  readonly reactionPolicy?: ReactionPolicyOverride;
}

export interface DefenseSpec {
  readonly id: string;
  readonly technique: ReactionTechnique;
  readonly resourceCost: number;
  readonly cooldownTurns: number;
  /** Backwards-compatible fallback when catalog has no delivery × technique profile. */
  readonly timingProfileId: string;
  /** Defense-move-specific timing replacement, applied after attack's override. */
  readonly timingOverrideProfileId?: string;
  readonly outcomeProfileId: string;
  readonly grantsAgainst?: readonly AttackDelivery[];
}

export interface EquipmentSpec {
  readonly id: string;
  readonly label: string;
  readonly attackMoveIds: readonly string[];
  readonly defenseMoveIds: readonly string[];
  readonly switchCost: number;
}

/** Explicit asymmetric reaction window, measured from the impact marker. */
export interface TimingProfile {
  readonly earlyTicks: number;
  readonly lateTicks: number;
  readonly perfectTicks: number;
  readonly goodTicks: number;
}

/** Snapshot computed once when the attack is queued; not re-evaluated on impact. */
export interface EffectiveTimingProfile extends TimingProfile {
  readonly sourceProfileId: string;
}

/** Integer-tick modifiers supplied by difficulty/accessibility/actor statuses. */
export interface TimingAdjustments {
  /** 1 = normal, 1.4 = 40% wider accepted/grade windows. Bound to 0.5–2. */
  readonly windowScale?: number;
  /** Additional accepted early/late ticks; validated to -250..250. */
  readonly earlyBonusTicks?: number;
  readonly lateBonusTicks?: number;
}

/** Damage multipliers; attack supplies base damage. */
export type OutcomeProfile = Readonly<Record<ReactionGradeV2, number>>;

export interface CombatCatalog {
  readonly equipment: Readonly<Record<string, EquipmentSpec>>;
  readonly attacks: Readonly<Record<string, AttackSpec>>;
  readonly defenses: Readonly<Record<string, DefenseSpec>>;
  readonly timings: Readonly<Record<string, TimingProfile>>;
  /** Optional delivery × technique defaults; defense fallback supports older catalogs. */
  readonly reactionTimingDefaults?: Partial<Record<AttackDelivery, Partial<Record<ReactionTechnique, string>>>>;
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

export interface PendingHit {
  readonly id: string;
  readonly impactTick: number;
  readonly damageMultiplier: number;
  /** Snapshots keyed by equipped defense move ID, independent of frame rate. */
  readonly timingByDefenseId: Readonly<Record<string, EffectiveTimingProfile>>;
}

export interface PendingAttack {
  readonly attackerId: CombatantId;
  readonly defenderId: CombatantId;
  readonly moveId: string;
  readonly startedTick: number;
  /** Current unresolved hit; kept for convenient browser adapters. */
  readonly impactTick: number;
  readonly hitIndex: number;
  readonly hits: readonly PendingHit[];
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
  readonly timing: EffectiveTimingProfile;
  readonly outcomeProfileId: string;
}

export interface ReactionResolution {
  readonly state: EncounterState;
  readonly outcome: {
    readonly attackerId: string;
    readonly defenderId: string;
    readonly hitId: string;
    readonly hitIndex: number;
    readonly finalHit: boolean;
    readonly defenseMoveId: string | null;
    readonly technique: ReactionTechnique | null;
    readonly grade: ReactionGradeV2;
    readonly damage: number;
    readonly result: "hit" | "countered" | "out_of_reach";
  };
}
