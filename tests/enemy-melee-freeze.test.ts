import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { EnemyCombatBrain, ENEMY_PROFILES } from "../packages/combat-ai/src/index";
import { SequencePlayer } from "../packages/choreography/src/index";
import { createWarrior } from "../apps/web/src/actors/warrior";
import { CombatHitVolumes } from "../apps/web/src/combat/CombatHitVolumes";
import { EncounterSession } from "../apps/web/src/combat/EncounterSession";
import { presentationForAttack } from "../apps/web/src/combat/attack-presentation";
import { PREVIEW_CATALOG } from "../apps/web/src/combat/preview-encounter";
import { CombatMovementController } from "../apps/web/src/movement/CombatMovementController";
import type { CombatCue } from "../apps/web/src/combat/sequences";

describe("D8.1: enemy opening melee cannot freeze the arena", () => {
  it("ties every preview attack cue to the domain impact marker", () => {
    for (const move of Object.values(PREVIEW_CATALOG.attacks)) {
      const presentation = presentationForAttack(move);
      const cue = presentation.sequence.cues.find(c =>
        c.type === "melee_impact" || c.type === "enemy_impact" || c.type === "arrow_hit");
      expect(cue?.atMs, move.id).toBe(move.impactOffsetTicks);
      if (move.delivery === "melee_contact") {
        expect(presentation.approachDurationMs).toBeLessThan(move.impactOffsetTicks);
      }
    }
    expect(presentationForAttack(PREVIEW_CATALOG.attacks.rakshasa_rapid_slash!).motion)
      .toBe("rapid_melee");
    expect(presentationForAttack(PREVIEW_CATALOG.attacks.rakshasa_heavy!).motion)
      .toBe("heavy_melee");
  });

  it("closes to weapon reach before the first rapid strike impact cue", () => {
    const move = PREVIEW_CATALOG.attacks.rakshasa_rapid_slash!;
    const plan = presentationForAttack(move);
    const enemy = new THREE.Group(), hero = new THREE.Group();
    enemy.position.set(7, 0, 0);
    hero.position.set(-3, 0, 0);
    const movement = new CombatMovementController();
    movement.register(enemy);
    movement.register(hero);
    movement.approach(enemy, hero, move.reachMeters, 1000, plan.approachDurationMs);
    const sequence = new SequencePlayer<CombatCue>();
    sequence.start(plan.sequence, 1000);
    const sample = sequence.advance(1000 + move.impactOffsetTicks)!;
    expect(sample.cues.map(c => c.type)).toContain("melee_impact");
    movement.update(1000 + move.impactOffsetTicks);
    expect(movement.separation(enemy, hero)).toBeCloseTo(move.reachMeters, 5);
  });

  it("resolves the actual AI first-turn rapid strike at its 720ms marker", () => {
    const session = new EncounterSession();
    session.end("hero");
    const brain = new EnemyCombatBrain({...ENEMY_PROFILES.capable, decisionNoise: 0}, 119);
    const intent = brain.decide({
      state: session.state, catalog: session.catalog,
      actorId:"enemy", targetId:"hero", distanceMeters:9, tick:1000,
    });
    expect(intent).toEqual({kind:"attack",moveId:"rakshasa_rapid_slash"});
    if (intent.kind !== "attack") throw new Error("Expected opening melee attack.");
    session.attack("enemy","hero",intent.moveId,9,1000,"head");
    expect(session.state.pending?.impactTick).toBe(1720);
    expect(session.resolveIfReady(1720,9)).toBeNull(); // defender's late dodge grace
    const result = session.resolveIfReady(1840,9);
    expect(result?.outcome).toMatchObject({result:"out_of_reach",damage:0});
    expect(session.state.pending).toBeNull();
    expect(session.state.phase).toBe("decision");
    expect(session.state.activeActorId).toBe("enemy");
    expect(session.state.turnBudget.actionsUsed).toBe(0);
  });

  it("requires hit geometry within reach but accepts explicit missed melee contact", () => {
    const session = new EncounterSession();
    session.end("hero");
    session.attack("enemy","hero","rakshasa_rapid_slash",1.7,100,"head");
    expect(() => session.resolveIfReady(940,1.7)).toThrow(/authoritative impact region/);
    const rig = createWarrior("archer");
    const volumes = new CombatHitVolumes(rig.root,session.state.actors.hero!,PREVIEW_CATALOG);
    const head = volumes.worldCenter("head");
    const from = head.clone().add(new THREE.Vector3(0,0,1.4));
    const contact = volumes.meleeImpact(from,"head",1.9,1.7);
    expect(contact).toMatchObject({contact:true,actualRegionId:"head"});
    const result = session.resolveIfReady(940,1.7,undefined,contact);
    expect(result?.outcome.damage).toBeGreaterThan(0);
    expect(session.state.pending).toBeNull();
    const miss = volumes.meleeImpact(from,"head",1.9,3);
    expect(miss).toMatchObject({contact:false,actualRegionId:null});
    volumes.dispose();
    rig.dispose();
  });
});
