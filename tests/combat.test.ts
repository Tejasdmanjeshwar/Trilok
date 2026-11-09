import { describe, expect, it } from "vitest";
import {
  beginBattle,
  gradeReaction,
  resolveEnemyTurn,
  strike,
} from "../packages/combat/src/index";

describe("Trilok combat domain", () => {
  it("starts with deterministic values", () => {
    expect(beginBattle()).toEqual(beginBattle());
    expect(beginBattle().phase).toBe("player_turn");
  });

  it("does not mutate its input and advances to the enemy turn", () => {
    const original = beginBattle();
    const next = strike(original);
    expect(original.enemy.hp).toBe(72);
    expect(next.enemy.hp).toBe(54);
    expect(next.phase).toBe("enemy_windup");
  });

  it("grades reaction boundaries deterministically", () => {
    expect(gradeReaction(-90)).toBe("perfect");
    expect(gradeReaction(91)).toBe("parry");
    expect(gradeReaction(-201)).toBe("guard");
    expect(gradeReaction(381)).toBe("miss");
    expect(gradeReaction(null)).toBe("miss");
    expect(gradeReaction(Number.NaN)).toBe("miss");
  });

  it("resolves a perfect parry without damage", () => {
    const afterAttack = strike(beginBattle());
    const next = resolveEnemyTurn(afterAttack, "perfect");
    expect(next.hero.hp).toBe(100);
    expect(next.phase).toBe("player_turn");
    expect(next.round).toBe(2);
  });

  it("rejects attacks during an enemy turn", () => {
    expect(() => strike(strike(beginBattle()))).toThrow();
  });

  it("reaches victory and never produces negative enemy hp", () => {
    let state = beginBattle();
    for (let i = 0; i < 4; i++) {
      state = strike(state);
      if (state.phase === "enemy_windup") {
        state = resolveEnemyTurn(state, "perfect");
      }
    }
    expect(state.phase).toBe("victory");
    expect(state.enemy.hp).toBe(0);
  });
});
