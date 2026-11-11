import type { ProjectileTrajectory, Vector3, InterceptionWindow, InterceptionPlan } from "./projectile-motion";
/** Immutable, renderer-agnostic combat contracts shared by players and AI. */
export type AttackDelivery = "melee_contact" | "ranged_projectile" | "area";
export type ReactionTechnique = "dodge" | "weapon_deflect" | "projectile_intercept";
export type ReactionGradeV2 = "perfect" | "good" | "partial" | "miss";
export type OffenseGrade = "perfect" | "good" | "miss";

/** Authored, deterministic, one-input offensive timing. */
export interface OffensiveTimingSpec {
  readonly targetOffsetTicks: number;
  readonly goodWindowTicks: number;
  readonly perfectWindowTicks: number;
  readonly goodBonus: number;
  readonly perfectBonus: number;
  readonly chainBonusPerHit: number;
  readonly maxChain: number;
}

export type CombatantId = string;
export type DamageType = "pierce" | "slash" | "blunt" | "divine";
export type TargetMode = "actor" | "free_aim";
export type RegionExposure = "exposed" | "protected" | "hidden";

export interface TargetRegionSpec {
  readonly id: string;
  readonly vulnerabilityMultiplier: number;
  readonly criticalEligible: boolean;
  readonly staggerMultiplier?: number;
}
export interface AnatomySpec {
  readonly id: string;
  readonly defaultRegionId: string;
  readonly regions: Readonly<Record<string, TargetRegionSpec>>;
}
export interface ArmorCoverageSpec {
  readonly regionId: string;
  readonly protection: number;
  readonly damageTypeModifiers?: Partial<Record<DamageType, number>>;
  readonly suppressesCritical?: boolean;
}
export interface ArmorSpec {
  readonly id: string;
  readonly label: string;
  readonly coverage: readonly ArmorCoverageSpec[];
}
export interface TargetingSpec {
  readonly mode: TargetMode;
  readonly precisionCriticalMultiplier?: number;
}
export interface DamageBreakdown {
  readonly attackerId: CombatantId;
  readonly defenderId: CombatantId;
  readonly moveId: string;
  readonly hitId: string;
  readonly intendedRegionId: string | null;
  readonly actualRegionId: string | null;
  readonly damageType: DamageType;
  readonly baseDamage: number;
  readonly reactionMultiplier: number;
  readonly vulnerabilityMultiplier: number;
  readonly armorMultiplier: number;
  readonly armorAbsorbed: number;
  readonly critical: boolean;
  readonly criticalMultiplier: number;
  readonly stagger: number;
  readonly finalDamage: number;
  readonly offenseGrade?: OffenseGrade;
  readonly offenseMultiplier?: number;
  readonly reasons: readonly string[];
}

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

/** Whether a finished attack preserves control of the current actor. */
export type TurnContinuation = "continue" | "end";

export interface AttackTurnPolicy {
  readonly continuation: TurnContinuation;
  /** Optional per-turn move cap, separate from the global action budget. */
  readonly maxUsesPerTurn?: number;
  readonly firstActionOnly?: boolean;
  readonly freeAction?: boolean;
  /** Awarded once when the full attack completes; recovery moves must end the turn. */
  readonly energyGainOnCompletion?: number;
}

export interface EncounterRules {
  /** Maximum attacks per actor turn, independent from remaining Energy. */
  readonly maxActionsPerTurn: number;
  /** Credited only at the start of an actor's next own turn. */
  readonly energyRegenPerTurn: number;
  /** Combined cap on perfect-defense Energy refunds per combat turn. */
  readonly maxPerfectDefenseRefundPerTurn: number;
}

/** Current actor's budget; tracked separately from each actor's Energy pool. */
export interface TurnBudget {
  readonly actionsUsed: number;
  readonly rhythmChain: number;
  readonly moveUses: Readonly<Record<string, number>>;
  /** A defender may refund at most the global cap across a full combo/turn. */
  readonly perfectRefundUsedByActor: Readonly<Record<CombatantId, number>>;
}

/** Presentation effects are event requests, not damage or status implementations.
 * A future status system can subscribe to the same confirmed hit event. */
