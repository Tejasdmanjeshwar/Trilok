import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CombatMovementController } from "../apps/web/src/movement/CombatMovementController";
import { createAnimatedWarrior } from "../apps/web/src/actors/AnimatedWarrior";

describe("combat footwork", () => {
  it("approaches aggressively while remaining at exactly weapon reach", () => {
    const mover = new CombatMovementController();
    const hero = new THREE.Group();
    const enemy = new THREE.Group();
    enemy.position.x = 9;
    mover.register(hero);
    mover.register(enemy);
    mover.approach(hero, enemy, 2, 0, 1000);
    expect(mover.activity(hero)).toBe("approach");
    mover.update(400);
    expect(hero.position.x).toBeGreaterThan(5);
    mover.update(1000);
    expect(hero.position.x).toBeCloseTo(7, 5);
    expect(mover.activity(hero)).toBeNull();
    mover.retreat(hero, 1000, 500);
    expect(mover.activity(hero)).toBe("retreat");
    mover.update(1500);
    expect(hero.position.x).toBe(0);
    expect(mover.activity(hero)).toBeNull();
  });

  it("dodges out of the way immediately then returns", () => {
    const mover = new CombatMovementController();
    const hero = new THREE.Group();
    const enemy = new THREE.Group();
    enemy.position.x = 2;
    mover.register(hero);
    mover.register(enemy);
    mover.dodge(hero, enemy, 0, 750, 2);
    mover.update(130);
    expect(Math.abs(hero.position.z)).toBeGreaterThan(1.9);
    expect(mover.activity(hero)).toBe("dodge");
    mover.update(750);
    expect(hero.position.length()).toBe(0);
    expect(mover.activity(hero)).toBeNull();
  });

  it("animates locomotion as a separate layer without replacing weapon motions", () => {
    const warrior = createAnimatedWarrior("archer");
    const leftLeg = warrior.root.getObjectByName("LeftLeg");
    expect(leftLeg).toBeDefined();
    warrior.play("melee");
    warrior.setLocomotion(true);
    for (let i = 0; i < 12; i++) warrior.update(1 / 60, i * 1000 / 60);
    expect(Math.abs(leftLeg!.rotation.x)).toBeGreaterThan(.02);
    warrior.setLocomotion(false);
    for (let i = 0; i < 80; i++) warrior.update(1 / 60);
    expect(Math.abs(leftLeg!.rotation.x)).toBeLessThan(.01);
    warrior.dispose();
  });
});
