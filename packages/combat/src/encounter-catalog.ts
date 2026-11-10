import type {
  AttackDelivery, CombatCatalog, ReactionPolicyOverride, ReactionTechnique,
} from "./encounter-types";

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
  }
  for (const [id, defense] of Object.entries(catalog.defenses)) {
    assertId(id);
    if (defense.id !== id || !known(defense.technique, TECHNIQUES)) throw new Error("Invalid defense definition: " + id);
    nonnegative(defense.resourceCost, "defense cost");
    nonnegative(defense.cooldownTurns, "cooldown");
    if (!Number.isInteger(defense.cooldownTurns)) throw new Error("Cooldown must be an integer.");
    if (!catalog.timings[defense.timingProfileId] || !catalog.outcomes[defense.outcomeProfileId]) {
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
  for (const [id, timing] of Object.entries(catalog.timings)) {
    assertId(id);
    for (const [name, value] of Object.entries(timing)) nonnegative(value, "timing " + name);
    if (!(timing.perfectTicks <= timing.goodTicks &&
          timing.goodTicks <= timing.partialTicks &&
          timing.lateGraceTicks <= timing.partialTicks)) {
      throw new Error("Timing thresholds are inconsistent: " + id);
    }
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
    bow: { id: "bow", label: "Longbow", attackMoveIds: ["arrow"], defenseMoveIds: ["evade", "countershot"], switchCost: 2 },
    sword: { id: "sword", label: "Sword", attackMoveIds: ["slash", "heavy_crush"], defenseMoveIds: ["evade", "blade_deflect"], switchCost: 2 },
  },
  attacks: {
    arrow: { id: "arrow", delivery: "ranged_projectile", damage: 18, reachMeters: 36, engageRangeMeters: 36, impactOffsetTicks: 1150, resourceCost: 0 },
    slash: { id: "slash", delivery: "melee_contact", damage: 22, reachMeters: 1.9, engageRangeMeters: 15, impactOffsetTicks: 1450, resourceCost: 0 },
    heavy_crush: {
      id: "heavy_crush", delivery: "melee_contact", damage: 26,
      reachMeters: 2, engageRangeMeters: 15, impactOffsetTicks: 1850, resourceCost: 2,
      reactionPolicy: { mode: "inherit", deny: ["weapon_deflect"] },
    },
  },
  defenses: {
    evade: { id: "evade", technique: "dodge", resourceCost: 1, cooldownTurns: 0, timingProfileId: "standard", outcomeProfileId: "dodge" },
    blade_deflect: { id: "blade_deflect", technique: "weapon_deflect", resourceCost: 1, cooldownTurns: 0, timingProfileId: "standard", outcomeProfileId: "parry" },
    countershot: { id: "countershot", technique: "projectile_intercept", resourceCost: 2, cooldownTurns: 0, timingProfileId: "standard", outcomeProfileId: "parry" },
  },
  timings: {
    standard: { perfectTicks: 90, goodTicks: 200, partialTicks: 380, lateGraceTicks: 280 },
  },
  outcomes: {
    dodge: { perfect: 0, good: 0, partial: 0.36, miss: 1 },
    parry: { perfect: 0, good: 0.14, partial: 0.57, miss: 1 },
  },
};