export interface ImpactEffectSpec {
  readonly id: string;
  readonly when: "damage" | "critical";
}
/** AI-readable authored patterns; only actual hit markers deal damage. */
export interface AttackPatternSpec {
  readonly kind: "flurry" | "feint" | "delayed";
  readonly feintAtTicks?: readonly number[];
  readonly swingLeadTicks?: number;
}
export interface AttackSpec {
  readonly id: string;
  readonly delivery: AttackDelivery;
  readonly damage: number;
  readonly damageType?: DamageType;
  readonly targeting?: TargetingSpec;
  readonly reachMeters: number;
  /** Selection range: movement must reach real weapon range by contact. */
  readonly engageRangeMeters: number;
  /** Legacy single-hit timestamp; used only when hits is omitted. */
  readonly impactOffsetTicks: number;
  /** One or more strictly increasing authored impact markers. */
  readonly hits?: readonly AttackHitSpec[];
  /** Per-technique move-level timing overrides, layered over delivery defaults. */
  readonly timingProfileOverrides?: Partial<Record<ReactionTechnique, string>>;
  /** Cost is paid once at action commitment, not per authored hit. */
  readonly resourceCost: number;
  readonly offensiveTiming?: OffensiveTimingSpec;
  /** Absent policy is legacy end-turn behavior. */
  readonly turnPolicy?: AttackTurnPolicy;
  readonly reactionPolicy?: ReactionPolicyOverride;
  readonly counterPolicy?: CounterPolicy;
  /** Resistance in a ranged-vs-ranged clash (positive authored value). */
  readonly projectilePower?: number;
  /** Data-driven visual reactions; e.g. blood, lodged arrow, burn, freeze. */
  readonly impactEffects?: readonly ImpactEffectSpec[];
  readonly pattern?: AttackPatternSpec;
}

/** A pre-authored automatic retaliation. It cannot itself be defended or countered. */
export interface CounterSpec {
  readonly id: string;
  readonly delivery: AttackDelivery;
  readonly damage: number;
  readonly damageType: DamageType;
  readonly impactOffsetTicks: number;
  readonly presentation: "bow_shot" | "sword_riposte";
}
/** Move-level override applied *after* the equipped defense's authored counter. */
export interface CounterPolicy {
  readonly mode: "allow" | "deny" | "override";
  /** Required when mode=override; references CombatCatalog.counters. */
  readonly counterId?: string;
}

/** Authored projectile-versus-projectile defensive attack. */
export interface ProjectileInterceptionSpec {
  /** Intrinsic strength of the defending projectile. */
  readonly power: number;
  /** Input is timed this many ticks BEFORE the incoming projectile's hit. */
  readonly launchLeadTicks: number;
  /** Collision occurs this many ticks before the incoming contact marker. */
  readonly clashLeadTicks: number;
  /** Time for surviving interception projectile to reach original attacker. */
  readonly continuationTicks: number;
  /** Base continuation damage when the intercepting projectile survives. */
  readonly continuationDamage: number;
  /** Difference considered a mutual-destruction collision. */
  readonly deadband?: number;
  /** Per-move grades determine power; stronger moves can overpower on good. */
  readonly gradePower?: Partial<Record<ReactionGradeV2, number>>;
  /** Optional physically solved interception, replacing fixed lead ticks. */
  readonly flight?: {
    readonly minSpeed: number;
    readonly maxSpeed: number;
    readonly releaseDelayTicks: number;
    readonly gravity: Vector3;
    readonly contactRadiusMeters: number;
    readonly targetRadiusMeters: number;
  };
}

export interface DefenseSpec {
  readonly id: string;
  readonly technique: ReactionTechnique;
  readonly resourceCost: number;
  /** Granted only for perfect weapon deflection / projectile interception. */
  readonly perfectEnergyRefund?: number;
  readonly cooldownTurns: number;
  /** Backwards-compatible fallback when catalog has no delivery × technique profile. */
  readonly timingProfileId: string;
  /** Defense-move-specific timing replacement, applied after attack's override. */
  readonly timingOverrideProfileId?: string;
  readonly outcomeProfileId: string;
  readonly grantsAgainst?: readonly AttackDelivery[];
  /** Only perfect and successful matching defenses can schedule this. */
  readonly perfectCounterId?: string;
  readonly projectileInterception?: ProjectileInterceptionSpec;
  /** Optional effects on a surviving defensive projectile's impact. */
  readonly impactEffects?: readonly ImpactEffectSpec[];
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
  readonly counters?: Readonly<Record<string, CounterSpec>>;
  readonly anatomies?: Readonly<Record<string, AnatomySpec>>;
  readonly armor?: Readonly<Record<string, ArmorSpec>>;
}

export interface EncounterActor {
  readonly id: CombatantId;
  readonly hp: number;
  readonly maxHp: number;
  readonly resource: number;
  readonly maxResource: number;
  readonly equippedId: string;
  readonly loadoutIds: readonly string[];
  readonly anatomyId?: string;
  readonly equippedArmorIds?: readonly string[];
  readonly regionExposure?: Readonly<Record<string, RegionExposure>>;
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
  readonly interceptionWindows?: Readonly<Record<string, InterceptionWindow>>;
}

