import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMBAT_CATALOG,
  createEncounter,
  getLegalReactions,
  gradeReactionV2,
  queueAttack,
  resolveReaction,
  resolveEffectiveTiming,
  validateCombatCatalog,
  type CombatCatalog,
  type EncounterActor,
  type EncounterState,
} from "../packages/combat/src/index";

function actor(id: string, equipment: "bow" | "sword" = "sword"): EncounterActor {
  return {
    id, hp: 100, maxHp: 100, resource: 10, maxResource: 10,
    equippedId: equipment, loadoutIds: ["bow", "sword"],
    status: "ready", cooldownUntilTurn: {}, switchedOnTurn: null,
  };
}

const catalog = DEFAULT_COMBAT_CATALOG;

function pending(moveId: string, attackerWeapon: "bow" | "sword", defenderWeapon: "bow" | "sword",
  currentCatalog: CombatCatalog = catalog, timing?: { windowScale?: number; earlyBonusTicks?: number; lateBonusTicks?: number }): EncounterState {
  const initial = createEncounter([actor("hero", attackerWeapon), actor("enemy", defenderWeapon)], currentCatalog);
  return queueAttack(initial, {
    attackerId: "hero",
    defenderId: "enemy",
    moveId,
    startedTick: 1000,
    distanceAtStartMeters: 7,
    reactionTiming: timing,
  }, currentCatalog);
}
function option(state: EncounterState, moveId: string, currentCatalog: CombatCatalog = catalog) {
  const available = getLegalReactions(state, currentCatalog);
  const found = available.find(item => item.moveId === moveId);
  if (!found) throw new Error("Expected legal reaction " + moveId);
  return found;
}
function resolve(state: EncounterState, moveId: string | null, tick: number | null,
  currentCatalog: CombatCatalog = catalog, impactDistance = 1.7) {
  return resolveReaction(state, {
    defenderId: "enemy", defenseMoveId: moveId, reactionTick: tick,
    resolvedTick: Math.max(state.pending!.impactTick, tick ?? 0),
    distanceAtImpactMeters: impactDistance,
    hitId: state.pending!.hits[state.pending!.hitIndex]!.id,
  }, currentCatalog);
}

describe("per-delivery reaction windows", () => {
  it("provides distinct dodge vs parry defaults by delivery", () => {
    const rangedSword = pending("arrow", "bow", "sword");
    expect(option(rangedSword, "evade").timing).toMatchObject({
      sourceProfileId: "ranged_dodge", earlyTicks: 170, lateTicks: 90,
    });
    expect(option(rangedSword, "blade_deflect").timing).toMatchObject({
      sourceProfileId: "ranged_parry", earlyTicks: 90, lateTicks: 50,
    });
    const meleeSword = pending("slash", "sword", "sword");
    expect(option(meleeSword, "evade").timing).toMatchObject({
      sourceProfileId: "melee_dodge", earlyTicks: 280, lateTicks: 120,
    });
    expect(option(meleeSword, "blade_deflect").timing).toMatchObject({
      sourceProfileId: "melee_parry", earlyTicks: 130, lateTicks: 70,
    });
    const rangedBow = pending("arrow", "bow", "bow");
    expect(option(rangedBow, "countershot").timing.sourceProfileId).toBe("ranged_parry");
  });

  it("grades asymmetric early/late timing at exact boundaries", () => {
    const profile = option(pending("arrow", "bow", "sword"), "blade_deflect").timing;
    expect(gradeReactionV2(-90, profile)).toBe("partial");
    expect(gradeReactionV2(-91, profile)).toBe("miss");
    expect(gradeReactionV2(50, profile)).toBe("good");
    expect(gradeReactionV2(51, profile)).toBe("miss");
    expect(gradeReactionV2(0, profile)).toBe("perfect");
    expect(gradeReactionV2(Number.NaN, profile)).toBe("miss");
  });

  it("uses per-attack and per-hit overrides with explicit precedence", () => {
    const updated: CombatCatalog = {
      ...catalog,
      attacks: {
        ...catalog.attacks,
        arrow: {
          ...catalog.attacks.arrow!,
          timingProfileOverrides: { weapon_deflect: "melee_parry" },
          hits: [
            { id: "first", offsetTicks: 1150 },
            { id: "second", offsetTicks: 1400, timingProfileOverrides: { weapon_deflect: "ranged_parry" } },
          ],
        },
      },
    };
    const state = pending("arrow", "bow", "sword", updated);
    expect(option(state, "blade_deflect", updated).timing.sourceProfileId).toBe("melee_parry");
    const following = resolve(state, null, null, updated, 7);
    expect(following.state.pending?.hitIndex).toBe(1);
    expect(option(following.state, "blade_deflect", updated).timing.sourceProfileId).toBe("ranged_parry");
    const moveOverride: CombatCatalog = {
      ...updated,
      defenses: {
        ...updated.defenses,
        blade_deflect: { ...updated.defenses.blade_deflect!, timingOverrideProfileId: "heavy_dodge" },
      },
    };
    expect(option(pending("arrow", "bow", "sword", moveOverride), "blade_deflect", moveOverride)
      .timing.sourceProfileId).toBe("heavy_dodge");
  });

  it("snapshots accessibility/difficulty windows at queue time without mutating catalog", () => {
    const before = JSON.stringify(catalog);
    const state = pending("arrow", "bow", "sword", catalog, { windowScale: 1.4, earlyBonusTicks: 10 });
    const timing = option(state, "evade").timing;
    expect(timing).toMatchObject({ earlyTicks: 248, lateTicks: 126 });
    expect(JSON.stringify(catalog)).toBe(before);
    expect(option(state, "blade_deflect").timing.earlyTicks).toBe(136);
    expect(() => pending("arrow", "bow", "sword", catalog, { windowScale: 40 })).toThrow();
    expect(() => pending("arrow", "bow", "sword", catalog, { lateBonusTicks: Number.NaN })).toThrow();
  });

  it("uses the effective timing snapshot for final combat resolution", () => {
    const state = pending("arrow", "bow", "sword");
    const impact = state.pending!.impactTick;
    const justInside = resolve(state, "blade_deflect", impact - 90, catalog, 7);
    expect(justInside.outcome.grade).toBe("partial");
    const tooEarly = resolve(state, "blade_deflect", impact - 91, catalog, 7);
    expect(tooEarly.outcome.grade).toBe("miss");
    expect(tooEarly.outcome.damage).toBe(18);
    expect(justInside.outcome.damage).toBeLessThan(18);
  });
});

