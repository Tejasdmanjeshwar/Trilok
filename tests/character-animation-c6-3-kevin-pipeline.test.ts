import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {createAnatomyPreset} from "../packages/character-core/src/presets";
import {validateAnimationClip} from "../packages/character-core/src/animation";
import manifest from "../assets/animations/studio-v1/kevin/manifest.json";
import ual from "../assets/animations/studio-v1/manifest.json";
import catalog from "../assets/animations/sources/kevin-basic-motions-v1.json";
describe("C6.3 Kevin build-time integration",()=>{
  it("pins the original source family and first three canonical selections",()=>{
    expect(catalog.archiveSha256).toBe(
      "063d5e1822f85549d14035ef342b1feae45bac37962499a8b478c7eb997200cd");
    expect(catalog.expectedMaleClipCount).toBe(58);
    expect(catalog.clips.map(c=>c.id)).toEqual([
      "human-kevin-idle","human-kevin-walk","human-kevin-run",
    ]);
  });
  it("removes player ZIP inputs, experimental query switches and runtime FBX loaders",()=>{
    const viewport=readFileSync("apps/web/src/studio/StudioViewport.ts","utf8");
    const main=readFileSync("apps/web/src/studio/main.ts","utf8");
    const library=readFileSync("apps/web/src/studio/StudioAnimationLibrary.ts","utf8");
    expect(viewport).not.toMatch(/importKevinArchive|KevinLocalRetarget|localKevinFile/);
    expect(main).not.toMatch(/studio-kevin-file|c63-kevin-local-review|\.zip/);
    expect(library).toContain("kevinCatalog.clips");
    expect(library).toContain("import.meta.glob");
    expect(library).not.toMatch(/FBXLoader|DecompressionStream|importOwnedKevinZip/);
  });

  it("versions and pins one reusable 49-joint rig calibration for all three source motions",()=>{
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.sourceArchiveSha256).toBe(catalog.archiveSha256);
    expect(manifest.sourceFamilyMaleClipCount).toBe(58);
    expect(manifest.profileSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.sourceBindEvidence.skinClusterCount).toBe(52);
    expect(manifest.sourceBindEvidence.maximumBindResidual).toBeLessThan(.001);
    expect(manifest.sourceBindEvidence.maximumRestAngleRadians).toBeLessThan(.002);
    const profile=readFileSync("assets/animations/studio-v1/kevin/profile.json","utf8");
    expect(createHash("sha256").update(profile).digest("hex")).toBe(manifest.profileSha256);
    expect(JSON.parse(profile).calibrations).toHaveLength(49);
    expect(manifest.entries.map(entry=>entry.id)).toEqual(catalog.clips.map(entry=>entry.id));
  });
  it("validates source-backed canonical Kevin animation resources and immutable hashes",()=>{
    const graph=createAnatomyPreset({archetype:"human"});
    for(const entry of manifest.entries){
      const encoded=readFileSync("assets/animations/studio-v1/kevin/"+entry.id+".clip.json","utf8");
      expect(createHash("sha256").update(encoded).digest("hex")).toBe(entry.outputSha256);
      const clip=JSON.parse(encoded);
      expect(clip.id).toBe(entry.id);
      expect(clip.source.sha256).toBe(entry.sourceSha256);
      expect(clip.source.creator).toBe("kevin-iglesias");
      expect(clip.retarget.mode).toBe("rest_delta");
      validateAnimationClip(clip,graph);
      expect(clip.tracks.filter((track:{channel:string})=>track.channel==="rotation")).toHaveLength(49);
      expect(entry.keyCount).toBeGreaterThan(20);
      expect(entry.maxSeamDegrees).toBeLessThan(.01);
      for(const skin of entry.sampledRealMakeHumanSkin){
        expect(skin.nonfinite).toBe(0);
        expect(skin.maxDeformedDistanceMeters).toBeLessThan(2.5);
      }
    }
  });
  it("preserves approved UAL1 identities and reference clip hashes",()=>{
    expect(ual.profileSha256).toBe("159e7b77c3997364e7fed624a17f13be280c25a07d2fc913c2880627211834e2");
    expect(ual.entries).toHaveLength(4);
    for(const entry of ual.entries){
      const bytes=readFileSync("assets/animations/studio-v1/"+entry.filename);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.artifactSha256);
    }
  });
});
