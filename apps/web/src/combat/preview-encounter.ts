import {
  DEFAULT_COMBAT_CATALOG, STANDARD_ENCOUNTER_RULES, createEncounter,
  type CombatCatalog, type EncounterActor, type EncounterState,
} from "@trilok/combat";

/** Authored two-weapon rakshasa. All moves follow the same core rules. */
export const PREVIEW_CATALOG: CombatCatalog = {
  ...DEFAULT_COMBAT_CATALOG,
  equipment: {
    ...DEFAULT_COMBAT_CATALOG.equipment,
    rakshasa_sword: {
      id: "rakshasa_sword", label: "Rakshasa Greatsword",
      attackMoveIds: ["rakshasa_rapid_slash", "overhead_slash", "rakshasa_quick_slash", "rakshasa_heavy"],
      defenseMoveIds: ["evade", "blade_deflect"],
      switchCost: 2,
    },
    rakshasa_bow: {
      id: "rakshasa_bow", label: "Rakshasa Warbow",
      attackMoveIds: ["rakshasa_arrow", "rakshasa_recover"],
      defenseMoveIds: ["evade", "countershot"],
      switchCost: 2,
    },
  },
  defenses: {
    ...DEFAULT_COMBAT_CATALOG.defenses,
    blade_deflect: {
      ...DEFAULT_COMBAT_CATALOG.defenses.blade_deflect!,
      perfectCounterId: "sword_riposte",
    },
    countershot: {
      ...DEFAULT_COMBAT_CATALOG.defenses.countershot!,
      // A second bow release is NOT a counter action: its original arrow
      // collides with the incoming arrow and may continue to the attacker.
      perfectCounterId: undefined,
      impactEffects: [
        { id:"wound_mark", when:"damage" },
        { id:"embed_arrow", when:"damage" },
      ],
      projectileInterception: {
        power: 13, launchLeadTicks: 315, clashLeadTicks: 115,
        continuationTicks: 460, continuationDamage: 22,
        deadband: 1,
        gradePower: { perfect: 1, good: .76, partial: .36, miss: 0 },
        flight:{
          minSpeed:6,maxSpeed:92,releaseDelayTicks:80,
          gravity:{x:0,y:-9.81,z:0},
          contactRadiusMeters:.16,targetRadiusMeters:.85,
        },
      },
    },
  },
  attacks: {
    ...DEFAULT_COMBAT_CATALOG.attacks,
    arrow: {
      ...DEFAULT_COMBAT_CATALOG.attacks.arrow!,
      impactEffects: [
        { id:"blood_splat", when:"critical" },
        { id:"wound_mark", when:"damage" },
        { id:"embed_arrow", when:"damage" },
      ],
    },
    rakshasa_arrow: {
      ...DEFAULT_COMBAT_CATALOG.attacks.arrow!,
      id: "rakshasa_arrow", damage: 12, projectilePower: 10,
      targeting: { mode: "free_aim", precisionCriticalMultiplier: 1.2 },
      turnPolicy: { continuation: "continue", maxUsesPerTurn: 2 },
      impactEffects: [
        { id:"blood_splat", when:"critical" },
        { id:"wound_mark", when:"damage" },
        { id:"embed_arrow", when:"damage" },
      ],
    },
    recover_shot: {
      ...DEFAULT_COMBAT_CATALOG.attacks.recover_shot!,
      impactEffects: [], // Lightweight recovery attacks never leave wounds.
    },
    rakshasa_rapid_slash: { ...DEFAULT_COMBAT_CATALOG.attacks.rapid_slash!, id:"rakshasa_rapid_slash", damage:7,
      targeting:{mode:"free_aim",precisionCriticalMultiplier:1.2} },
    overhead_slash: {
      ...DEFAULT_COMBAT_CATALOG.attacks.slash!,
      id: "overhead_slash", damage: 14,
      targeting:{mode:"free_aim",precisionCriticalMultiplier:1.2}, impactOffsetTicks: 1850,
      turnPolicy: { continuation: "end", maxUsesPerTurn: 1 }, resourceCost: 1,
    },
    rakshasa_quick_slash: {
      ...DEFAULT_COMBAT_CATALOG.attacks.slash!,
      id: "rakshasa_quick_slash", damage: 11,
      targeting:{mode:"free_aim",precisionCriticalMultiplier:1.2}, resourceCost: 2,
      turnPolicy: { continuation: "continue", maxUsesPerTurn: 2 },
    },
    rakshasa_heavy: {
      ...DEFAULT_COMBAT_CATALOG.attacks.heavy_crush!,
      id: "rakshasa_heavy", damage: 22,
      targeting:{mode:"free_aim",precisionCriticalMultiplier:1.2},
    },
    rakshasa_recover: {
      ...DEFAULT_COMBAT_CATALOG.attacks.recover_shot!,
      id: "rakshasa_recover", damage: 6,
    },
  },
};

function combatant(id: string, equippedId: string, hp: number, energy: number,
  armor: readonly string[] = []): EncounterActor {
  return {
    id, hp, maxHp: hp, resource: energy, maxResource: 8,
    equippedId,
    loadoutIds: id === "hero" ? ["bow", "sword"] : ["rakshasa_sword", "rakshasa_bow"],
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
/** Retained for existing B0 tests; not used as a hardcoded AI policy. */
export const SCRIPTED_ENEMY_MOVE = "overhead_slash" as const;
