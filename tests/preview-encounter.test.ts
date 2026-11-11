import { describe, expect, it } from "vitest";
import {
  getLegalAttackMoves, getLegalReactions, getLegalReactions as reactions,
  type ReactionTechnique,
} from "../packages/combat/src/index";
import { EncounterSession } from "../apps/web/src/combat/EncounterSession";
import { createPreviewEncounter, PREVIEW_CATALOG } from "../apps/web/src/combat/preview-encounter";

describe("v0.4-B0 playable encounter adapter", () => {
  it("starts a versioned preview with visible Energy and a real action budget", () => {
    const session = new EncounterSession();
    expect(session.state.actors.hero).toMatchObject({ hp: 100, resource: 4, maxResource: 8, equippedId: "bow" });
    expect(session.state.rules.maxActionsPerTurn).toBe(3);
    expect(session.legalAttacks("enemy", 9)).toEqual(["arrow", "recover_shot"]);
  });

  it("chains three affordable shots, without ending the turn on the first", () => {
    const session = new EncounterSession();
    for (let i = 0; i < 3; i++) {
      const now = 100 + i * 3000;
      session.attack("hero", "enemy", "arrow", 9, now);
      expect(session.state.actors.hero!.resource).toBe(3 - i);
      expect(session.resolveIfReady(now + 1149, 9)).toBeNull();
      const result = session.resolveIfReady(now + 1150, 9)!;
      expect(result.outcome).toMatchObject({ damage: 18, finalHit: true, attackerId: "hero" });
      expect(session.state.actors.enemy!.hp).toBe(88 - 18 * (i + 1));
      if (i < 2) expect(session.state.activeActorId).toBe("hero");
    }
    expect(session.state.activeActorId).toBe("enemy");
    expect(session.legalAttacks("hero", 3)).toContain("overhead_slash");
  });

  it("uses domain timing window for both early parry and late dodge", () => {
    const session = new EncounterSession();
    session.end("hero");
    session.attack("enemy", "hero", "overhead_slash", 6, 2000);
    expect(session.state.pending?.impactTick).toBe(3850);
    expect(session.legalReactions().map(x => x.technique)).toEqual(["dodge"]);
    expect(session.captureDefense("weapon_deflect", 3810).accepted).toBe(false);
    expect(session.captureDefense("dodge", 3400)).toEqual({ accepted: false, reason: "too_early" });
    const accepted = session.captureDefense("dodge", 3900);
    expect(accepted.accepted).toBe(true);
    const outcome = session.resolveIfReady(3900, 1.8)!;
    expect(outcome.outcome).toMatchObject({ grade: "perfect", damage: 0, technique: "dodge" });
    expect(session.state.activeActorId).toBe("hero");
    expect(session.state.actors.hero!.resource).toBe(5); // First dodge free, +1 own-turn regen
  });

  it("waits for late reaction grace before applying an undefended enemy hit", () => {
    const session = new EncounterSession();
    session.end("hero");
    session.attack("enemy", "hero", "overhead_slash", 6, 1000);
    expect(session.resolveIfReady(2850, 1.8)).toBeNull();
    expect(session.resolveIfReady(2969, 1.8)).toBeNull();
    const outcome = session.resolveIfReady(2970, 1.8)!;
    expect(outcome.outcome.damage).toBe(14);
    expect(session.state.actors.hero!.hp).toBe(86);
    expect(session.resolveIfReady(4000, 1.8)).toBeNull();
  });

  it("uses sword-deflect rules after a free weapon switch", () => {
    const session = new EncounterSession();
    session.equip("hero", "sword");
    expect(session.state.actors.hero!.resource).toBe(4);
    expect(session.legalAttacks("enemy", 9)).toEqual(["rapid_slash", "slash", "heavy_crush"]);
    session.end("hero");
    session.attack("enemy", "hero", "overhead_slash", 6, 100);
    const techniques = session.legalReactions().map(x => x.technique);
    expect(techniques).toContain("weapon_deflect");
    expect(techniques).toContain("dodge");
    expect(session.captureDefense("weapon_deflect", 1950).accepted).toBe(true);
    const result = session.resolveIfReady(1950, 1.8)!;
    expect(result.outcome.grade).toBe("perfect");
    expect(result.outcome.damage).toBe(0);
  });

  it("recovery shot grants bounded Energy, ends turn, then restart clears everything", () => {
    const session = new EncounterSession();
    session.attack("hero", "enemy", "recover_shot", 8, 0);
    expect(session.state.actors.hero!.resource).toBe(4);
    session.resolveIfReady(1150, 8);
    expect(session.state.actors.hero!.resource).toBe(6);
    expect(session.state.activeActorId).toBe("enemy");
    session.reset();
    expect(session.state.actors.hero!.resource).toBe(4);
    expect(session.state.actors.enemy!.hp).toBe(88);
    expect(session.state.phase).toBe("decision");
  });

  it("keeps legal-attack queries authoritative and distance aware", () => {
    let state = createPreviewEncounter();
    expect(getLegalAttackMoves(state, PREVIEW_CATALOG, "enemy", 40)).toEqual([]);
    state = { ...state, actors: { ...state.actors, hero: { ...state.actors.hero!, resource: 0 } } };
    expect(getLegalAttackMoves(state, PREVIEW_CATALOG, "enemy", 9)).toEqual(["recover_shot"]);
    expect(getLegalReactions(state, PREVIEW_CATALOG)).toEqual([]);
  });
});