describe("independent multi-hit windows", () => {
  const comboCatalog: CombatCatalog = {
    ...catalog,
    attacks: {
      ...catalog.attacks,
      slash: {
        ...catalog.attacks.slash!,
        damage: 10,
        hits: [
          { id: "hit-a", offsetTicks: 1450 },
          { id: "hit-b", offsetTicks: 1800, damageMultiplier: 1.5 },
          { id: "hit-c", offsetTicks: 2200, damageMultiplier: 2 },
        ],
      },
    },
  };
  it("resolves every hit once, not every frame, then advances turn", () => {
    let state = pending("slash", "sword", "sword", comboCatalog);
    const before = state.actors.enemy!.resource;
    const originalAttackResource = state.actors.hero!.resource;
    expect(state.pending?.hits.map(hit => hit.impactTick)).toEqual([2450, 2800, 3200]);

    const first = resolve(state, "blade_deflect", 2450, comboCatalog);
    expect(first.outcome).toMatchObject({
      hitId: "hit-a", hitIndex: 0, finalHit: false, grade: "perfect", damage: 0,
    });
    expect(first.state.phase).toBe("reaction");
    expect(first.state.turn).toBe(1);
    expect(first.state.actors.enemy!.resource).toBe(before);
    expect(first.outcome.energySpent).toBe(0);

    state = first.state;
    expect(() => resolveReaction(state, {
      defenderId: "enemy", hitId: "hit-a", defenseMoveId: null, reactionTick: null,
      resolvedTick: 3200, distanceAtImpactMeters: 1.7,
    }, comboCatalog)).toThrow();

    const second = resolve(state, null, null, comboCatalog);
    expect(second.outcome).toMatchObject({
      hitId: "hit-b", finalHit: false, damage: 15,
    });
    state = second.state;
    expect(state.actors.hero!.resource).toBe(originalAttackResource);
    const third = resolve(state, null, null, comboCatalog);
    expect(third.outcome).toMatchObject({
      hitId: "hit-c", finalHit: true, damage: 20,
    });
    expect(third.state.pending).toBeNull();
    expect(third.state.phase).toBe("decision");
    expect(third.state.activeActorId).toBe("enemy");
    expect(third.state.actors.enemy!.hp).toBe(65);
    expect(() => resolve(third.state, null, null, comboCatalog)).toThrow();
  });

  it("supports skipping an entire rendering frame without skipping authored hits", () => {
    let state = pending("slash", "sword", "sword", comboCatalog);
    const counts: number[] = [];
    for (const hitId of ["hit-a", "hit-b", "hit-c"]) {
      const result = resolveReaction(state, {
        defenderId: "enemy", hitId, defenseMoveId: null,
        reactionTick: null, resolvedTick: 4200,
        distanceAtImpactMeters: 1.7,
      }, comboCatalog);
      counts.push(result.outcome.damage);
      state = result.state;
    }
    expect(counts).toEqual([10, 15, 20]);
    expect(state.actors.enemy!.hp).toBe(55);
  });

  it("validates duplicate and out-of-order hit IDs/times", () => {
    const modified: CombatCatalog = {
      ...comboCatalog,
      attacks: {
        ...comboCatalog.attacks,
        slash: {
          ...comboCatalog.attacks.slash!,
          hits: [
            { id: "same", offsetTicks: 1450 },
            { id: "same", offsetTicks: 1700 },
          ],
        },
      },
    };
    expect(() => validateCombatCatalog(modified)).toThrow();
    expect(() => validateCombatCatalog({
      ...modified,
      attacks: {
        ...modified.attacks,
        slash: {
          ...modified.attacks.slash!,
          hits: [
            { id: "first", offsetTicks: 1450 },
            { id: "second", offsetTicks: 1400 },
          ],
        },
      },
    })).toThrow();
  });
});
