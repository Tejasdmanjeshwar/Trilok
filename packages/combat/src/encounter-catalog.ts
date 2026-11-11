import type {
  AttackDelivery, CombatCatalog, ReactionPolicyOverride, ReactionTechnique,
} from "./encounter-types";
import { validateTimingProfile } from "./encounter-timing";
import { validateAttackTurnPolicy } from "./encounter-economy";

const TECHNIQUES: readonly ReactionTechnique[] = ["dodge", "weapon_deflect", "projectile_intercept"];
const DELIVERIES: readonly AttackDelivery[] = ["melee_contact", "ranged_projectile", "area"];

function assertId(id: string): void {
  if (!id || typeof id !== "string") throw new Error("Missing catalog identifier.");
}
function nonnegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid " + label + ".");
}
function known<T extends string>(value: string, valid: readonly T[]): value is T {
  return valid.includes(value as T);
}
function validatePolicy(policy?: ReactionPolicyOverride): void {
  if (!policy) return;
  if (policy.mode && !["inherit", "extend", "replace"].includes(policy.mode)) {
    throw new Error("Unknown reaction policy mode.");
  }
  for (const key of ["allow", "deny"] as const) {
    const items = policy[key] ?? [];
    if (new Set(items).size !== items.length || items.some(item => !known(item, TECHNIQUES))) {
      throw new Error("Unknown or duplicate reaction policy technique.");
    }
  }
  if ((policy.allow ?? []).some(item => policy.deny?.includes(item))) {
    throw new Error("Reaction technique cannot be both allowed and denied.");
  }
  if (policy.mode === "replace" && policy.allow === undefined) {
    throw new Error("Replacement policy requires an explicit allow list (possibly empty).");
  }
}

function validateTimingReferences(
  references: Partial<Record<ReactionTechnique, string>> | undefined,
  catalog: CombatCatalog,
  owner: string,
): void {
  if (!references) return;
  for (const [technique, profileId] of Object.entries(references)) {
    if (!known(technique, TECHNIQUES) || !profileId || !catalog.timings[profileId]) {
      throw new Error("Unknown timing technique/profile on " + owner + ": " + technique);
    }
  }
}

/** Validate authored content once at loading; never silently ignore bad IDs. */
export function validateCombatCatalog(catalog: CombatCatalog): void {
  for (const [id, move] of Object.entries(catalog.attacks)) {
    assertId(id);
    if (move.id !== id || !known(move.delivery, DELIVERIES)) throw new Error("Invalid attack definition: " + id);
    nonnegative(move.damage, "damage");
    nonnegative(move.resourceCost, "attack cost");
    nonnegative(move.reachMeters, "reach");
    nonnegative(move.engageRangeMeters, "engagement");
    nonnegative(move.impactOffsetTicks, "impact marker");
    if (move.reachMeters <= 0 || move.engageRangeMeters < move.reachMeters || move.impactOffsetTicks <= 0) {
      throw new Error("Invalid attack range or impact timing: " + id);
    }
    validatePolicy(move.reactionPolicy);
    if (move.turnPolicy) validateAttackTurnPolicy(move.turnPolicy);
    validateTimingReferences(move.timingProfileOverrides, catalog, "attack " + id);
    if (move.hits !== undefined) {
      if (move.hits.length < 1 || move.hits.length > 16) {
        throw new Error("Attack must contain between one and sixteen impact markers.");
      }
      const hitIds = new Set<string>();
      let previous = 0;
      for (const hit of move.hits) {
        if (!hit.id || hitIds.has(hit.id) || !Number.isSafeInteger(hit.offsetTicks) ||
            hit.offsetTicks <= previous || hit.offsetTicks > 600_000) {
          throw new Error("Attack hit IDs and offsets must be unique and strictly increasing.");
        }
        if (hit.damageMultiplier !== undefined &&
            (!Number.isFinite(hit.damageMultiplier) ||
             hit.damageMultiplier <= 0 || hit.damageMultiplier > 10)) {
          throw new Error("Invalid hit damage multiplier.");
        }
        validateTimingReferences(hit.timingProfileOverrides, catalog, "attack hit " + hit.id);
        hitIds.add(hit.id);
        previous = hit.offsetTicks;
      }
      if (move.hits[0]!.offsetTicks !== move.impactOffsetTicks) {
        throw new Error("First hit offset must equal the legacy impact offset.");
      }
    }
  }
  for (const [id, defense] of Object.entries(catalog.defenses)) {
    assertId(id);
    if (defense.id !== id || !known(defense.technique, TECHNIQUES)) throw new Error("Invalid defense definition: " + id);
    nonnegative(defense.resourceCost, "defense cost");
    if (defense.perfectEnergyRefund !== undefined) {
      nonnegative(defense.perfectEnergyRefund, "perfect defense refund");
      if (!Number.isSafeInteger(defense.perfectEnergyRefund) || defense.perfectEnergyRefund > 20) {
        throw new Error("Invalid perfect defense Energy refund.");
      }
    }
    nonnegative(defense.cooldownTurns, "cooldown");
    if (!Number.isInteger(defense.cooldownTurns)) throw new Error("Cooldown must be an integer.");
    if (!catalog.timings[defense.timingProfileId] || !catalog.outcomes[defense.outcomeProfileId] ||
        (defense.timingOverrideProfileId !== undefined &&
          !catalog.timings[defense.timingOverrideProfileId])) {
      throw new Error("Unknown timing or outcome profile: " + id);
    }
    const deliveries = defense.grantsAgainst ?? [];
    if (new Set(deliveries).size !== deliveries.length || deliveries.some(d => !known(d, DELIVERIES))) {
      throw new Error("Invalid granted defense delivery: " + id);
    }
  }
  for (const [id, equipment] of Object.entries(catalog.equipment)) {
    assertId(id);
    if (equipment.id !== id || !equipment.label) throw new Error("Invalid equipment: " + id);
    nonnegative(equipment.switchCost, "switch cost");
    if (new Set(equipment.attackMoveIds).size !== equipment.attackMoveIds.length ||
        new Set(equipment.defenseMoveIds).size !== equipment.defenseMoveIds.length) {
      throw new Error("Duplicate equipment move references: " + id);
    }
    if (equipment.attackMoveIds.some(move => !catalog.attacks[move]) ||
        equipment.defenseMoveIds.some(move => !catalog.defenses[move])) {
      throw new Error("Equipment references unknown move: " + id);
    }
  }
  for (const [delivery, perTechnique] of Object.entries(catalog.reactionTimingDefaults ?? {})) {
    if (!known(delivery, DELIVERIES)) throw new Error("Invalid default timing delivery.");
    validateTimingReferences(perTechnique, catalog, "delivery " + delivery);
  }
  for (const [id, timing] of Object.entries(catalog.timings)) {
    assertId(id);
    validateTimingProfile(timing);
  }
  for (const [id, outcome] of Object.entries(catalog.outcomes)) {
    assertId(id);
    for (const grade of ["perfect", "good", "partial", "miss"] as const) {
      nonnegative(outcome[grade], "damage multiplier");
    }
  }
}

