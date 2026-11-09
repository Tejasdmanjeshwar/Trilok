import { describe, expect, it } from "vitest";
import { SeededRandom, terrainHeight, valueNoise } from "../apps/web/src/world/terrain";

describe("seeded arena geography", () => {
  it("generates deterministic random sequences", () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    expect(Array.from({ length: 80 }, () => a.next()))
      .toEqual(Array.from({ length: 80 }, () => b.next()));
  });
  it("preserves a flat combat clearing", () => {
    for (let x = -12; x <= 12; x += 2) {
      for (let z = -12; z <= 12; z += 2) {
        if (Math.hypot(x, z) <= 12) expect(terrainHeight(x, z, 119)).toBe(0);
      }
    }
  });
  it("produces finite heights and noise for widely spaced tiles", () => {
    for (const x of [-100, -40, 0, 21, 132, 1_000_000]) {
      for (const z of [-200, -7, 13, 121]) {
        expect(Number.isFinite(terrainHeight(x, z, 123))).toBe(true);
        expect(valueNoise(x * 0.1, z * 0.1, 14)).toBeGreaterThanOrEqual(0);
        expect(valueNoise(x * 0.1, z * 0.1, 14)).toBeLessThanOrEqual(1);
      }
    }
  });
  it("varies distant terrain when the seed changes", () => {
    expect(terrainHeight(45, 55, 123)).not.toBe(terrainHeight(45, 55, 124));
  });
});
