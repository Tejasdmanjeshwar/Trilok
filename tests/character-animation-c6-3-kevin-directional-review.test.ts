import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {createAnatomyPreset} from "../packages/character-core/src/presets";
import {validateAnimationClip} from "../packages/character-core/src/animation";
import catalog from "../assets/animations/sources/kevin-basic-motions-v1.json";
import base from "../assets/animations/studio-v1/kevin/manifest.json";
import review from "../assets/animations/studio-v1/kevin/c63/manifest.json";
describe("Kevin C6.3 directional review",()=>{
  it("has 24 exact source-backed immutable clips using the original profile",()=>{
    expect(review.entries).toHaveLength(24);
    expect(review.profileSha256).toBe(base.profileSha256);
    expect(review.immutableSourceRestSha256).toBe(base.immutableSourceRestSha256);
    expect(review.targetCalibrationSha256).toBe(base.targetCalibrationSha256);
    const graph=createAnatomyPreset({archetype:"human"});
    for(const [i,c] of catalog.c63ReviewClips.entries()){
      const entry=review.entries[i]!;
      expect(entry.id).toBe(c.id);
      expect(entry.sourceFile).toBe(c.sourceFile);
      const bytes=readFileSync("assets/animations/studio-v1/kevin/c63/"+c.id+".clip.json");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.outputSha256);
      const clip=JSON.parse(bytes.toString("utf8"));
      validateAnimationClip(clip,graph);
      expect(clip.tracks).toHaveLength(49);
      expect(clip.rootTrajectory?.behavior).toBe(c.behavior);
      expect(clip.tracks.every((t:{channel:string})=>t.channel==="rotation")).toBe(true);
      expect(entry.sampledRealMakeHumanSkin.every(s=>s.nonfinite===0)).toBe(true);
    }
  });
});
