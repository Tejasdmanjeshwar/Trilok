import { describe, it, expect } from "vitest";
import { sampleLicensedVanaraFace, VANARA_ATLAS_SOURCE } from
  "../apps/web/src/characters/geometry/LicensedVanaraFaceAtlas";

/** These depths originate from actual GLB vertex sampling, not synthetic spheres. */
describe("C3.5 CC BY 4.0 licensed Vanara facial relief", () => {
  it("tracks the exact source, attribution, density and bounds", () => {
    expect(VANARA_ATLAS_SOURCE.license).toBe("CC BY 4.0");
    expect(VANARA_ATLAS_SOURCE.creator).toBe("iRahulRajput");
    expect(VANARA_ATLAS_SOURCE.glbSHA256).toHaveLength(64);
    expect(VANARA_ATLAS_SOURCE.sampledCells).toBe(1660);
    expect(sampleLicensedVanaraFace(0, .82)).toBeUndefined();
    expect(sampleLicensedVanaraFace(.4, .7)).toBeUndefined();
    expect(sampleLicensedVanaraFace(NaN, .7)).toBeUndefined();
    expect(sampleLicensedVanaraFace(0, Infinity)).toBeUndefined();
  });

  it("resolves separate real-source eye, brow, nose, lips and cheek depths", () => {
    const d = (x: number, y: number) => sampleLicensedVanaraFace(x, y)!.depth;
    const eyeLeft = d(-.04, .743), eyeRight = d(.04, .743);
    const nose = d(0, .704), lips = d(0, .665);
    const cheek = d(.068, .714), brow = d(0, .761);
    expect(Math.abs(eyeLeft-eyeRight)).toBeLessThan(.015);
    expect(nose).toBeGreaterThan(eyeLeft+.015);
    expect(lips).toBeGreaterThan(cheek+.045);
    expect(brow).toBeGreaterThan(.16);
    expect(d(0, .704)).toBe(nose);
  });

  it("samples continuously without generating or mutating geometry", () => {
    const a = sampleLicensedVanaraFace(.014, .710)!;
    const b = sampleLicensedVanaraFace(.01401, .71001)!;
    expect(a.coverage).toBeGreaterThan(.5);
    expect(a.depth).toBeGreaterThan(.1);
    expect(a.depth).toBeLessThan(.225);
    expect(Math.abs(a.depth-b.depth)).toBeLessThan(.001);
  });
});