import type {
  AttackHitSpec, AttackSpec, CombatCatalog, DefenseSpec,
  EffectiveTimingProfile, ReactionGradeV2, TimingAdjustments, TimingProfile,
} from "./encounter-types";

/** Validates a reusable authored reaction profile (integer simulation ticks). */
export function validateTimingProfile(profile: TimingProfile): void {
  for (const value of [profile.earlyTicks, profile.lateTicks, profile.perfectTicks, profile.goodTicks]) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
      throw new Error("Timing profile must contain nonnegative integer ticks within 10000.");
    }
  }
  if (profile.perfectTicks > profile.goodTicks ||
      profile.goodTicks > Math.max(profile.earlyTicks, profile.lateTicks)) {
    throw new Error("Timing grade thresholds exceed the accepted window.");
  }
}

export function validateTimingAdjustments(adjustments: TimingAdjustments): void {
  const scale = adjustments.windowScale ?? 1;
  if (!Number.isFinite(scale) || scale < 0.5 || scale > 2) {
    throw new Error("Reaction window scale must be between 0.5 and 2.");
  }
  for (const modifier of [adjustments.earlyBonusTicks ?? 0, adjustments.lateBonusTicks ?? 0]) {
    if (!Number.isSafeInteger(modifier) || modifier < -250 || modifier > 250) {
      throw new Error("Reaction timing bonuses must be integer ticks between -250 and 250.");
    }
  }
}

/**
 * Single source of truth for timing selection: delivery default → attack move
 * override → hit override → defender move override → bounded modifiers.
 *
 * A profile is resolved when an attack starts and captured for each hit.
 * No render frame rate, DOM or browser clock dependencies.
 */
export function resolveEffectiveTiming(
  attack: AttackSpec,
  defense: DefenseSpec,
  catalog: CombatCatalog,
  adjustments: TimingAdjustments = {},
  hit?: AttackHitSpec,
): EffectiveTimingProfile {
  validateTimingAdjustments(adjustments);
  const technique = defense.technique;
  const profileId = defense.timingOverrideProfileId ??
    hit?.timingProfileOverrides?.[technique] ??
    attack.timingProfileOverrides?.[technique] ??
    catalog.reactionTimingDefaults?.[attack.delivery]?.[technique] ??
    defense.timingProfileId;
  const authored = catalog.timings[profileId];
  if (!authored) throw new Error("Unknown effective reaction timing profile: " + profileId);
  validateTimingProfile(authored);
  const scale = adjustments.windowScale ?? 1;
  const earlyTicks = Math.max(0, Math.round(authored.earlyTicks * scale) + (adjustments.earlyBonusTicks ?? 0));
  const lateTicks = Math.max(0, Math.round(authored.lateTicks * scale) + (adjustments.lateBonusTicks ?? 0));
  const limit = Math.max(earlyTicks, lateTicks);
  const goodTicks = Math.min(limit, Math.round(authored.goodTicks * scale));
  const result: EffectiveTimingProfile = {
    sourceProfileId: profileId,
    earlyTicks, lateTicks,
    perfectTicks: Math.min(goodTicks, Math.round(authored.perfectTicks * scale)),
    goodTicks,
  };
  validateTimingProfile(result);
  return result;
}

/**
 * A reaction is graded relative to its specific hit's impact marker.
 * "Good" is a timing grade, never a synonym for choosing parry.
 */
export function gradeReactionWindow(
  offsetTicks: number | null,
  profile: TimingProfile,
): ReactionGradeV2 {
  if (offsetTicks === null || !Number.isFinite(offsetTicks) ||
      offsetTicks < -profile.earlyTicks || offsetTicks > profile.lateTicks) {
    return "miss";
  }
  const absolute = Math.abs(offsetTicks);
  if (absolute <= profile.perfectTicks) return "perfect";
  if (absolute <= profile.goodTicks) return "good";
  return "partial";
}
