import { describe, expect, it } from "vitest";
import { compactBuildLabel, formatBuildReport, type BuildIdentity } from "../apps/web/src/build-info";

const example: BuildIdentity = {
  playableVersion: "0.3.2",
  combatEngineVersion: "0.4-A.3",
  channel: "prototype",
  commitSha: "12345678abcdef12345678abcdef12345678abcdef12".slice(0, 40),
  builtAtUtc: "2026-11-11T09:24:56.123Z",
  buildId: "12345678-20261111T092456123Z",
};
describe("visible build identity", () => {
  it("keeps playable and combat engine versions distinct", () => {
    const report = formatBuildReport(example);
    expect(report).toContain("Playable version: v0.3.2");
    expect(report).toContain("Combat engine: v0.4-A.3");
    expect(report).toContain(example.buildId);
    expect(report).toContain(example.commitSha);
    expect(report).toContain(example.builtAtUtc);
  });
  it("shows revision and UTC time on the overlay", () => {
    expect(compactBuildLabel(example)).toBe("BUILD 12345678 · 09:24 UTC");
  });
  it("distinguishes local development builds", () => {
    expect(compactBuildLabel({ ...example, commitSha: "unknown" }))
      .toBe("BUILD LOCAL · 09:24 UTC");
  });
});
