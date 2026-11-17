/** Single-run reproducible microbenchmark for geometry classification only.
 * This file deliberately works unchanged against the PRE-cache main revision.
 * It does not measure full solver, rendering or browser input-to-paint latency.
 */
import {describe,it,expect,vi} from "vitest";
import {performance} from "node:perf_hooks";
import {mkdirSync,writeFileSync} from "node:fs";
import {make} from "../tests/helpers/studio-two-hand-fixtures";
import {sourceHandSamples} from "../apps/web/src/studio/StudioSourceContact";

function quantiles(values:readonly number[]){
  const sorted=[...values].sort((a,b)=>a-b);
  const pick=(q:number)=>sorted[Math.ceil((sorted.length-1)*q)]!;
  return {n:sorted.length,meanMs:sorted.reduce((a,b)=>a+b,0)/sorted.length,
    medianMs:pick(.5),p95Ms:pick(.95),maxMs:sorted.at(-1)!};
}

describe("controlled baseline vs optimized source skin classification",()=>{
  it("records attribute reads and timings on two independent source humans",()=>{
    const observations=[];
    for(let modelIndex=0;modelIndex<2;modelIndex++){
      const {human,model}=make();
      const attribute=human.mesh.geometry.getAttribute("skinIndex");
      const spy=vi.spyOn(attribute,"getComponent");
      try{
        for(const hand of ["left","right"] as const)
          for(const budget of [32,80,Infinity]){
            const durations:number[]=[];
            const startReads=spy.mock.calls.length;
            const coldStart=performance.now();
            const first=sourceHandSamples(model,hand,budget);
            const coldMs=performance.now()-coldStart;
            const coldSkinReads=spy.mock.calls.length-startReads;
            const warmStartReads=spy.mock.calls.length;
            for(let pass=0;pass<10;pass++){
              const started=performance.now();
              const next=sourceHandSamples(model,hand,budget);
              durations.push(performance.now()-started);
              expect([...next]).toEqual([...first]);
            }
            const warmSkinReads=spy.mock.calls.length-warmStartReads;
            observations.push({
              modelIndex,hand,budget:Number.isFinite(budget)?budget:"full",
              coldMs,coldSkinReads,warmSkinReads,warm:quantiles(durations),
            });
          }
      }finally{spy.mockRestore();human.dispose();}
    }
    const result={
      label:process.env.STUDIO_BENCH_LABEL??"unspecified",
      revision:process.env.STUDIO_BENCH_SHA??"unspecified",
      node:process.version,platform:process.platform,arch:process.arch,
      observation:"Node/Vitest CPU classification, NOT browser frame timing",
      observations,
    };
    mkdirSync("test-results",{recursive:true});
    writeFileSync("test-results/source-hand-classification.json",
      JSON.stringify(result,null,2)+"\n");
    console.log("SOURCE_HAND_CLASSIFICATION",JSON.stringify(result));
    expect(observations).toHaveLength(12);
    expect(observations.every(row=>row.coldSkinReads>0)).toBe(true);
  },180_000);
});
