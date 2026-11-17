/** Opt-in, serial NODE solver benchmark. NOT browser FPS or GPU latency.
 * Run on pinned runner: pnpm bench:studio. Do not gate ordinary CI on time.
 */
import {describe,it,expect} from "vitest";
import {performance} from "node:perf_hooks";
import {mkdirSync,writeFileSync} from "node:fs";
import {make} from "../tests/helpers/studio-two-hand-fixtures";
import {generateStudioCharacter} from "../apps/web/src/studio/StudioGenerator";
import {StudioPosePreview} from "../apps/web/src/studio/StudioPosePreview";
import {sourceHandSamples} from "../apps/web/src/studio/StudioSourceContact";
import {captureStudioSolverCounters,type StudioSolverCounters} from
  "../apps/web/src/studio/StudioSolverDiagnostics";

type Observation={scenario:string;durationMs:number;work:StudioSolverCounters;iterations?:number;
  solverAttempts?:number;reachable?:boolean;skinVertices?:number};
const samples:Observation[]=[];
const take=(scenario:string,action:()=>void,details?:()=>Partial<Observation>)=>{
  const begin=performance.now();
  const captured=captureStudioSolverCounters(action);
  const result={scenario,durationMs:performance.now()-begin,
    work:captured.counters,...details?.()};
  samples.push(result);
  return result;
};
function summarize(rows:readonly number[]){
  const sorted=[...rows].sort((a,b)=>a-b);
  const at=(q:number)=>sorted[Math.ceil((sorted.length-1)*q)]??null;
  return {n:sorted.length,meanMs:sorted.reduce((a,b)=>a+b,0)/sorted.length,
    medianMs:at(.5),p95Ms:at(.95),maxMs:sorted.at(-1)??null};
}

describe("manual Character Studio runtime solver profiling",()=>{
  it("records source preparation, cold/warm equipment, draw progression and alternating updates",()=>{
    for(const variant of ["neutral","asymmetric-seed"] as const){
      const seed=variant==="asymmetric-seed"?
        generateStudioCharacter(2929832126):undefined;
      let fixture:ReturnType<typeof make>|undefined;
      take(variant+"/morphology-and-source-preparation",()=>{
        fixture=seed?make(seed.morphology.body,seed.morphology.shape):make();
      });
      const {human,model}=fixture!;
      const pose=new StudioPosePreview(model);
      try{
        const handSamples=take(variant+"/source-hand-classification-cold",()=>{
          sourceHandSamples(model,"left",80);
        });
        const warmHandSamples=take(variant+"/source-hand-classification-warm",()=>{
          sourceHandSamples(model,"left",80);
        });
        expect(handSamples.durationMs).toBeGreaterThanOrEqual(0);
        expect(warmHandSamples.durationMs).toBeGreaterThanOrEqual(0);
        for(const grip of ["left","staff-left","longsword-right",
          "sword-shield-right","bow-left","bow-right"] as const){
          take(variant+"/"+grip+"/equip-cold",()=>pose.setGrip(grip),()=>{
            const result=pose.bowPoseResult;
            return {iterations:result?.iterations,
              solverAttempts:result?.solverAttempts,reachable:result?.reachable};
          });
          take(variant+"/"+grip+"/equip-warm",()=>pose.refresh(),()=>{
            const result=pose.bowPoseResult;
            return {iterations:result?.iterations,
              solverAttempts:result?.solverAttempts,reachable:result?.reachable};
          });
          if(!grip.startsWith("bow"))continue;
          for(const state of ["nock","partial","aim","release","rest"] as const){
            take(variant+"/"+grip+"/"+state+"/cold",()=>pose.setArcheryState(state),
              ()=>({iterations:pose.bowPoseResult?.iterations,
                solverAttempts:pose.bowPoseResult?.solverAttempts,
                reachable:pose.bowPoseResult?.reachable}));
            if(state==="partial"){
              for(const amount of [0,.25,.5,.75,1]){
                for(let i=0;i<2;i++)
                  take(variant+"/"+grip+"/partial/"+amount,()=>pose.setArcheryDraw(amount),
                    ()=>({iterations:pose.bowPoseResult?.iterations,
                      solverAttempts:pose.bowPoseResult?.solverAttempts,
                      reachable:pose.bowPoseResult?.reachable}));
              }
              for(const amount of [0,1,0.25,.75,0.5])
                take(variant+"/"+grip+"/rapid-slider/"+amount,
                  ()=>pose.setArcheryDraw(amount));
            }
            take(variant+"/"+grip+"/"+state+"/warm",()=>pose.refresh(),
              ()=>({iterations:pose.bowPoseResult?.iterations,
                solverAttempts:pose.bowPoseResult?.solverAttempts,
                reachable:pose.bowPoseResult?.reachable}));
          }
        }
      }finally{pose.dispose();human.dispose();}
    }
    const groups=new Map<string,number[]>();
    for(const row of samples){
      const list=groups.get(row.scenario)??[];
      list.push(row.durationMs);
      groups.set(row.scenario,list);
    }
    const summary=[...groups].map(([scenario,durations])=>
      ({scenario,...summarize(durations),
        meanIkObjectives:samples.filter(r=>r.scenario===scenario).reduce(
          (sum,r)=>sum+r.work.ikObjectives,0)/durations.length,
        meanSourceSkinVertices:samples.filter(r=>r.scenario===scenario).reduce(
          (sum,r)=>sum+r.work.stringSkinVertices+r.work.cylinderSkinVertices+
            r.work.fingerPadSkinVertices,0)/durations.length}));
    const report={context:"Node/Vitest main-thread wall time; NOT browser frame or GPU time",
      node:process.version,platform:process.platform,arch:process.arch,
      summary,observations:samples};
    mkdirSync("test-results",{recursive:true});
    writeFileSync("test-results/studio-solver-benchmark.json",
      JSON.stringify(report,null,2)+"\n");
    console.log("STUDIO_SOLVER_BENCHMARK",JSON.stringify(summary));
    expect(samples.length).toBeGreaterThan(50);
    expect(samples.every(s=>Number.isFinite(s.durationMs))).toBe(true);
  },1_800_000);
});
