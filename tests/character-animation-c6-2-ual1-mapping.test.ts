import { describe, expect, it } from "vitest";
import { createAnatomyPreset } from "../packages/character-core/src/presets";
import { mapUAL1StandardJoints } from "../apps/web/src/characters/animation/UAL1SkeletonAdapter";
import { readFileSync } from "node:fs";

describe("C6.2 exact UAL1 anatomical correspondence",()=>{
  const input=JSON.parse(readFileSync(
    "assets/animations/sources/ual1-standard-locomotion-v1.json","utf8")) as {
      nodes:{name:string}[];
    };
  const names=input.nodes.map(n=>n.name);
  it("maps every weighted side-specific finger and principal limb to an exact joint ID",()=>{
    const graph=createAnatomyPreset({archetype:"human"});
    const map=mapUAL1StandardJoints(graph,names);
    const pairs=new Map(map.map(m=>[m.sourceId,m.targetId]));
    expect(map.length).toBeGreaterThanOrEqual(55);
    expect(new Set(map.map(m=>m.targetId)).size).toBe(map.length);
    expect(new Set(map.map(m=>m.sourceId)).size).toBe(map.length);
    for(const side of ["left","right"] as const){
      const suffix=side==="left"?"r":"l";
      for(const digit of ["thumb","index","middle","ring","little"] as const){
        const prefix=digit==="little"?"pinky":digit;
        for(let n=0;n<(digit==="thumb"?2:3);n++){
          const sourceId=`${prefix}_0${n+1}_${suffix}`;
          const target=pairs.get(sourceId);
          expect(target).toContain(`arm[${side},0]/finger[${digit}]/phalanx[${n}]`);
        }
      }
    }
  });
  it("never maps extension joints with colliding semantic roles",()=>{
    const extended=createAnatomyPreset({archetype:"human",extraArmPairs:1});
    const mapped=mapUAL1StandardJoints(extended,names);
    expect(mapped.some(m=>m.targetId.includes("arm[left,1]"))).toBe(false);
    expect(mapped.some(m=>m.targetId.includes("arm[right,1]"))).toBe(false);
  });
  it("fails instead of silently dropping a required finger or duplicating a source",()=>{
    const graph=createAnatomyPreset({archetype:"human"});
    expect(()=>mapUAL1StandardJoints(graph,names.filter(x=>x!=="index_01_r")))
      .toThrow(/Missing UAL1/);
    expect(()=>mapUAL1StandardJoints(graph,[...names,names[0]!]))
      .toThrow(/Duplicate/);
  });
});
