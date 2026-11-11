import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMBAT_CATALOG,
  createEncounter,
  equipCombatant,
  getLegalReactions,
  gradeReactionV2,
  queueAttack,
  resolveReaction,
  validateCombatCatalog,
  type CombatCatalog,
  type EncounterActor,
  type EncounterState,
  type ReactionTechnique,
} from "../packages/combat/src/index";

function actor(id: string, equippedId: string): EncounterActor {
  return {
    id, hp: 100, maxHp: 100, resource: 10, maxResource: 10,
    equippedId, loadoutIds: ["bow", "sword"], status: "ready",
    cooldownUntilTurn: {}, switchedOnTurn: null,
  };
}
function encounter(hero = "bow", enemy = "sword"): EncounterState {
  return createEncounter([actor("hero", hero), actor("enemy", enemy)], DEFAULT_COMBAT_CATALOG);
}
function attack(state: EncounterState, attackerId: string, defenderId: string, moveId: string, distance: number) {
  return queueAttack(state, { attackerId, defenderId, moveId, distanceAtStartMeters: distance, startedTick: 1000 }, DEFAULT_COMBAT_CATALOG);
}
function techniques(state: EncounterState, catalog: CombatCatalog = DEFAULT_COMBAT_CATALOG): ReactionTechnique[] {
  return getLegalReactions(state, catalog).map(x => x.technique);
}
describe("symmetric, equipment-aware encounter domain", () => {
  it("creates a pure state and queues, rather than immediately damaging, an attack", () => {
    const start = encounter();
    const pending = attack(start, "hero", "enemy", "arrow", 15);
    expect(start.phase).toBe("decision");
    expect(start.actors.enemy!.hp).toBe(100);
    expect(pending.actors.enemy!.hp).toBe(100);
    expect(pending.pending).toMatchObject({
      attackerId: "hero", defenderId: "enemy", moveId: "arrow",
      startedTick: 1000, impactTick: 2150,
      hitIndex: 0,
      hits: [{ id: "impact", impactTick: 2150 }],
    });
    expect(pending.phase).toBe("reaction");
  });

  it("allows melee deflection and dodge against a ranged projectile", () => {
    const state = attack(encounter("bow", "sword"), "hero", "enemy", "arrow", 10);
    expect(techniques(state)).toEqual(["dodge", "weapon_deflect"]);
  });

  it("allows ranged interception and dodge against a ranged projectile", () => {
    const state = attack(encounter("bow", "bow"), "hero", "enemy", "arrow", 10);
    expect(techniques(state)).toEqual(["dodge", "projectile_intercept"]);
  });

  it("disallows ranged-only interception of melee contact but allows dodge", () => {
    const state = attack(encounter("sword", "bow"), "hero", "enemy", "slash", 7);
    expect(techniques(state)).toEqual(["dodge"]);
    expect(() => resolveReaction(state, {
      defenderId: "enemy", defenseMoveId: "countershot", reactionTick: 2420,
      resolvedTick: 2450, distanceAtImpactMeters: 1.8,
    }, DEFAULT_COMBAT_CATALOG)).toThrow();
  });

  it("allows sword deflection and dodge of melee contact", () => {
    const state = attack(encounter("sword", "sword"), "hero", "enemy", "slash", 7);
    expect(techniques(state)).toEqual(["dodge", "weapon_deflect"]);
  });

  it("applies per-move denial without changing generic rules", () => {
    const state = attack(encounter("sword", "sword"), "hero", "enemy", "heavy_crush", 7);
    expect(techniques(state)).toEqual(["dodge"]);
  });

  it("allows explicit non-default move policies, but cannot grant unowned abilities", () => {
    const custom: CombatCatalog = {
      ...DEFAULT_COMBAT_CATALOG,
      attacks: {
        ...DEFAULT_COMBAT_CATALOG.attacks,
        slash: {
          ...DEFAULT_COMBAT_CATALOG.attacks.slash!,
          reactionPolicy: { mode: "extend", allow: ["projectile_intercept"] },
        },
      },
    };
    validateCombatCatalog(custom);
    const bowDefense = createEncounter([actor("hero", "sword"), actor("enemy", "bow")], custom);
    const pending = queueAttack(bowDefense, {
      attackerId: "hero", defenderId: "enemy", moveId: "slash",
      distanceAtStartMeters: 5, startedTick: 1000,
    }, custom);
    expect(techniques(pending, custom)).toEqual(["dodge", "projectile_intercept"]);
    const swordDefense = createEncounter([actor("hero", "sword"), actor("enemy", "sword")], custom);
    const swordPending = queueAttack(swordDefense, {
      attackerId: "hero", defenderId: "enemy", moveId: "slash",
      distanceAtStartMeters: 5, startedTick: 1000,
    }, custom);
    expect(techniques(swordPending, custom)).toEqual(["dodge", "weapon_deflect"]);
  });

  it("respects replace and deny precedence", () => {
    const custom: CombatCatalog = {
      ...DEFAULT_COMBAT_CATALOG,
      attacks: {
        ...DEFAULT_COMBAT_CATALOG.attacks,
        arrow: {
          ...DEFAULT_COMBAT_CATALOG.attacks.arrow!,
          reactionPolicy: { mode: "replace", allow: ["projectile_intercept"] },
        },
      },
    };
    const pending = queueAttack(
      createEncounter([actor("hero", "bow"), actor("enemy", "bow")], custom),
      { attackerId: "hero", defenderId: "enemy", moveId: "arrow", distanceAtStartMeters: 8, startedTick: 10 }, custom,
    );
    expect(techniques(pending, custom)).toEqual(["projectile_intercept"]);
    expect(() => validateCombatCatalog({
      ...custom,
      attacks: {
        ...custom.attacks,
        arrow: {
          ...custom.attacks.arrow!,
          reactionPolicy: { mode: "extend", allow: ["dodge"], deny: ["dodge"] },
        },
      },
    })).toThrow();
  });

  it("can resolve the enemy's attack against the hero using the exact same function", () => {
    let state = encounter("bow", "sword");
    state = attack(state, "hero", "enemy", "arrow", 11);
    state = resolveReaction(state, {
      defenderId: "enemy", defenseMoveId: null, reactionTick: null,
      resolvedTick: 2150, distanceAtImpactMeters: 11,
    }, DEFAULT_COMBAT_CATALOG).state;
    expect(state.activeActorId).toBe("enemy");
    state = queueAttack(state, {
      attackerId: "enemy", defenderId: "hero", moveId: "slash", startedTick: 3000,
      distanceAtStartMeters: 9,
    }, DEFAULT_COMBAT_CATALOG);
    expect(techniques(state)).toEqual(["dodge"]);
    const resolved = resolveReaction(state, {
      defenderId: "hero", defenseMoveId: "evade", reactionTick: 4450,
      resolvedTick: 4450, distanceAtImpactMeters: 1.8,
    }, DEFAULT_COMBAT_CATALOG);
    expect(resolved.outcome).toMatchObject({ attackerId: "enemy", defenderId: "hero", grade: "perfect", damage: 0, result: "countered" });
    expect(resolved.state.activeActorId).toBe("hero");
  });

  it("enforces free switching, loadouts and once-per-turn commitment for either combatant", () => {
    let state = encounter();
    const start = state.actors.hero!;
    state = equipCombatant(state, "hero", "sword", DEFAULT_COMBAT_CATALOG);
    expect(state.actors.hero!.resource).toBe(start.resource);
    expect(start.equippedId).toBe("bow");
    expect(() => equipCombatant(state, "hero", "bow", DEFAULT_COMBAT_CATALOG)).toThrow();
    expect(() => equipCombatant(state, "enemy", "bow", DEFAULT_COMBAT_CATALOG)).toThrow();
    expect(() => queueAttack(state, {
      attackerId: "hero", defenderId: "enemy", moveId: "arrow",
      distanceAtStartMeters: 5, startedTick: 1000,
    }, DEFAULT_COMBAT_CATALOG)).toThrow();
    state = attack(state, "hero", "enemy", "slash", 7);
    expect(() => equipCombatant(state, "hero", "bow", DEFAULT_COMBAT_CATALOG)).toThrow();
  });

  it("resolves a miss and an out-of-reach attack without repeated damage", () => {
    const pending = attack(encounter(), "hero", "enemy", "arrow", 14);
    const miss = resolveReaction(pending, {
      defenderId: "enemy", defenseMoveId: null, reactionTick: null,
      resolvedTick: 2150, distanceAtImpactMeters: 14,
    }, DEFAULT_COMBAT_CATALOG);
    expect(miss.outcome.damage).toBe(18);
    expect(miss.state.actors.enemy!.hp).toBe(82);
    expect(() => resolveReaction(miss.state, {
      defenderId: "enemy", defenseMoveId: null, reactionTick: null,
      resolvedTick: 2150, distanceAtImpactMeters: 14,
    }, DEFAULT_COMBAT_CATALOG)).toThrow();
    const tooFar = resolveReaction(pending, {
      defenderId: "enemy", defenseMoveId: null, reactionTick: null,
      resolvedTick: 2150, distanceAtImpactMeters: 50,
    }, DEFAULT_COMBAT_CATALOG);
    expect(tooFar.outcome.result).toBe("out_of_reach");
    expect(tooFar.outcome.damage).toBe(0);
  });

  it("makes the first defense free, while later uses require Energy, and tests timing", () => {
    let state = attack(encounter("bow", "bow"), "hero", "enemy", "arrow", 12);
    const intercepted = resolveReaction(state, {
      defenderId: "enemy", defenseMoveId: "countershot", reactionTick: 2150,
      resolvedTick: 2150, distanceAtImpactMeters: 12,
    }, DEFAULT_COMBAT_CATALOG);
    expect(intercepted.outcome.technique).toBe("projectile_intercept");
    expect(intercepted.outcome.damage).toBe(0);
    expect(intercepted.state.actors.enemy!.resource).toBe(10);
    expect(intercepted.outcome.energySpent).toBe(0);
    expect(gradeReactionV2(-90, DEFAULT_COMBAT_CATALOG.timings.standard!)).toBe("perfect");
    expect(gradeReactionV2(170, DEFAULT_COMBAT_CATALOG.timings.standard!)).toBe("good");
    expect(gradeReactionV2(310, DEFAULT_COMBAT_CATALOG.timings.standard!)).toBe("miss");
    const zeroResource = createEncounter([
      actor("hero", "bow"), { ...actor("enemy", "bow"), resource: 0 },
    ], DEFAULT_COMBAT_CATALOG);
    state = attack(zeroResource, "hero", "enemy", "arrow", 10);
    expect(techniques(state)).toEqual(["dodge", "projectile_intercept"]);
  });

  it("rejects malformed catalog, negative resources, late frames and invalid targets", () => {
    expect(() => validateCombatCatalog({
      ...DEFAULT_COMBAT_CATALOG,
      equipment: { ...DEFAULT_COMBAT_CATALOG.equipment,
        bow: { ...DEFAULT_COMBAT_CATALOG.equipment.bow!, defenseMoveIds: ["unknown"] },
      },
    })).toThrow();
    expect(() => createEncounter([{ ...actor("hero", "bow"), resource: -1 }, actor("enemy", "sword")], DEFAULT_COMBAT_CATALOG)).toThrow();
    const pending = attack(encounter(), "hero", "enemy", "arrow", 5);
    expect(() => resolveReaction(pending, {
      defenderId: "enemy", defenseMoveId: "blade_deflect", reactionTick: 2100,
      resolvedTick: 2100, distanceAtImpactMeters: 5,
    }, DEFAULT_COMBAT_CATALOG)).toThrow();
    expect(() => queueAttack(encounter(), {
      attackerId: "hero", defenderId: "hero", moveId: "arrow", distanceAtStartMeters: 5, startedTick: 100,
    }, DEFAULT_COMBAT_CATALOG)).toThrow();
  });
});
