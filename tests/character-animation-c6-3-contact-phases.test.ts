import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import * as THREE from "three";
import {createAnimationSampler,parseAnimationClip} from "../packages/character-core/src/animation";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {AnatomicalFK} from "../apps/web/src/characters/geometry/AnatomicalFK";
import type {SourceRig,SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

/** Deterministic joint-based contact-phase observability, not a guarantee
 * of true skinned sole contact or a replacement for Step 3 foot grounding.
 * Source clips and official MakeHuman bind are sampled at 96 phase points.
 * Print empirical trough candidates for each independent authored gait.
 */
const source=(name:string)=>readFileSync(
  "apps/web/public/anatomy/"+name,"utf8");
const mapping=JSON.parse(readFileSync(
  "assets/animations/studio-v1/kevin/c63/locomotion-map.json","utf8")) as {
    phaseBaselines:Record<string,{leftPhase:number;rightPhase:number;sampleCount:number}>;
    motions:{id:string;gait:string;direction:string;
      phaseReference:{leftPhase:number;rightPhase:number;sampleCount:number}}[];
  };
describe("C6.3 source-measured gait phase diagnostics",()=>{
  it("records left/right lowest calibrated ankle-toe phases across authored cycles",()=>{
    const template=parseAnatomicalOBJ(source("makehuman-base.obj"),{includeGroups:["body"]});
    const rig=JSON.parse(source("makehuman-default.mhskel")) as SourceRig;
    const weights=JSON.parse(source("makehuman-default_weights.mhw")) as SourceWeights;
    const human=bindTemplateToSemanticRig(template,{rig,weights});
    const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
      jawTipWorldRest:human.jawTipWorldRest,
      forearmSkinBones:human.spike.forearmSkinBones,
      shoulderSkinBones:human.spike.shoulderSkinBones,
    });
    try{
      const chains=(["left","right"] as const).map(side=>{
        const joint=(role:string)=>{
          const id=human.spike.graph.joints.find(j=>j.role===role+"_"+side)?.id;
          if(!id)throw Error("Missing "+role+" "+side);
          return human.spike.bones.get(id)!;
        };
        return {side,ankle:joint("ankle"),toe:joint("toe")};
      });
      const records=[
        {id:"human-kevin-walk",gait:"walk",direction:"forward"},
        {id:"human-kevin-run",gait:"jog",direction:"forward"},
        ...mapping.motions,
      ];
      for(const record of records){
        const path=record.id==="human-kevin-walk"||record.id==="human-kevin-run"?
          "assets/animations/studio-v1/kevin/":
          "assets/animations/studio-v1/kevin/c63/";
        const clip=parseAnimationClip(readFileSync(path+record.id+".clip.json","utf8"),
          human.spike.graph);
        const sampler=createAnimationSampler(clip,human.spike.graph);
        const count=96;
        const samples=chains.map(()=>[] as number[]);
        for(let i=0;i<count;i++){
          fk.applyRestDeltas(sampler.sample(i/count*clip.durationSeconds));
          human.spike.character.root.updateWorldMatrix(true,true);
          chains.forEach((chain,k)=>{
            const a=chain.ankle.getWorldPosition(new THREE.Vector3());
            const t=chain.toe.getWorldPosition(new THREE.Vector3());
            samples[k]!.push((a.y+t.y)*.5);
          });
        }
        const trough=samples.map(series=>{
          let index=0;
          for(let i=1;i<series.length;i++)if(series[i]!<series[index]!)index=i;
          const max=Math.max(...series),min=Math.min(...series);
          return {phase:index/count,y:min,range:max-min};
        });
        const distance=Math.abs(trough[0]!.phase-trough[1]!.phase);
        console.log("TRILOK_C63_MEASURED_ANKLE_TROUGH "+JSON.stringify({
          ...record,duration:clip.durationSeconds,left:trough[0],right:trough[1],
          phaseSeparation:Math.min(distance,1-distance),
        }));
        expect(trough.every(v=>Number.isFinite(v.phase)&&Number.isFinite(v.y))).toBe(true);
        const reference=record.id==="human-kevin-walk"||
          record.id==="human-kevin-run"?
          mapping.phaseBaselines[record.gait]:
          mapping.motions.find(m=>m.id===record.id)?.phaseReference;
        expect(reference,record.id+" measured phase reference").toBeDefined();
        expect(reference!.sampleCount).toBe(count);
        expect(reference!.leftPhase).toBeCloseTo(trough[0]!.phase,10);
        expect(reference!.rightPhase).toBeCloseTo(trough[1]!.phase,10);
      }
    }finally{human.dispose();}
  },120_000);
});