/** Pure immutable snapshots; no Three.js objects or runtime functions. */
export interface ProjectileAttackGeometry {
  readonly incoming: ProjectileTrajectory;
  readonly defenderLaunchOrigin: Vector3;
  /** Original attacker position, optionally predicted with piecewise guidance. */
  readonly attackerPosition: ProjectileTrajectory;
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
  /** Snapshotted policy prevents authored content edits mid-attack. */
  readonly turnPolicy: AttackTurnPolicy;
  readonly targeting: TargetingSpec;
  readonly intendedRegionId: string | null;
  readonly damageType: DamageType;
  readonly projectileGeometry?: ProjectileAttackGeometry;
  readonly offense?: {
    readonly policy: OffensiveTimingSpec;
    readonly grade: OffenseGrade | null;
    readonly inputTick: number | null;
    readonly connected: boolean;
  };
}

export type ProjectileClashVerdict =
  | "incoming_survives" | "interceptor_survives" | "mutual_destruction";
export interface ProjectileClash {
  readonly incomingProjectileId: string;
  readonly interceptorProjectileId: string;
  readonly attackerId: CombatantId;
  readonly interceptorId: CombatantId;
  readonly incomingMoveId: string;
  readonly defenseMoveId: string;
  readonly clashTick: number;
  readonly incomingPower: number;
  readonly interceptorPower: number;
  readonly remainingPower: number;
  readonly verdict: ProjectileClashVerdict;
  readonly survivingProjectileId: string | null;
  readonly continuation: PendingProjectileContinuation | null;
  /** The collision itself is generated by a feasible dual-trajectory plan. */
  readonly interceptionPlan?: InterceptionPlan;
}
/** Projectile identity is carried across a clash; NO second arrow is spawned. */
export interface PendingProjectileContinuation {
  readonly projectileId: string;
  readonly source: "incoming" | "interceptor";
  readonly attackerId: CombatantId;
  readonly defenderId: CombatantId;
  readonly moveId: string;
  readonly startedTick: number;
  readonly impactTick: number;
  readonly damage: number;
  readonly damageType: DamageType;
  readonly targeting: TargetingSpec;
  readonly intendedRegionId: string | null;
  readonly trajectory?: ProjectileTrajectory;
}

export interface ProjectileContinuationResolution {
  readonly state: EncounterState;
  readonly outcome: {
    readonly projectileId: string;
    readonly source: PendingProjectileContinuation["source"];
    readonly attackerId: CombatantId;
    readonly defenderId: CombatantId;
    readonly damage: number;
    readonly breakdown: DamageBreakdown;
    readonly contact: boolean;
  };
}

export interface PendingCounter {
  readonly id: string;
  /** Original defender automatically retaliates against original attacker. */
  readonly attackerId: CombatantId;
  readonly defenderId: CombatantId;
  readonly startedTick: number;
  readonly impactTick: number;
  readonly damage: number;
  readonly damageType: DamageType;
  readonly delivery: AttackDelivery;
  readonly presentation: CounterSpec["presentation"];
}

export interface EncounterState {
  readonly actors: Readonly<Record<CombatantId, EncounterActor>>;
  readonly turnOrder: readonly CombatantId[];
  readonly turn: number;
  readonly activeActorId: CombatantId;
  readonly rules: EncounterRules;
  readonly turnBudget: TurnBudget;
  /** Defensive uses per actor since their last own turn; shared across dodge/parry/intercept. */
  readonly defenseUsesSinceTurn: Readonly<Record<CombatantId, number>>;
  readonly phase: "decision" | "reaction" | "complete";
  readonly pending: PendingAttack | null;
  readonly pendingCounter: PendingCounter | null;
  readonly pendingProjectile: PendingProjectileContinuation | null;
  readonly victorId: CombatantId | null;
}

export interface ReactionOption {
  readonly moveId: string;
  readonly technique: ReactionTechnique;
  readonly resourceCost: number;
  readonly timingProfileId: string;
  readonly timing: EffectiveTimingProfile;
  /** Collision event (only for projectile interception), otherwise hit impact. */
  readonly clashTick: number;
  /** Aim/fire moment; interception can precede contact by authored lead time. */
  readonly targetTick: number;
  readonly outcomeProfileId: string;
  readonly feasibleWindow?: InterceptionWindow;
}

export interface CounterResolution {
  readonly state: EncounterState;
  readonly outcome: {
    readonly counterId: string;
    readonly attackerId: CombatantId;
    readonly defenderId: CombatantId;
    readonly damage: number;
    readonly breakdown: DamageBreakdown;
  };
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
    readonly energySpent: number;
    readonly energyRefunded: number;
    /** Queued automatic retaliation; damage is applied at its own impact marker. */
    readonly counter: PendingCounter | null;
    readonly projectileClash: ProjectileClash | null;
    readonly breakdown: DamageBreakdown;
    readonly result: "hit" | "countered" | "clash" | "out_of_reach" | "missed";
  };
}
