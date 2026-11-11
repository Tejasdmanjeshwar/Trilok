import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMBAT_CATALOG, LEGACY_ENCOUNTER_RULES, STANDARD_ENCOUNTER_RULES,
  createEncounter, endTurn, equipCombatant, queueAttack, resolveReaction,
  validateCombatCatalog, validateEncounterRules,
  type CombatCatalog, type EncounterActor, type EncounterRules, type EncounterState,
} from "../packages/combat/src/index";

const catalog = DEFAULT_COMBAT_CATALOG;

function actor(id: string, equippedId: string = "bow", energy = 4, maxEnergy = 8): EncounterActor {
  return {
    id, hp: 100, maxHp: 100, resource: energy, maxResource: maxEnergy,
    equippedId, loadoutIds: ["bow", "sword"], status: "ready",
    cooldownUntilTurn: {}, switchedOnTurn: null,
  };
}
function start(
  hero = actor("hero"), enemy = actor("enemy", "sword"),
  rules: EncounterRules = STANDARD_ENCOUNTER_RULES,
  moves: CombatCatalog = catalog,
): EncounterState {
  return createEncounter([hero, enemy], moves, "hero", rules);
}
function attack(s: EncounterState, moveId: string, tick: number, moves: CombatCatalog = catalog): EncounterState {
  const distance = moveId === "slash" || moveId === "heavy_crush" ? 1.6 : 8;
  return queueAttack(s, {
    attackerId: s.activeActorId,
    defenderId: s.activeActorId === "hero" ? "enemy" : "hero",
    moveId, distanceAtStartMeters: distance, startedTick: tick,
  }, moves);
}
function finish(s: EncounterState, moves: CombatCatalog = catalog): EncounterState {
  const pending = s.pending!;
  const r = resolveReaction(s, {
    defenderId: pending.defenderId, defenseMoveId: null, reactionTick: null,
    resolvedTick: pending.impactTick, distanceAtImpactMeters: 1.6,
  }, moves);
  return r.state;
}

