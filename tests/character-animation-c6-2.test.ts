import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {
  createAnatomyPreset,createAnimationSampler,serializeAnimationClip,
  parseAnimationClip,validateAnimationClip,
} from "../packages/character-core/src/index";
import {createSkinningSpike} from "../apps/web/src/characters/geometry/SkinningSpike";
import {STUDIO_ANIMATIONS,loadBakedStudioAnimation,resolveStudioAnimationId} from "../apps/web/src/studio/StudioAnimationLibrary";
import {StudioAnimationPlayback} from "../apps/web/src/studio/StudioAnimationPlayback";
const graph=createAnatomyPreset({archetype:"human"});
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const expectedIds=["human-idle","human-walk","human-jog","human-sprint"] as const;
const load=()=>expectedIds.map(id=>loadBakedStudioAnimation(id,graph));
describe("C6.2 verified Quaternius source-backed motion",()=>{
  it("verifies curated original source SHA, archive provenance and byte-for-byte bake hashes",()=>{
    const raw=readFileSync("assets/animations/sources/ual1-standard-locomotion-v1.json","utf8");
    const source=JSON.parse(raw) as {
      sourceArchiveSha256:string;sourceGlbSha256:string;license:string;
      clips:{id:string;sourceName:string;timesSeconds:number[]}[];
    };
    const manifest=JSON.parse(readFileSync("assets/animations/studio-v1/manifest.json","utf8")) as {
      sourceArchiveSha256:string;sourceGlbSha256:string;sourceInputSha256:string;
      entries:{id:string;sourceClip:string;filename:string;artifactSha256:string;bytes:number}[];
    };
    expect(source.sourceArchiveSha256).toBe(
      "cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724");
    expect(source.license).toBe("CC0-1.0");
    expect(source.sourceGlbSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.sourceArchiveSha256).toBe(source.sourceArchiveSha256);
    expect(manifest.sourceGlbSha256).toBe(source.sourceGlbSha256);
    expect(manifest.sourceInputSha256).toBe(hash(raw));
    expect(manifest.entries.map(e=>e.id).sort()).toEqual(["human-idle","human-walk","human-run","human-sprint"].sort());
    expect(STUDIO_ANIMATIONS.map(e=>e.label)).toEqual(["Idle","Walk","Jog","Sprint"]);
    expect(STUDIO_ANIMATIONS.map(e=>e.id)).toEqual([...expectedIds]);
    expect(resolveStudioAnimationId("human-run-calibrated")).toBe("human-jog");
    expect(resolveStudioAnimationId("human-walk-calibrated")).toBe("human-walk");
    expect(loadBakedStudioAnimation("human-run-calibrated",graph).id).toBe("human-jog");
    expect(()=>resolveStudioAnimationId("unknown")).toThrow();
    expect(source.clips.map(c=>c.sourceName).sort()).toEqual([
      "Idle_Loop","Walk_Loop","Jog_Fwd_Loop","Sprint_Loop"].sort());
    for(const entry of manifest.entries){
      const content=readFileSync("assets/animations/studio-v1/"+entry.filename,"utf8");
      const clip=parseAnimationClip(content,graph);
      expect(hash(content)).toBe(entry.artifactSha256);
      expect(Buffer.byteLength(content)).toBe(entry.bytes);
      expect(serializeAnimationClip(clip,graph)+"\n").toBe(content);
      expect(clip.source.kind).toBe("external");
      expect(clip.source.creator).toBe("quaternius");
      expect(clip.source.license).toBe("CC0-1.0");
      expect(clip.source.sha256).toBe(source.sourceArchiveSha256);
      expect(clip.contacts).toHaveLength(0);
    }
  });
  it("retains distinct source-derived clip durations and continuous rotations",()=>{
    const source=JSON.parse(readFileSync(
      "assets/animations/sources/ual1-standard-locomotion-v1.json","utf8")) as {
      clips:{id:string;durationSeconds:number}[];
    };
    const clips=load();
    for(const clip of clips){
      expect(clip.durationSeconds).toBe(
        source.clips.find(c=>c.id===(clip.id==="human-jog"?"human-run":clip.id))!.durationSeconds);
      expect(clip.tracks.length).toBeGreaterThan(20);
      const sampled=createAnimationSampler(clip,graph);
      expect(sampled.sample(0)).toEqual(sampled.sample(clip.durationSeconds));
      for(const time of [0,.2,.4,.6,.9,clip.durationSeconds]){
        for(const pose of sampled.sample(Math.min(time,clip.durationSeconds)))
          if(pose.rotation)expect(Math.hypot(...pose.rotation)).toBeCloseTo(1,6);
      }
      for(const track of clip.tracks)if(track.channel==="rotation")
        for(let i=1;i<track.values.length;i++)
          expect(track.values[i-1]!.reduce((sum,v,k)=>sum+v*track.values[i]![k]!,0))
            .toBeGreaterThanOrEqual(-1e-8);
    }
    expect(clips[0]!.rootMotion).toBe("locked");
    expect(clips[0]!.tracks.some(t=>t.channel==="translation")).toBe(false);
    for(const clip of clips.slice(1)){
      expect(clip.rootMotion).toBe("visual_only");
      expect(clip.tracks.filter(t=>t.channel==="translation"))
        .toHaveLength(1);
    }
  });
  it("rejects malformed canonical data and incompatible topology",()=>{
    const clip=load()[0]!;
    expect(()=>validateAnimationClip({...clip,source:{...clip.source,license:""}} ,graph))
      .toThrow();
    expect(()=>createAnimationSampler(clip,createAnatomyPreset({archetype:"vanara"})))
      .toThrow(/bind mismatch/);
  });
  it("plays, pauses, seeks, loops, steps, suspends and restores the existing skeleton",()=>{
    const rig=createSkinningSpike();
    try{
      const clip=loadBakedStudioAnimation("human-idle",rig.graph);
      const chest=rig.graph.joints.find(j=>j.role==="chest")!.id;
      const bone=rig.character.joint(chest),before=bone.quaternion.clone();
      const player=new StudioAnimationPlayback(rig.character,clip);
      try{
        player.setPlaying(true);player.update(100);player.update(850);
        expect(player.state.timeSeconds).toBeCloseTo(.75);
        expect(bone.quaternion.angleTo(before)).toBeGreaterThan(.00001);
        player.setPlaying(false);player.update(2000);
        expect(player.state.timeSeconds).toBeCloseTo(.75);
        player.seek(1.5);const pose=bone.quaternion.clone();
        player.seek(.2);player.seek(1.5);
        expect(bone.quaternion.angleTo(pose)).toBeLessThan(1e-7);
        player.step(-1);expect(player.state.playing).toBe(false);
        player.setLoop(false);player.seek(clip.durationSeconds-.1);
        player.setPlaying(true);player.update(3000);player.update(4000);
        expect(player.state.timeSeconds).toBe(clip.durationSeconds);
        expect(player.state.playing).toBe(false);
        player.seek(.2);player.setPlaying(true);
        player.update(5000);player.suspend();player.update(9000);
        expect(player.state.timeSeconds).toBeCloseTo(.2);
        player.update(10000);expect(player.state.timeSeconds).toBeCloseTo(1.2);
      }finally{player.dispose();}
      expect(bone.quaternion.angleTo(before)).toBeLessThan(1e-7);
    }finally{rig.dispose();}
  });
  it("applies to the same semantic skeleton with finite socket transforms",()=>{
    const rig=createSkinningSpike();
    try{
      const socket=rig.graph.sockets.find(s=>s.purpose==="primary_grip")!.id;
      const before=rig.character.socketWorld(socket).clone();
      for(const clip of load()){
        const player=new StudioAnimationPlayback(rig.character,clip);
        for(const seconds of [0,.3,.7,clip.durationSeconds]){
          player.seek(seconds);
          expect(rig.character.socketWorld(socket).elements.every(Number.isFinite)).toBe(true);
          expect(rig.skeleton.bones.every(b=>[...b.position,...b.quaternion].every(Number.isFinite)))
            .toBe(true);
        }
        player.dispose();
        expect(rig.character.socketWorld(socket).elements).toEqual(before.elements);
      }
    }finally{rig.dispose();}
  });
});
