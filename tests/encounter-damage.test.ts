import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMBAT_CATALOG as catalog,
  createEncounter, queueAttack, resolveReaction, resolveRegionDamage,
  validateCombatCatalog, type CombatCatalog, type EncounterActor, type EncounterState,
} from "../packages/combat/src/index";

function actor(id: string, anatomyId = "humanoid", armor: string[] = []): EncounterActor {
  return {
    id, hp: 100, maxHp: 100, resource: 8, maxResource: 8,
    equippedId: "bow", loadoutIds: ["bow", "sword"],
    status: "ready", cooldownUntilTurn: {}, switchedOnTurn: null,
    anatomyId, equippedArmorIds: armor, regionExposure: {},
  };
}
function encounter(defender = actor("enemy")): EncounterState {
  return createEncounter([actor("hero"), defender], catalog);
}
function fire(
  defender = actor("enemy"),
  intendedRegionId: string | null = "head",
  actualRegionId: string | null | undefined = "head",
  moveId = "arrow",
  contact = true,
) {
  const state = queueAttack(encounter(defender), {
    attackerId: "hero", defenderId: "enemy", moveId,
    distanceAtStartMeters: 8, startedTick: 100,
    intendedRegionId,
  }, catalog);
  return resolveReaction(state, {
    defenderId: "enemy", defenseMoveId: null, reactionTick: null,
    resolvedTick: state.pending!.impactTick, distanceAtImpactMeters: 8,
    actualRegionId, contact,
  }, catalog);
}
describe("v0.4-A.3 regional damage and armor", () => {
  it("awards a precision critical on an exposed unarmored head", () => {
    const result = fire();
    expect(result.outcome.breakdown).toMatchObject({
      actualRegionId: "head", intendedRegionId: "head",
      baseDamage: 18, vulnerabilityMultiplier: 1.5, critical: true,
      criticalMultiplier: 1.4, armorMultiplier: 1,
      finalDamage: 38,
    });
    expect(result.outcome.damage).toBe(38);
    expect(result.outcome.breakdown.reasons).toContain("precision_critical");
  });

  it("helmet protection suppresses critical and reduces an aimed headshot", () => {
    const result = fire(actor("enemy", "humanoid", ["iron_helmet"]));
    expect(result.outcome.breakdown).toMatchObject({
      actualRegionId: "head", critical: false, criticalMultiplier: 1,
      armorMultiplier: 0.45, finalDamage: 12,
    });
    expect(result.outcome.breakdown.armorAbsorbed).toBeCloseTo(14.85);
    expect(result.outcome.breakdown.reasons).toContain("critical_suppressed");
    expect(result.outcome.damage).toBeLessThan(fire().outcome.damage);
  });

  it("a torso shot is ordinary and separately protected by chest armor", () => {
    const uncovered = fire(actor("enemy"), "torso", "torso");
    const covered = fire(actor("enemy", "humanoid", ["chestplate"]), "torso", "torso");
    expect(uncovered.outcome.damage).toBe(18);
    expect(covered.outcome.damage).toBe(11);
    expect(covered.outcome.breakdown.reasons).toContain("armor:chestplate");
    expect(covered.outcome.breakdown.critical).toBe(false);
  });

  it("actual impact region, not intended aim, controls damage and crits", () => {
    const offHead = fire(actor("enemy"), "head", "right_arm");
    expect(offHead.outcome.damage).toBe(15);
    expect(offHead.outcome.breakdown.critical).toBe(false);
    expect(offHead.outcome.breakdown.actualRegionId).toBe("right_arm");
    const miss = fire(actor("enemy"), "head", null);
    expect(miss.outcome.damage).toBe(0);
    expect(miss.outcome.breakdown.reasons).toContain("region_miss");
    const noContact = fire(actor("enemy"), "head", "head", "arrow", false);
    expect(noContact.outcome.damage).toBe(0);
  });

  it("allows creature-specific weak points with nonhumanoid anatomy", () => {
    const beast = actor("enemy", "horned_beast");
    const head = fire(beast, "horn", "horn");
    expect(head.outcome.damage).toBe(45);
    expect(head.outcome.breakdown.stagger).toBe(23);
    const guard = fire(actor("enemy", "horned_beast", ["horn_guard"]), "horn", "horn");
    expect(guard.outcome.damage).toBe(11);
    expect(guard.outcome.breakdown.critical).toBe(false);
  });

  it("protected weak points suppress vulnerability without rewriting region data", () => {
    const enemy = { ...actor("enemy"), regionExposure: { head: "protected" as const } };
    const result = fire(enemy);
    expect(result.outcome.damage).toBe(18);
    expect(result.outcome.breakdown.reasons).toContain("weak_point_protected");
    expect(result.outcome.breakdown.vulnerabilityMultiplier).toBe(1);
    expect(result.outcome.breakdown.critical).toBe(false);
    expect(enemy.regionExposure.head).toBe("protected");
  });

  it("applies damage-type-dependent armor and no global headshot multiplier", () => {
    const enemy = actor("enemy", "humanoid", ["iron_helmet"]);
    const arrow = fire(enemy);
    const blunt = resolveRegionDamage({
      attackerId: "hero", defender: enemy, moveId: "test", hitId: "impact",
      baseDamage: 18, damageType: "blunt", targeting: {
        mode: "free_aim", precisionCriticalMultiplier: 1.4,
      }, intendedRegionId: "head", actualRegionId: "head",
      reactionMultiplier: 1, inReach: true,
    }, catalog);
    expect(blunt.finalDamage).toBeGreaterThan(arrow.outcome.damage);
    expect(blunt.critical).toBe(false);
    expect(blunt.armorMultiplier).toBeCloseTo(0.6975);
  });

  it("applies reactions before mitigation; successful parry prevents damage", () => {
    const enemy = { ...actor("enemy", "humanoid", ["iron_helmet"]), equippedId: "sword" };
    const pending = queueAttack(encounter(enemy), {
      attackerId: "hero", defenderId: "enemy", moveId: "arrow",
      startedTick: 100, distanceAtStartMeters: 8, intendedRegionId: "head",
    }, catalog);
    const result = resolveReaction(pending, {
      defenderId: "enemy", defenseMoveId: "blade_deflect",
      reactionTick: pending.pending!.impactTick,
      resolvedTick: pending.pending!.impactTick,
      distanceAtImpactMeters: 8, actualRegionId: "head",
    }, catalog);
    expect(result.outcome.damage).toBe(0);
    expect(result.outcome.breakdown.critical).toBe(false);
    expect(result.outcome.breakdown.reasons).toContain("defense_countered");
  });

  it("rejects hidden aims, unknown regions and invalid armor loadouts", () => {
    const hidden = { ...actor("enemy"), regionExposure: { head: "hidden" as const } };
    expect(() => queueAttack(encounter(hidden), {
      attackerId: "hero", defenderId: "enemy", moveId: "arrow",
      startedTick: 0, distanceAtStartMeters: 8, intendedRegionId: "head",
    }, catalog)).toThrow();
    expect(() => fire(actor("enemy"), "head", "unknown")).toThrow();
    expect(() => fire(actor("enemy", "humanoid", ["horn_guard"]))).toThrow();
    expect(() => fire(actor("enemy", "unknown"))).toThrow();
    expect(() => fire(actor("enemy", "humanoid", ["iron_helmet", "iron_helmet"]))).toThrow();
  });

  it("rejects invalid precision and armor data at catalog validation", () => {
    expect(() => validateCombatCatalog({
      ...catalog, attacks: {
        ...catalog.attacks,
        arrow: { ...catalog.attacks.arrow!, targeting: {
          mode: "actor", precisionCriticalMultiplier: 5,
        } },
      },
    })).toThrow();
    expect(() => validateCombatCatalog({
      ...catalog, armor: {
        ...catalog.armor,
        invalid: { id: "invalid", label: "broken", coverage: [{
          regionId: "head", protection: 1.3,
        }] },
      },
    })).toThrow();
  });

  it("continues a multi-hit attack while recording region-specific outcomes", () => {
    const custom: CombatCatalog = {
      ...catalog,
      attacks: { ...catalog.attacks,
        arrow: {
          ...catalog.attacks.arrow!,
          damage: 10, hits: [
            { id: "first", offsetTicks: 1150 },
            { id: "second", offsetTicks: 1500 },
          ],
        },
      },
    };
    let state = createEncounter([actor("hero"),actor("enemy", "humanoid", ["iron_helmet"])], custom);
    state = queueAttack(state, {
      attackerId: "hero", defenderId: "enemy", moveId: "arrow",
      startedTick: 100, distanceAtStartMeters: 8, intendedRegionId: "head",
    }, custom);
    const one = resolveReaction(state, {
      defenderId: "enemy", defenseMoveId: null, reactionTick: null,
      resolvedTick: 1250, distanceAtImpactMeters: 8, actualRegionId: "head",
    }, custom);
    expect(one.outcome).toMatchObject({ hitId: "first", finalHit: false, damage: 7 });
    const two = resolveReaction(one.state, {
      defenderId: "enemy", defenseMoveId: null, reactionTick: null,
      resolvedTick: 1600, distanceAtImpactMeters: 8, actualRegionId: "torso",
    }, custom);
    expect(two.outcome).toMatchObject({ hitId: "second", finalHit: true, damage: 10 });
    expect(two.state.actors.enemy!.hp).toBe(83);
    expect(two.state.pending).toBeNull();
  });
});
