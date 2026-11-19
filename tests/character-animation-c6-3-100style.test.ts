import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {
  createAnatomyPreset,parseAnimationClip,createAnimationSampler,
} from "../packages/character-core/src/index";
import {
  STUDIO_ANIMATIONS,resolveStudioAnimationId,
} from "../apps/web/src/studio/StudioAnimationLibrary";
import {createSkinningSpike} from "../apps/web/src/characters/geometry/SkinningSpike";
import {StudioAnimationPlayback} from "../apps/web/src/studio/StudioAnimationPlayback";

const base="assets/animations/studio-v1/";
const digest=(bytes:Buffer|string)=>createHash("sha256").update(bytes).digest("hex");
const graph=createAnatomyPreset({archetype:"human"});
const manifest=JSON.parse(readFileSync(base+"100style-neutral-manifest.json","utf8")) as {
  kind:string;license:string;acceptedForProduction:boolean;
  profileSha256:string;sourceFamilySha256:string;sourceSagittalReflection:boolean;
  sourceAnteriorSignEvidence:{filename:string;directionDot:number}[];
  clips:{id:string;originalSha256:string;artifactSha256:string;bytes:number;
    targetAngularSeamMaxDegrees:number;loopRange:number[]}[];
};

describe("C6.3 genuine 100STYLE Neutral motion — unaccepted reviewer-only assets",()=>{
  it("keeps normal Studio choices identical to the owner-approved C6.2 motions",()=>{
    expect(STUDIO_ANIMATIONS.map(x=>x.id)).toEqual([
      "human-idle","human-walk","human-jog","human-sprint","locomotion-preview",
    ]);
    for(const entry of manifest.clips){
      expect(()=>resolveStudioAnimationId(entry.id)).toThrow(/unaccepted/);
    }
  });
  it("pins exact official sources, one shared calibration and all three canonical clips",()=>{
    expect(manifest.kind).toBe("c6.3-100style-neutral-experimental");
    expect(manifest.license).toBe("CC-BY-4.0");
    expect(manifest.acceptedForProduction).toBe(false);
    expect(manifest.clips).toHaveLength(3);
    // Measured official authored *forward* travel must be opposite the
    // publisher's geometric hip-cross convention before the shared
    // conversion. A coordinate regression must not be patched clip-by-clip.
    expect(manifest.sourceSagittalReflection).toBe(true);
    expect(manifest.sourceAnteriorSignEvidence.map(p=>p.filename)).toEqual([
      "Neutral_FW.bvh","Neutral_FR.bvh",
    ]);
    for(const evidence of manifest.sourceAnteriorSignEvidence){
      expect(evidence.directionDot).toBeLessThan(-.99);
    }
    expect(manifest.sourceFamilySha256).toBe(
      "6e04c8293605f3e1d3f2599141922ffc9872c07f7339f97422fa2e56de9db4d9");
    const profile=readFileSync(base+"100style-neutral-profile.json");
    expect(digest(profile)).toBe(manifest.profileSha256);
    const profileData=JSON.parse(profile.toString("utf8")) as {
      schemaVersion:number;calibrations:{sourceId:string;targetId:string}[];
    };
    expect(profileData.schemaVersion).toBe(1);
    expect(profileData.calibrations).toHaveLength(21);
    expect(new Set(profileData.calibrations.map(x=>x.targetId)).size).toBe(21);
    expect(manifest.clips.map(c=>c.originalSha256)).toEqual([
      "71aead2e3246bdb47a5b839cb3e60e0574e9a1a046c071cc147e2922a35f259f",
      "2f28800baa299547c42c257d1c926172542a1e69b46a3d3e6aa0aded0e9b40f6",
      "f46ca526027a3654c8939a0123413f6008906fb32125d5e885eafcaa830831cb",
    ]);
    for(const entry of manifest.clips){
      const serialized=readFileSync(base+entry.id+".clip.json","utf8");
      const clip=parseAnimationClip(serialized,graph);
      expect(digest(serialized)).toBe(entry.artifactSha256);
      expect(Buffer.byteLength(serialized)).toBe(entry.bytes);
      expect(clip.id).toBe(entry.id);
      expect(clip.source.license).toBe("CC-BY-4.0");
      expect(clip.source.sha256).toBe(entry.originalSha256);
      expect(clip.rootMotion).toBe(entry.id.endsWith("idle")?"locked":"visual_only");
      expect(clip.tracks.filter(t=>t.channel==="rotation")).toHaveLength(21);
      expect(entry.loopRange[1]!).toBeGreaterThan(entry.loopRange[0]!);
      expect(entry.targetAngularSeamMaxDegrees).toBeLessThan(
        entry.id.endsWith("idle")?2:entry.id.endsWith("walk")?9:18);
    }
  });
  it("does not invert the BVH End Site toe direction after source-frame reflection",()=>{
    // The published BVH distal toe tip points ahead in local source space.
    // A missing reflection of the End Site *offset* leaves a near-180-degree
    // toe delta, even when all ankle-to-toe shaft errors are close to zero.
    // A right-angle test detects reversed toe axes; it does NOT claim
    // satisfactory sole contact or aesthetically credible foot animation.
    const toeRoles=graph.joints.filter(j=>j.role==="toe_left"||j.role==="toe_right");
    expect(toeRoles).toHaveLength(2);
    for(const entry of manifest.clips){
      const clip=parseAnimationClip(readFileSync(base+entry.id+".clip.json","utf8"),graph);
      for(const toe of toeRoles){
        const track=clip.tracks.find(t=>t.jointId===toe.id&&t.channel==="rotation");
        expect(track,entry.id+" missing "+toe.role).toBeDefined();
        for(const value of track!.values){
          const radians=2*Math.acos(Math.min(1,Math.abs(value[3]!)));
          expect(radians,entry.id+" inverted "+toe.role).toBeLessThan(Math.PI/2);
        }
      }
    }
  });
  it("samples deterministically and restores the same C1 skinned runtime representation",()=>{
    const model=createSkinningSpike();
    try{
      const pelvis=model.graph.joints.find(j=>j.role==="pelvis")!.id;
      const before=model.character.joint(pelvis).quaternion.clone();
      for(const entry of manifest.clips){
        const clip=parseAnimationClip(readFileSync(base+entry.id+".clip.json","utf8"),model.graph);
        const sampler=createAnimationSampler(clip,model.graph);
        for(const t of [0,.1,.25,clip.durationSeconds]){
          expect(sampler.sample(t)).toEqual(sampler.sample(t));
          for(const pose of sampler.sample(t)){
            if(pose.rotation)expect(Math.hypot(...pose.rotation)).toBeCloseTo(1,5);
            if(pose.translation)expect(pose.translation[2]).toBe(0);
          }
        }
        const player=new StudioAnimationPlayback(model.character,clip);
        try{
          player.seek(clip.durationSeconds*.5);
          player.seek(0.3);
          const first=model.character.joint(pelvis).quaternion.clone();
          player.seek(0);
          player.seek(.3);
          expect(model.character.joint(pelvis).quaternion.angleTo(first)).toBeLessThan(1e-6);
        }finally{player.dispose();}
        expect(model.character.joint(pelvis).quaternion.angleTo(before)).toBeLessThan(1e-6);
      }
    }finally{model.dispose();}
  });
});
