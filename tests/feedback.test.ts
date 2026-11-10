import { describe, expect, it } from "vitest";
import { falloff } from "../apps/web/src/feedback/CombatFeedback";

describe("presentation feedback envelopes", () => {
  it("starts strong, falls smoothly, and never goes negative", () => {
    expect(falloff(0, 300)).toBe(1);
    expect(falloff(150, 300)).toBeCloseTo(.25);
    expect(falloff(300, 300)).toBe(0);
    expect(falloff(800, 300)).toBe(0);
    expect(falloff(-200, 300)).toBe(1);
  });
  it("rejects invalid durations and times", () => {
    expect(falloff(40, 0)).toBe(0);
    expect(falloff(Number.NaN, 500)).toBe(0);
    expect(falloff(12, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
