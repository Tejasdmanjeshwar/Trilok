import { describe, expect, it } from "vitest";
import {
  getLegalEquipmentSwitches, getLegalReactions, queueAttack,
  type EncounterState,
} from "../packages/combat/src/index";
import {
  EnemyCombatBrain, ENEMY_PROFILES, type AIProfile, type CombatIntent,
} from "../packages/combat-ai/src/index";
import { EncounterSession } from "../apps/web/src/combat/EncounterSession";
import { PREVIEW_CATALOG, createPreviewEncounter } from "../apps/web/src/combat/preview-encounter";

const easyProfile: AIProfile = {
  ...ENEMY_PROFILES.capable,
  awareness: 1, timingErrorTicks: 0, perceptionDelayTicks: 100,
  decisionNoise: 0, defensePreference: 1,
};

function readyEnemy(energy = 6): EncounterState {
  const s = createPreviewEncounter();
  return {
    ...s, activeActorId: "enemy",
    actors: { ...s.actors, enemy: { ...s.actors.enemy!, resource: energy } },
  };
}

describe("v0.4-B1 deterministic HFSM + utility enemy intelligence", () => {
  it("makes identical action traces for the same seed and battle state", () => {
    const choices = (seed: number): readonly CombatIntent[] => {
      const brain = new EnemyCombatBrain(ENEMY_PROFILES.capable, seed);
      const state = readyEnemy();
      const choice = brain.decide({
        state, catalog: PREVIEW_CATALOG, actorId: "enemy",
        targetId: "hero", distanceMeters: 8, tick: 100,
      });
      expect(brain.trace?.scores.length).toBeGreaterThan(1);
      expect(brain.trace?.selected).toEqual(choice);
      return [choice];
    };
    expect(choices(119)).toEqual(choices(119));
  });

  it("transitions across parent/substate hierarchy without combat-rule side effects", () => {
    const brain = new EnemyCombatBrain(easyProfile, 119);
    expect(brain.path).toEqual({ parent: "outside", branch: null, leaf: "observe" });
    const state = readyEnemy();
    brain.onEncounter(state, "enemy");
    expect(brain.path).toEqual({ parent: "engaged", branch: "offense", leaf: "decide" });
    brain.markCommitted();
    expect(brain.path).toEqual({ parent: "engaged", branch: "offense", leaf: "commit" });
    brain.markRecovering();
    expect(brain.path).toEqual({ parent: "engaged", branch: "recovery", leaf: "recover" });
    brain.onEncounter({ ...state, phase: "complete", victorId: "hero" }, "enemy");
    expect(brain.path).toEqual({ parent: "terminal", branch: null, leaf: "defeated" });
    expect(() => brain.markCommitted()).toThrow();
    brain.reset();
    expect(brain.path.parent).toBe("outside");
  });

  it("switches to bow when the target is out of melee engagement range", () => {
    const brain = new EnemyCombatBrain(easyProfile, 119);
    const state = readyEnemy();
    expect(getLegalEquipmentSwitches(state, PREVIEW_CATALOG, "enemy")).toEqual(["rakshasa_bow"]);
    const decision = brain.decide({
      state, catalog: PREVIEW_CATALOG, actorId: "enemy",
      targetId: "hero", distanceMeters: 16, tick: 0,
    });
    expect(decision).toEqual({ kind: "equip", equipmentId: "rakshasa_bow" });
    const session = new EncounterSession();
    session.end("hero");
    session.equip("enemy", "rakshasa_bow");
    expect(session.state.actors.enemy!.resource).toBe(7); // +1 own-turn regen; free switch
    expect(session.legalSwitches("enemy")).toEqual([]);
    expect(session.legalAttacks("hero", 16)).toContain("rakshasa_arrow");
    expect(() => session.equip("enemy", "rakshasa_sword")).toThrow();
  });

  it("picks a legal reaction and uses the exact same defense resolver as the player", () => {
    const session = new EncounterSession();
    session.attack("hero", "enemy", "arrow", 8, 100);
    const brain = new EnemyCombatBrain(easyProfile, 1);
    const planned = brain.planReaction(session.state, session.catalog, "enemy", 100);
    expect(planned).toMatchObject({ technique: "weapon_deflect", atTick: 1250 });
    expect(getLegalReactions(session.state, session.catalog).some(
      x => x.moveId === planned!.moveId)).toBe(true);
    expect(session.captureDefense(planned!.technique, planned!.atTick, "enemy").accepted).toBe(true);
    const result = session.resolveIfReady(1250, 8);
    expect(result?.outcome).toMatchObject({
      defenderId: "enemy", grade: "perfect", damage: 0,
      technique: "weapon_deflect",
    });
    expect(result?.outcome.energySpent).toBe(0);
    expect(result?.outcome.energyRefunded).toBe(0);
  });

  it("does not parry a melee move with a ranged-only equipped weapon", () => {
    const session = new EncounterSession();
    session.equip("hero", "sword");
    // In a fresh state the enemy is given bow equipment on its own turn.
    let state = createPreviewEncounter();
    state = {
      ...state,
      actors: { ...state.actors,
        hero: { ...state.actors.hero!, equippedId: "sword" },
        enemy: { ...state.actors.enemy!, equippedId: "rakshasa_bow" },
      },
    };
    const pending = queueAttack(state, {
      attackerId: "hero", defenderId: "enemy",
      moveId: "slash", distanceAtStartMeters: 6, startedTick: 100,
    }, PREVIEW_CATALOG);
    expect(getLegalReactions(pending, PREVIEW_CATALOG).map(x => x.technique)).toEqual(["dodge"]);
    const brain = new EnemyCombatBrain(easyProfile, 5);
    const decision = brain.planReaction(pending, PREVIEW_CATALOG, "enemy", 100);
    expect(decision === null || decision.technique === "dodge").toBe(true);
  });

  it("does not invent legal actions with zero Energy or wrong turn ownership", () => {
    const brain = new EnemyCombatBrain(easyProfile, 5);
    const heroTurn = createPreviewEncounter();
    expect(() => brain.decide({
      state: heroTurn, catalog: PREVIEW_CATALOG, actorId: "enemy",
      targetId: "hero", distanceMeters: 9, tick: 0,
    })).toThrow();
    const state = readyEnemy(0);
    const decision = brain.decide({
      state, catalog: PREVIEW_CATALOG, actorId: "enemy",
      targetId: "hero", distanceMeters: 6, tick: 100,
    });
    expect(["attack","end_turn"]).toContain(decision.kind); // Free opener remains legal
  });

  it("can choose ranged interception against an incoming arrow", () => {
    let state = createPreviewEncounter();
    state = {
      ...state,
      actors: { ...state.actors, enemy: {
        ...state.actors.enemy!, equippedId: "rakshasa_bow",
      } },
    };
    const pending = queueAttack(state, {
      attackerId: "hero", defenderId: "enemy",
      moveId: "arrow", distanceAtStartMeters: 8, startedTick: 0,
    }, PREVIEW_CATALOG);
    const options = getLegalReactions(pending, PREVIEW_CATALOG);
    expect(options.map(x => x.technique)).toEqual(["dodge", "projectile_intercept"]);
    const brain = new EnemyCombatBrain(easyProfile, 10);
    const decision = brain.planReaction(pending, PREVIEW_CATALOG, "enemy", 0);
    expect(decision).not.toBeNull();
    expect(options.some(x => x.moveId === decision!.moveId)).toBe(true);
  });

  it("models imperfect defenses and reacts at most once to each authored hit", () => {
    const session = new EncounterSession();
    session.attack("hero", "enemy", "arrow", 8, 100);
    const unaware = new EnemyCombatBrain({
      ...easyProfile, awareness: 0,
    }, 20);
    expect(unaware.planReaction(session.state, session.catalog, "enemy", 100)).toBeNull();
    expect(unaware.planReaction(session.state, session.catalog, "enemy", 100)).toBeNull();
    const late = new EnemyCombatBrain({
      ...easyProfile, perceptionDelayTicks: 1600,
    }, 20);
    expect(late.planReaction(session.state, session.catalog, "enemy", 100)).toBeNull();
    const always = new EnemyCombatBrain(easyProfile, 3);
    const first = always.planReaction(session.state, session.catalog, "enemy", 100);
    expect(always.planReaction(session.state, session.catalog, "enemy", 500)).toEqual(first);
  });

  it("uses only a small, bounded number of decisions per turn", () => {
    const brain = new EnemyCombatBrain(ENEMY_PROFILES.elite, 100);
    const state = readyEnemy();
    for (let i = 0; i < 100; i++) {
      const decision = brain.decide({
        state, catalog: PREVIEW_CATALOG, actorId: "enemy",
        targetId: "hero", distanceMeters: i % 2 ? 4 : 9, tick: i,
      });
      expect(["attack","equip","end_turn"]).toContain(decision.kind);
      expect(brain.trace!.scores.length).toBeLessThanOrEqual(32);
    }
  });

  it("rejects malformed difficulty profiles before accepting decisions", () => {
    expect(() => new EnemyCombatBrain({
      ...ENEMY_PROFILES.capable, awareness: 1.6,
    }, 5)).toThrow();
    expect(() => new EnemyCombatBrain(ENEMY_PROFILES.capable, Number.NaN)).toThrow();
  });
});

describe("target intelligence",()=>{
  it("selects unarmored, exposed weak spots",()=>{
    const brain=new EnemyCombatBrain({...ENEMY_PROFILES.elite,intelligence:1},1);
    expect(brain.selectTargetRegion(readyEnemy(),PREVIEW_CATALOG,"hero","rakshasa_arrow")).toBe("head");
  });
  it("supports tracking and resetting repeated attack patterns",()=>{
    const brain=new EnemyCombatBrain(ENEMY_PROFILES.elite,4);
    brain.observeAttack("hero","head");
    brain.observeAttack("hero","head");
    brain.observeAttack("hero","torso");
    brain.reset();
    expect(brain.state).toBe("observe");
  });
});