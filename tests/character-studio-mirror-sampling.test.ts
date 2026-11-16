import {describe,expect,it} from "vitest";
import {mirrorStableSampleIndices} from "../apps/web/src/studio/StudioMirrorSampling";

describe("mirror-stable source-skin sampling",()=>{
  it("selects identical reflected bind-space locations despite independent OBJ indexing",()=>{
    const left=Array.from({length:160},(_,i)=>({
      x:-.04-(i%13)*.00031,
      y:.8+Math.floor(i/13)*.003,
      z:.11+(i%7)*.002,
    }));
    const right=left.map(p=>({...p,x:-p.x})).reverse();
    const coordinates=[...left,...right];
    const position={
      getX:(i:number)=>coordinates[i]!.x,
      getY:(i:number)=>coordinates[i]!.y,
      getZ:(i:number)=>coordinates[i]!.z,
    };
    const lhs=mirrorStableSampleIndices(left.map((_,i)=>i),position,"left",32);
    const rhs=mirrorStableSampleIndices(right.map((_,i)=>i+left.length),
      position,"right",32);
    const points=(sample:readonly number[],side:"left"|"right")=>sample.map(i=>[
      +(position.getX(i)*(side==="left"?-1:1)).toFixed(8),
      position.getY(i),position.getZ(i),
    ]);
    expect(points(lhs,"left")).toEqual(points(rhs,"right"));
    expect(lhs).toHaveLength(32);
    expect(rhs).toHaveLength(32);
  });
  it("preserves full-source acceptance and rejects illegal probe budgets",()=>{
    const p={getX:(i:number)=>i,getY:(i:number)=>i,getZ:(i:number)=>i};
    expect(mirrorStableSampleIndices([4,2,7],p,"right",Infinity))
      .toEqual([4,2,7]);
    expect(()=>mirrorStableSampleIndices([1,2,3],p,"left",0)).toThrow();
  });
});
