import {describe,expect,it} from "vitest";
import {
  anatomicalFrame,parallelTransportAnatomicalCue,
} from "../packages/character-core/src/retargeting";
import type {Vec3} from "../packages/character-core/src/schema";

const dot=(a:Vec3,b:Vec3)=>a.reduce((s,x,i)=>s+x*b[i]!,0);
const length=(v:Vec3)=>Math.hypot(...v);
const unit=(v:Vec3):Vec3=>v.map(x=>x/length(v)) as unknown as Vec3;
const angle=(a:Vec3,b:Vec3)=>Math.acos(Math.max(-1,Math.min(1,
  dot(unit(a),unit(b)))));

describe("C6.3 fingerless-source anatomical reference observability",()=>{
  it("parallel-transports a measured target cue with zero additional shaft roll",()=>{
    const source:Vec3=[0,1,0];
    const cue=parallelTransportAnatomicalCue([1,0,0],[0,0,1],source);
    expect(cue[0]).toBeCloseTo(0,10);
    expect(cue[1]).toBeCloseTo(0,10);
    expect(cue[2]).toBeCloseTo(1,10);
    expect(dot(cue,source)).toBeCloseTo(0,10);
    expect(length(cue)).toBeCloseTo(1,10);
    expect(anatomicalFrame(source,cue)).toHaveLength(4);
  });
  it("preserves separate mirrored signs without inventing a palm landmark",()=>{
    const targetSecondary:Vec3=[0,0,1];
    const testCases:readonly [Vec3,Vec3,Vec3][]=[
      [[1,0,0],[0,1,0],[0,0,1]],
      [[-1,0,0],[0,-1,0],[0,0,1]],
      [[0,-1,0],[-Math.SQRT1_2,-Math.SQRT1_2,0],[0,0,1]],
      [[0,-1,0],[Math.SQRT1_2,-Math.SQRT1_2,0],[0,0,1]],
    ];
    for(const [targetShaft,sourceShaft,expectedCue] of testCases){
      const candidate=parallelTransportAnatomicalCue(
        targetShaft,targetSecondary,sourceShaft);
      expect(angle(candidate,expectedCue)).toBeLessThan(1e-6);
      expect(Math.abs(dot(candidate,unit(sourceShaft)))).toBeLessThan(1e-9);
      expect(parallelTransportAnatomicalCue(targetShaft,
        targetSecondary,sourceShaft)).toEqual(candidate);
    }
  });
  it("rejects unobservable or ambiguous reference geometry instead of guessing",()=>{
    expect(()=>parallelTransportAnatomicalCue(
      [0,-1,0],[0,1,0],[1,0,0])).toThrow(/transverse cue/);
    expect(()=>parallelTransportAnatomicalCue(
      [1,0,0],[0,0,1],[-1,0,0])).toThrow(/antiparallel/);
    expect(()=>parallelTransportAnatomicalCue(
      [1,0,0],[0,0,1],[0,0,0])).toThrow(/zero anatomical direction/);
  });
  it("does not claim that a gauge resolves physically unobserved source twist",()=>{
    // A whole family of source frames can share the exact shaft. The gauge
    // selects one repeatable ZERO-additional-roll convention, not ground truth.
    const shaft:Vec3=[0,-1,0];
    const fromTarget=parallelTransportAnatomicalCue(
      shaft,[0,0,1],shaft);
    expect(fromTarget).toEqual([0,0,1]);
    expect(angle(fromTarget,[1,0,0])).toBeCloseTo(Math.PI/2,10);
    // Both cues define unit quaternions; joint positions alone cannot
    // distinguish which secondary is the anatomical palm normal.
    expect(anatomicalFrame(shaft,fromTarget)).toHaveLength(4);
    expect(anatomicalFrame(shaft,[1,0,0])).toHaveLength(4);
  });
});
