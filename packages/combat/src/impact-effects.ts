import type { CombatCatalog, DamageBreakdown, ImpactEffectSpec } from "./encounter-types";

/** Stable effect requests selected from authoritative damage, not from UI guesses.
 * VFX handlers are registered by host applications; this module has no renderer. */
export function selectImpactEffects(
  specs: readonly ImpactEffectSpec[] | undefined,
  damage: DamageBreakdown,
): readonly string[] {
  if (damage.finalDamage <= 0) return [];
  return (specs ?? [])
    .filter(effect => effect.when === "damage" || (effect.when === "critical" && damage.critical))
    .map(effect => effect.id);
}
export function effectsForAttack(
  catalog: CombatCatalog,
  attackMoveId: string,
  damage: DamageBreakdown,
): readonly string[] {
  return selectImpactEffects(catalog.attacks[attackMoveId]?.impactEffects, damage);
}