/**
 * Shared data. "Bow intercepts ranged" is an equipped defense technique,
 * not a hardcoded exception in the resolver.
 */
export const DEFAULT_COMBAT_CATALOG: CombatCatalog = {
  equipment: {
    bow: { id: "bow", label: "Longbow", attackMoveIds: ["arrow", "recover_shot"], defenseMoveIds: ["evade", "countershot"], switchCost: 2 },
    sword: { id: "sword", label: "Sword", attackMoveIds: ["slash", "heavy_crush"], defenseMoveIds: ["evade", "blade_deflect"], switchCost: 2 },
  },
  attacks: {
    arrow: { id: "arrow", delivery: "ranged_projectile", damage: 18, reachMeters: 36, engageRangeMeters: 36, impactOffsetTicks: 1150, resourceCost: 1,
      turnPolicy: { continuation: "continue", maxUsesPerTurn: 3 } },
    recover_shot: { id: "recover_shot", delivery: "ranged_projectile", damage: 8, reachMeters: 36, engageRangeMeters: 36, impactOffsetTicks: 1150, resourceCost: 0,
      turnPolicy: { continuation: "end", maxUsesPerTurn: 1, energyGainOnCompletion: 2 } },
    slash: { id: "slash", delivery: "melee_contact", damage: 22, reachMeters: 1.9, engageRangeMeters: 15, impactOffsetTicks: 1450, resourceCost: 2,
      turnPolicy: { continuation: "continue", maxUsesPerTurn: 3 } },
    heavy_crush: {
      id: "heavy_crush", delivery: "melee_contact", damage: 26,
      reachMeters: 2, engageRangeMeters: 15, impactOffsetTicks: 1850, resourceCost: 4,
      turnPolicy: { continuation: "end", maxUsesPerTurn: 1 },
      reactionPolicy: { mode: "inherit", deny: ["weapon_deflect"] },
      timingProfileOverrides: { dodge: "heavy_dodge" },
    },
  },
  defenses: {
    evade: { id: "evade", technique: "dodge", resourceCost: 1, cooldownTurns: 0, timingProfileId: "standard", outcomeProfileId: "dodge" },
    blade_deflect: { id: "blade_deflect", technique: "weapon_deflect", resourceCost: 1, cooldownTurns: 0, timingProfileId: "standard", outcomeProfileId: "parry", perfectEnergyRefund: 1 },
    countershot: { id: "countershot", technique: "projectile_intercept", resourceCost: 2, cooldownTurns: 0, timingProfileId: "standard", outcomeProfileId: "parry", perfectEnergyRefund: 1 },
  },
  timings: {
    // Fallback for authored content that does not yet select delivery defaults.
    standard: { earlyTicks: 380, lateTicks: 280, perfectTicks: 90, goodTicks: 200 },
    melee_dodge: { earlyTicks: 280, lateTicks: 120, perfectTicks: 65, goodTicks: 140 },
    melee_parry: { earlyTicks: 130, lateTicks: 70, perfectTicks: 35, goodTicks: 70 },
    ranged_dodge: { earlyTicks: 170, lateTicks: 90, perfectTicks: 50, goodTicks: 95 },
    ranged_parry: { earlyTicks: 90, lateTicks: 50, perfectTicks: 25, goodTicks: 50 },
    heavy_dodge: { earlyTicks: 360, lateTicks: 140, perfectTicks: 75, goodTicks: 150 },
  },
  reactionTimingDefaults: {
    melee_contact: {
      dodge: "melee_dodge",
      weapon_deflect: "melee_parry",
    },
    ranged_projectile: {
      dodge: "ranged_dodge",
      weapon_deflect: "ranged_parry",
      projectile_intercept: "ranged_parry",
    },
  },
  outcomes: {
    dodge: { perfect: 0, good: 0, partial: 0.36, miss: 1 },
    parry: { perfect: 0, good: 0.14, partial: 0.57, miss: 1 },
  },
};
