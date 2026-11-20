import {describe,expect,it} from "vitest";
import {
  createAnatomyPreset,createAnimationSampler,parseAnimationClip,
  sampleAnimationRootTrajectory,serializeAnimationClip,validateAnimationClip,
  type AnimationClipV1,
} from "../packages/character-core/src/index";
import {loadBakedStudioAnimation} from "../apps/web/src/studio/StudioAnimationLibrary";
import {createSkinningSpike} from "../apps/web/src/characters/geometry/SkinningSpike";
import {StudioAnimationPlayback} from "../apps/web/src/studio/StudioAnimationPlayback";

const graph=createAnatomyPreset({archetype:"human"});
const existing=loadBakedStudioAnimation("human-kevin-idle",graph);
const trajectory={
  coordinates:existing.rig.coordinates,
  origin:"source-hips-at-first-key" as const,
  orientation:"reference-only" as const,
  behavior:"one_shot" as const,
  timesSeconds:[0,existing.durationSeconds/2,existing.durationSeconds],
  positionsMeters:[[0,0,0],[1,0.400113,2],[2,-0.6,4]] as const,
  rotations:[[0,0,0,1],[0,Math.SQRT1_2,0,Math.SQRT1_2],
    [0,1,0,0]] as const,
};
const clip:AnimationClipV1={
  ...existing,id:"test-authored-root-reference",rootMotion:"visual_only",
  rootTrajectory:trajectory,
};
describe("C6.3 authored trajectory isolation",()=>{
  it("retains all horizontal and vertical source data without FK offset clipping",()=>{
    validateAnimationClip(clip,graph);
    const a=sampleAnimationRootTrajectory(clip,existing.durationSeconds/2)!;
    expect(a.positionMeters).toEqual([1,0.400113,2]);
    for(let k=0;k<4;k++)
      expect(a.rotation[k]).toBeCloseTo([0,Math.SQRT1_2,0,Math.SQRT1_2][k]!,12);
    expect(sampleAnimationRootTrajectory(clip,existing.durationSeconds)!.positionMeters)
      .toEqual([2,-0.6,4]);
    const t=sampleAnimationRootTrajectory(clip,existing.durationSeconds/4)!;
    expect(t.positionMeters).toEqual([.5,.2000565,1]);
    expect(Math.hypot(...t.rotation)).toBeCloseTo(1,9);
  });
  it("serializes and samples reference trajectories deterministically",()=>{
    const once=serializeAnimationClip(clip,graph);
    const parsed=parseAnimationClip(once,graph);
    expect(serializeAnimationClip(parsed,graph)).toBe(once);
    expect(sampleAnimationRootTrajectory(parsed,-100)!.positionMeters).toEqual([0,0,0]);
    expect(sampleAnimationRootTrajectory(parsed,9999)!.positionMeters).toEqual([2,-.6,4]);
    expect(()=>sampleAnimationRootTrajectory(parsed,NaN)).toThrow();
    expect(sampleAnimationRootTrajectory(existing,0)).toBeUndefined();
  });
  it("rejects duplicate trajectory ownership by FK root translation",()=>{
    const duplicate:AnimationClipV1={
      ...clip,tracks:[...clip.tracks,{
        jointId:clip.rig.rootJointId,channel:"translation",
        timesSeconds:[0,clip.durationSeconds],
        values:[[0,0,0],[.1,0,0]],
      }],
    };
    expect(()=>validateAnimationClip(duplicate,graph)).toThrow(/overlap/);
    expect(()=>validateAnimationClip({...clip,rootTrajectory:{
      ...trajectory,positionsMeters:[[0,0,0],[0,Infinity,0],[2,0,4]],
    }},graph)).toThrow();
  });
  it("never moves gameplay actor/world position during Studio playback",()=>{
    const spike=createSkinningSpike();
    try {
      const actor=spike.character.root;
      const baseline=actor.position.clone();
      const sampler=createAnimationSampler(clip,spike.graph);
      expect(sampler.sample(existing.durationSeconds/2)
        .some(p=>p.translation)).toBe(false);
      const player=new StudioAnimationPlayback(spike.character,clip);
      try{
        expect(player.state.loop).toBe(false);
        player.seek(existing.durationSeconds/2);
        expect(actor.position.equals(baseline)).toBe(true);
        player.setPlaying(true);
        player.update(100);player.update(900);
        expect(actor.position.equals(baseline)).toBe(true);
      }finally{player.dispose();}
    }finally{spike.dispose();}
  });
});
