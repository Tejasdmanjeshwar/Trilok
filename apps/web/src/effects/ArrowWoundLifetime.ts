import type { DamageBreakdown } from "@trilok/combat";

export type ArrowWoundSeverity = "minor" | "deep" | "severe";
export interface ArrowWoundLifetime {
  readonly severity: ArrowWoundSeverity;
  /** Null retains the original lodged arrow until encounter reset/disposal. */
  readonly turns: number | null;
}
export interface ArrowWoundRules {
  readonly deepDamage: number;
  readonly severeDamage: number;
  readonly minorTurns: number;
  readonly deepTurns: number;
}
export const DEFAULT_ARROW_WOUND_RULES: Readonly<ArrowWoundRules> = Object.freeze({
  deepDamage: 12, severeDamage: 24, minorTurns: 2, deepTurns: 3,
});

/**
 * Visual persistence policy, based only on resolved combat facts.
 * It does not modify HP, hit probability, damage or status effects.
 * Authored thresholds can be replaced without changing projectile rendering.
 */
export function arrowWoundLifetime(
  damage: DamageBreakdown,
  rules: ArrowWoundRules = DEFAULT_ARROW_WOUND_RULES,
): ArrowWoundLifetime {
  if (!Number.isFinite(damage.finalDamage) || damage.finalDamage <= 0)
    throw new Error("Only confirmed damaging hits can leave lodged arrows.");
  if (!Number.isFinite(rules.deepDamage) || !Number.isFinite(rules.severeDamage) ||
      rules.deepDamage <= 0 || rules.severeDamage < rules.deepDamage ||
      !Number.isSafeInteger(rules.minorTurns) || rules.minorTurns < 1 ||
      !Number.isSafeInteger(rules.deepTurns) || rules.deepTurns < rules.minorTurns)
    throw new Error("Invalid arrow persistence policy.");
  if (damage.critical || damage.finalDamage >= rules.severeDamage)
    return { severity:"severe", turns:null };
  if (damage.finalDamage >= rules.deepDamage ||
      damage.reasons.includes("weak_point"))
    return { severity:"deep", turns:rules.deepTurns };
  return { severity:"minor", turns:rules.minorTurns };
}
