import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {
  createAnatomyPreset,createAnimationSampler,serializeAnimationClip,parseAnimationClip,
  REFERENCE_MOTION_SOURCES,bakeReferenceMotion,validateReferenceMotionSource,
} from "../packages/character-core/src/index";
import {createSkinningSpike} from "../apps/web/src/characters/geometry/SkinningSpike";
import {loadBakedStudioAnimation} from "../apps/web/src/studio/StudioReferenceLibrary";
import {StudioAnimationPlayback} from "../apps/web/src/studio/StudioAnimationPlayback";

const graph=createAnatomyPreset({archetype:"human"});
describe("C6.2 deterministic reference motions",()=>{
  it("verifies actual baked JSON bytes against provenance and regenerated source",()=>{
    const manifest=JSON.parse(readFileSync("assets/animations/reference-v1/manifest.json","utf8")) as {
      entries:{id:string;filename:string;artifactSha256:string;sourceSha256:string;bytes:number}[]
    };
    expect(manifest.entries).toHaveLength(3);
    for(const entry of manifest.entries){
      const source=REFERENCE_MOTION_SOURCES.find(s=>s.id===entry.id)!;
      const content=readFileSync("assets/animations/reference-v1/"+entry.filename,"utf8");
      const hash=(input:string)=>createHash("sha256").update(input).digest("hex");
      expect(hash(JSON.stringify(source))).toBe(entry.sourceSha256);
      expect(hash(content)).toBe(entry.artifactSha256);
      expect(Buffer.byteLength(content)).toBe(entry.bytes);
      expect(content).toBe(serializeAnimationClip(bakeReferenceMotion(source,graph),graph)+"\n");
      expect(loadBakedStudioAnimation(entry.id,graph)).toEqual(
        parseAnimationClip(content,graph));
    }
  });
  it("bakes three distinct validated motions with exact rig and loop endpoints",()=>{
    expect(REFERENCE_MOTION_SOURCES.map(s=>s.id)).toEqual([
      "relaxed-idle","controlled-step","ready-gesture"]);
    for(const source of REFERENCE_MOTION_SOURCES){
      const clip=bakeReferenceMotion(source,graph);
      expect(clip.rootMotion).toBe("locked");
      expect(clip.tracks.length).toBeGreaterThan(3);
      expect(serializeAnimationClip(parseAnimationClip(serializeAnimationClip(clip,graph),graph),graph))
        .toBe(serializeAnimationClip(clip,graph));
      const sample=createAnimationSampler(clip,graph);
      expect(sample.sample(0)).toEqual(sample.sample(clip.durationSeconds));
      expect(sample.sample(.5)).toEqual(sample.sample(30/60));
      for(const pose of sample.sample(.5))if(pose.rotation)
        expect(Math.hypot(...pose.rotation)).toBeCloseTo(1,10);
    }
  });
  it("rejects malformed source and incompatible topology",()=>{
    const source=REFERENCE_MOTION_SOURCES[0]!;
    expect(()=>validateReferenceMotionSource({...source,timesSeconds:[1,0]})).toThrow();
    expect(()=>validateReferenceMotionSource({...source,channels:[
      ...source.channels,source.channels[0]]})).toThrow();
    expect(()=>validateReferenceMotionSource({...source,channels:[
      ["chest","x",[0,Infinity,0,0,0]]]})).toThrow();
    expect(()=>bakeReferenceMotion(source,createAnatomyPreset({archetype:"vanara"})))
      .not.toThrow();
    // Other topology may bake its own reference, but must never consume human clip.
    const clip=bakeReferenceMotion(source,graph);
    expect(()=>createAnimationSampler(clip,createAnatomyPreset({archetype:"vanara"})))
      .toThrow(/bind mismatch/);
  });
  it("plays, pauses, seeks, loops, steps, suspends and restores existing skin",()=>{
    const rig=createSkinningSpike();
    const chest=rig.graph.joints.find(j=>j.role==="chest")!.id;
    const bone=rig.character.joint(chest),before=bone.quaternion.clone();
    const player=new StudioAnimationPlayback(rig.character,
      bakeReferenceMotion(REFERENCE_MOTION_SOURCES[0]!,rig.graph));
    player.setPlaying(true);player.update(100);player.update(850);
    expect(player.state.timeSeconds).toBeCloseTo(.75);
    expect(bone.quaternion.angleTo(before)).toBeGreaterThan(.01);
    player.setPlaying(false);player.update(2000);
    expect(player.state.timeSeconds).toBeCloseTo(.75);
    player.seek(1.5);const pose=bone.quaternion.clone();
    player.seek(.2);player.seek(1.5);
    expect(bone.quaternion.angleTo(pose)).toBeLessThan(1e-7);
    player.step(-1);expect(player.state.playing).toBe(false);
    player.setLoop(false);player.seek(2.9);player.setPlaying(true);
    player.update(3000);player.update(4000);
    expect(player.state.timeSeconds).toBe(3);
    expect(player.state.playing).toBe(false);
    player.seek(1);player.setPlaying(true);
    player.update(5000);player.suspend();player.update(9000);
    expect(player.state.timeSeconds).toBe(1);
    player.update(10000);expect(player.state.timeSeconds).toBe(2);
    player.dispose();
    expect(bone.quaternion.angleTo(before)).toBeLessThan(1e-7);
    expect(()=>player.seek(1)).toThrow(/disposed/);
    rig.dispose();
  });
  it("applies to the actual semantic skeleton and preserves finite socket transforms",()=>{
    const rig=createSkinningSpike();
    const socket=rig.graph.sockets.find(s=>s.purpose==="primary_grip")!.id;
    const before=rig.character.socketWorld(socket).clone();
    for(const source of REFERENCE_MOTION_SOURCES){
      const player=new StudioAnimationPlayback(rig.character,bakeReferenceMotion(source,rig.graph));
      for(const seconds of [0,.3,.7,source.durationSeconds]){
        player.seek(seconds);
        expect(rig.character.socketWorld(socket).elements.every(Number.isFinite)).toBe(true);
        expect(rig.skeleton.bones.every(b=>[...b.position,...b.quaternion].every(Number.isFinite)))
          .toBe(true);
      }
      player.dispose();
      expect(rig.character.socketWorld(socket).elements).toEqual(before.elements);
    }
    rig.dispose();
  });
});
