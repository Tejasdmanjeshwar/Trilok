import { describe, expect, it } from "vitest";
import {
  WEAPONS, availableDefenses, beginBattle, equipWeapon, equippedWeapon,
  resolveEnemyTurn, strike,
} from "../packages/combat/src/index";
import { CombatMovementController } from "../apps/web/src/movement/CombatMovementController";
import * as THREE from "three";

describe("weapon-aware combat", () => {
  it("defaults to a ranged bow and dodge-only defense", () => {
    const battle = beginBattle();
    expect(equippedWeapon(battle.hero)).toEqual(WEAPONS.bow);
    expect(availableDefenses(battle.hero)).toEqual(["dodge"]);
    expect(() => resolveEnemyTurn(strike(battle), "perfect", "parry")).toThrow();
  });

  it("allows equipping a sword only during decision time", () => {
    const battle = equipWeapon(beginBattle(), "sword");
    expect(availableDefenses(battle.hero)).toEqual(["dodge", "parry"]);
    expect(strike(battle, 1.8).enemy.hp).toBe(50);
    expect(() => equipWeapon(strike(battle, 1.8), "bow")).toThrow();
  });

  it("requires range information and rejects melee hits outside weapon reach", () => {
    const battle = equipWeapon(beginBattle(), "sword");
    expect(() => strike(battle)).toThrow();
    expect(() => strike(battle, 3)).toThrow();
    expect(strike(battle, 1.9).enemy.hp).toBe(50);
    expect(strike(beginBattle(), 18).enemy.hp).toBe(54);
    expect(() => strike(beginBattle(), 40)).toThrow();
  });

  it("distinguishes successful dodges and parries in domain outcomes", () => {
    const initial = strike(beginBattle());
    expect(resolveEnemyTurn(initial, "parry", "dodge").hero.hp).toBe(100);
    const swordBattle = strike(equipWeapon(beginBattle(), "sword"), 1.8);
    expect(resolveEnemyTurn(swordBattle, "parry", "parry").hero.hp).toBe(98);
  });
});

describe("melee approach choreography", () => {
  it("closes only to weapon reach without moving vertically", () => {
    const mover = new CombatMovementController();
    const hero = new THREE.Group();
    const enemy = new THREE.Group();
    hero.position.set(-4, 0.15, 3);
    enemy.position.set(4, 0.12, -3);
    mover.register(hero);
    mover.register(enemy);
    mover.approach(hero, enemy, 1.9, 1000, 900);
    mover.update(1900);
    expect(mover.separation(hero, enemy)).toBeCloseTo(1.9, 6);
    expect(hero.position.y).toBeCloseTo(0.15, 6);
    mover.retreat(hero, 1900, 600);
    mover.update(2500);
    expect(hero.position.x).toBeCloseTo(-4, 6);
    expect(hero.position.z).toBeCloseTo(3, 6);
  });

  it("supports frame-skip recovery and reset during movement", () => {
    const mover = new CombatMovementController();
    const a = new THREE.Group();
    const b = new THREE.Group();
    b.position.set(8, 0, 0);
    mover.register(a);
    mover.register(b);
    mover.approach(b, a, 1.9, 0, 1000);
    mover.update(2000);
    expect(mover.separation(a, b)).toBeCloseTo(1.9);
    mover.dodge(a, b, 2000, 600);
    mover.update(2200);
    expect(a.position.z).not.toBe(0);
    mover.update(2600);
    mover.reset();
    expect(a.position.length()).toBe(0);
    expect(b.position.x).toBe(8);
  });
});