describe("v0.4-A.2 Energy action economy", () => {
  it("supports three chained shots but not a fourth, even with Energy remaining", () => {
    let s = start();
    const original = s;
    for (let i = 0; i < 2; i++) {
      s = finish(attack(s, "arrow", i * 5000));
      expect(s.activeActorId).toBe("hero");
      expect(s.phase).toBe("decision");
      expect(s.turn).toBe(1);
      expect(s.turnBudget.actionsUsed).toBe(i + 1);
      expect(s.actors.hero!.resource).toBe(3 - i);
    }
    s = attack(s, "arrow", 10000);
    expect(s.actors.hero!.resource).toBe(1);
    const final = finish(s);
    expect(final.turnBudget.actionsUsed).toBe(0);
    expect(final.turn).toBe(2);
    expect(final.activeActorId).toBe("enemy");
    expect(final.actors.enemy!.resource).toBe(5); // +1 once on transition
    expect(original.actors.hero!.resource).toBe(4);
  });

  it("respects action budget independently of Energy (including free moves)", () => {
    const rules: EncounterRules = { ...STANDARD_ENCOUNTER_RULES, maxActionsPerTurn: 1 };
    let s = start(actor("hero", "bow", 8), actor("enemy", "sword", 8), rules);
    s = finish(attack(s, "arrow", 0));
    expect(s.activeActorId).toBe("enemy");
    expect(s.actors.hero!.resource).toBe(7);
    const largeBudget: EncounterRules = { ...STANDARD_ENCOUNTER_RULES, maxActionsPerTurn: 5 };
    s = start(actor("hero", "bow", 8), actor("enemy", "sword", 8), largeBudget);
    s = finish(attack(s, "arrow", 0));
    s = finish(attack(s, "arrow", 2000));
    s = finish(attack(s, "arrow", 4000));
    expect(() => attack(s, "arrow", 6000)).toThrow(/use limit/);
    s = finish(attack(s, "recover_shot", 6000));
    expect(s.activeActorId).toBe("enemy"); // Ends turn despite spare actions
  });

  it("recovery shot restores Energy once after resolution and must end turn", () => {
    let s = start(actor("hero", "bow", 1));
    s = attack(s, "recover_shot", 0);
    expect(s.actors.hero!.resource).toBe(1);
    expect(s.turnBudget.actionsUsed).toBe(1);
    expect(() => endTurn(s, "hero")).toThrow(); // Pending hit cannot be skipped
    s = finish(s);
    expect(s.actors.hero!.resource).toBe(3);
    expect(s.activeActorId).toBe("enemy");
    expect(s.turn).toBe(2);
  });

  it("heavy finisher ends turn immediately after its final impact", () => {
    let s = start(actor("hero", "sword", 8));
    s = finish(attack(s, "slash", 0));
    expect(s.activeActorId).toBe("hero");
    s = attack(s, "heavy_crush", 2000);
    expect(s.actors.hero!.resource).toBe(2);
    s = finish(s);
    expect(s.activeActorId).toBe("enemy");
    expect(s.turn).toBe(2);
  });

  it("explicit endTurn changes actor and grants regen only once", () => {
    const s = start(actor("hero", "bow", 2), actor("enemy", "sword", 6));
    const enemyTurn = endTurn(s, "hero");
    expect(enemyTurn.activeActorId).toBe("enemy");
    expect(enemyTurn.actors.enemy!.resource).toBe(7);
    expect(enemyTurn.actors.hero!.resource).toBe(2);
    expect(() => endTurn(enemyTurn, "hero")).toThrow();
    const next = endTurn(enemyTurn, "enemy");
    expect(next.activeActorId).toBe("hero");
    expect(next.actors.hero!.resource).toBe(3);
    expect(next.turn).toBe(3);
    expect(s.turn).toBe(1); // immutable
  });

  it("does not regen when starting a fresh encounter and caps regen at maximum", () => {
    let s = start(actor("hero", "bow", 2), actor("enemy", "sword", 8));
    expect(s.actors.hero!.resource).toBe(2);
    s = endTurn(s, "hero");
    expect(s.actors.enemy!.resource).toBe(8);
  });

  it("allows one costly weapon switch per own turn, and prevents refund of the switch", () => {
    let s = start(actor("hero", "bow", 7));
    s = equipCombatant(s, "hero", "sword", catalog);
    expect(s.actors.hero!.resource).toBe(5);
    expect(s.turnBudget.actionsUsed).toBe(0);
    expect(() => equipCombatant(s, "hero", "bow", catalog)).toThrow();
    s = finish(attack(s, "slash", 0));
    expect(s.activeActorId).toBe("hero");
    expect(s.actors.hero!.resource).toBe(3);
    expect(() => equipCombatant(s, "hero", "bow", catalog)).toThrow();
  });

  it("caps perfect parry refunds across all hits and never exceeds maxEnergy", () => {
    const combo: CombatCatalog = {
      ...catalog,
      attacks: {
        ...catalog.attacks,
        arrow: {
          ...catalog.attacks.arrow!,
          hits: [
            { id: "a", offsetTicks: 1150 },
            { id: "b", offsetTicks: 1400 },
            { id: "c", offsetTicks: 1700 },
          ],
          damage: 10,
        },
      },
    };
    let s = start(actor("hero", "bow", 4), actor("enemy", "sword", 4), STANDARD_ENCOUNTER_RULES, combo);
    s = attack(s, "arrow", 100, combo);
    expect(s.actors.hero!.resource).toBe(3); // one attack cost
    for (let i = 0; i < 3; i++) {
      const before = s.actors.enemy!.resource;
      const hit = s.pending!;
      const result = resolveReaction(s, {
        defenderId: "enemy", defenseMoveId: "blade_deflect",
        reactionTick: hit.impactTick, resolvedTick: hit.impactTick,
        distanceAtImpactMeters: 7, hitId: hit.hits[hit.hitIndex]!.id,
      }, combo);
      expect(result.outcome.grade).toBe("perfect");
      expect(result.outcome.damage).toBe(0);
      expect(result.outcome.energyRefunded).toBe(i < 2 ? 1 : 0);
      expect(result.state.actors.enemy!.resource).toBe(before - 1 + (i < 2 ? 1 : 0));
      s = result.state;
    }
    expect(s.turnBudget.perfectRefundUsedByActor.enemy).toBe(2);
    expect(s.actors.enemy!.resource).toBe(3);
    expect(s.actors.hero!.resource).toBe(3);
    expect(s.activeActorId).toBe("hero");
  });

  it("rejects unsupported values and infinite Energy-generating continuation policies", () => {
    expect(() => validateEncounterRules({ ...STANDARD_ENCOUNTER_RULES, maxActionsPerTurn: 0 })).toThrow();
    expect(() => validateEncounterRules({ ...STANDARD_ENCOUNTER_RULES, maxActionsPerTurn: 100 })).toThrow();
    expect(() => validateCombatCatalog({
      ...catalog,
      attacks: {
        ...catalog.attacks,
        arrow: { ...catalog.attacks.arrow!, turnPolicy: {
          continuation: "continue", energyGainOnCompletion: 1,
        } },
      },
    })).toThrow();
    expect(() => start(actor("hero"), actor("enemy", "sword"), {
      ...STANDARD_ENCOUNTER_RULES, energyRegenPerTurn: -1,
    })).toThrow();
  });

  it("maintains backward-compatible one-action turn transitions when no rules are supplied", () => {
    let s = createEncounter([actor("hero", "bow", 10, 10), actor("enemy", "sword", 10, 10)], catalog);
    expect(s.rules).toEqual(LEGACY_ENCOUNTER_RULES);
    s = finish(attack(s, "arrow", 0));
    expect(s.activeActorId).toBe("enemy");
    expect(s.actors.enemy!.resource).toBe(10);
  });
});
