import {
  DEFAULT_COMBAT_CATALOG, STANDARD_ENCOUNTER_RULES, createEncounter,
  type CombatCatalog, type EncounterActor, type EncounterState,
} from "@trilok/combat";

/**
 * Browser slice content lives here, not in the combat rules package.
 * The enemy uses a scripted sword move until the v0.4-B1 AI arrives.
 * Impact time agrees with the existing 1850 ms rakshasa windup animation.
 */
export const PREVIEW_CATALOG: CombatCatalog = {
  ...DEFAULT_COMBAT_CATALOG,
  equipment: {
    ...DEFAULT_COMBAT_CATALOG.equipment,
    rakshasa_sword: {
      id: "rakshasa_sword", label: "Rakshasa Greatsword",
      attackMoveIds: ["overhead_slash"],
      defenseMoveIds: ["evade", "blade_deflect"],
      switchCost: 2,
    },
  },
  attacks: {
    ...DEFAULT_COMBAT_CATALOG.attacks,
    overhead_slash: {
      ...DEFAULT_COMBAT_CATALOG.attacks.slash!,
      id: "overhead_slash",
      damage: 14,
      impactOffsetTicks: 1850,
      turnPolicy: { continuation: "end", maxUsesPerTurn: 1 },
      resourceCost: 1,
    },
  },
};

function combatant(id: string, equippedId: string, hp: number, energy: number,
  armor: readonly string[] = []): EncounterActor {
  return {
    id, hp, maxHp: hp, resource: energy, maxResource: 8,
    equippedId,
    loadoutIds: id === "hero" ? ["bow", "sword"] : ["rakshasa_sword"],
    status: "ready", cooldownUntilTurn: {}, switchedOnTurn: null,
    anatomyId: "humanoid", equippedArmorIds: armor,
  };
}
export function createPreviewEncounter(): EncounterState {
  return createEncounter([
    combatant("hero", "bow", 100, 4),
    combatant("enemy", "rakshasa_sword", 88, 6, ["iron_helmet"]),
  ], PREVIEW_CATALOG, "hero", STANDARD_ENCOUNTER_RULES);
}

/** B0 scripted test encounter, not a decision-making AI. */
export const SCRIPTED_ENEMY_MOVE = "overhead_slash" as const;
