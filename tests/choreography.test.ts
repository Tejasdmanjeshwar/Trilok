import { describe, expect, it } from "vitest";
import { ReactionBuffer, SequencePlayer, validateSequence, type Sequence } from "../packages/choreography/src/index";

const example: Sequence<"camera" | "release" | "impact"> = {
  id: "bow-shot",
  durationMs: 1400,
  cues: [
    { id: "shot", type: "camera", atMs: 0 },
    { id: "release", type: "release", atMs: 650 },
    { id: "damage", type: "impact", atMs: 1100 },
  ],
};

describe("combat choreography", () => {
  it("emits cues exactly once across frame skips", () => {
    const player = new SequencePlayer();
    player.start(example, 5000);
    expect(player.advance(5000)?.cues.map(x => x.id)).toEqual(["shot"]);
    expect(player.advance(5040)?.cues).toEqual([]);
    expect(player.advance(7000)?.cues.map(x => x.id)).toEqual(["release", "damage"]);
    expect(player.advance(7100)).toBeNull();
  });

  it("does not refire events when clock moves backwards", () => {
    const player = new SequencePlayer();
    player.start(example, 0);
    expect(player.advance(1150)?.cues.map(x => x.id)).toEqual(["shot", "release", "damage"]);
    expect(player.advance(1000)?.cues).toEqual([]);
  });

  it("cancels pending damage on a restart", () => {
    const player = new SequencePlayer();
    player.start(example, 0);
    player.advance(680);
    player.cancel();
    expect(player.advance(1200)).toBeNull();
    player.start(example, 2400);
    expect(player.advance(2400)?.cues.map(x => x.id)).toEqual(["shot"]);
  });

  it("rejects invalid cue ordering and duplicate events", () => {
    expect(() => validateSequence({ ...example, cues: [
      { id: "late", type: "impact", atMs: 1000 },
      { id: "early", type: "camera", atMs: 20 },
    ] })).toThrow();
    expect(() => validateSequence({ ...example, cues: [
      { id: "same", type: "impact", atMs: 0 },
      { id: "same", type: "camera", atMs: 20 },
    ] })).toThrow();
  });

  it("captures only the first valid parry and respects late grace", () => {
    const buffer = new ReactionBuffer(1800);
    expect(buffer.capture(1419)).toBe(false);
    expect(buffer.capture(1710)).toBe(true);
    expect(buffer.capture(1800)).toBe(false);
    expect(buffer.offsetMs).toBe(-90);
  });

  it("accepts post-impact input within grace and rejects after", () => {
    const valid = new ReactionBuffer(1800);
    expect(valid.capture(2080)).toBe(true);
    expect(valid.offsetMs).toBe(280);
    expect(new ReactionBuffer(1800).capture(2081)).toBe(false);
  });
});
