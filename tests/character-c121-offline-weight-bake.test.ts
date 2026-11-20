import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {createAnimationSampler} from "../packages/character-core/src/index";
import {loadBakedStudioAnimation} from "../apps/web/src/studio/StudioAnimationLibrary";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {AnatomicalFK} from "../apps/web/src/characters/geometry/AnatomicalFK";
import {sourceWeightRole,type SourceRig,type SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

/**
 * C121 one-time offline skin-weight fitting oracle.
 * This is NEVER evaluated by the playable browser. The fit trains on
 * approved reference motion families WITHOUT Kevin Run. Run is a holdout.
 * The printed atlas must be validated against independent Run, morphology,
 * contact/IK and rendered checks before becoming a versioned source asset.
 */
const asset=(name:string)=>readFileSync("apps/web/public/anatomy/"+name,"utf8");
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
const TRAIN=["human-kevin-idle","human-kevin-walk",
  "human-idle","human-walk","human-jog","human-sprint"] as const;

function projectSimplex(input:readonly number[]):number[]{
  const sorted=[...input].sort((a,b)=>b-a);
  let sum=0,theta=0;
  for(let i=0;i<sorted.length;i++){
    sum+=sorted[i]!;
    const t=(sum-1)/(i+1);
    if(sorted[i]!>t)theta=t;
  }
  return input.map(x=>Math.max(0,x-theta));
}
function fitWeights(original:ReadonlyMap<number,number>,p:THREE.Vector3,
  frames:readonly (readonly THREE.Matrix4[])[]):ReadonlyMap<number,number>{
  const entries=[...original].sort((a,b)=>a[0]-b[0]);
  const sum=entries.reduce((s,[,w])=>s+w,0);
  const mapped=new Map(entries.map(([id])=>[id,
    frames.map(m=>p.clone().applyMatrix4(m[id]!))] as const));
  const desired=frames.map((_,k)=>{
    const v=new THREE.Vector3();
    for(const [id,w] of entries)
      v.addScaledVector(mapped.get(id)![k]!,w/sum);
    return v;
  });
  const pool=[...entries].sort((a,b)=>b[1]-a[1]||a[0]-b[0])
    .slice(0,6).map(([id])=>id).sort((a,b)=>a-b);
  let best=Infinity,chosen:ReadonlyMap<number,number>|undefined;
  for(let a=0;a<pool.length;a++)for(let b=a+1;b<pool.length;b++)
    for(let c=b+1;c<pool.length;c++)for(let d=c+1;d<pool.length;d++){
      const owners=[pool[a]!,pool[b]!,pool[c]!,pool[d]!];
      const vectors=owners.map(id=>mapped.get(id)!.map((v,k)=>v.clone().sub(desired[k]!)));
      const gram=owners.map((_,i)=>owners.map((_,j)=>
        vectors[i]!.reduce((acc,v,k)=>acc+v.dot(vectors[j]![k]!),0)));
      const lip=2*Math.max(...gram.map(row=>row.reduce((s,v)=>s+Math.abs(v),0)));
      if(!Number.isFinite(lip))throw new Error("Invalid C121 normal equation");
      if(lip<1e-18)continue;
      let x=projectSimplex(owners.map(id=>(original.get(id)??0)/sum));
      for(let k=0;k<800;k++){
        const next=projectSimplex(x.map((value,i)=>value-
          2*gram[i]!.reduce((s,g,j)=>s+g*x[j]!,0)/lip));
        const diff=next.reduce((s,v,i)=>s+Math.abs(v-x[i]!),0);
        x=next;
        if(diff<1e-12)break;
      }
      const loss=frames.reduce((error,_,k)=>{
        const current=new THREE.Vector3();
        for(let i=0;i<4;i++)
          current.addScaledVector(mapped.get(owners[i]!)![k]!,x[i]!);
        return error+current.distanceToSquared(desired[k]!);
      },0);
      if(loss<best-1e-15){
        best=loss;
        chosen=new Map(owners.map((id,i)=>[id,x[i]!] as const));
      }
    }
  if(!chosen)throw new Error("Unable to produce four-owner shoulder source fit");
  return chosen;
}

describe("C121 offline source skin fit (unapproved diagnostic)",()=>{
  it("emits a deterministic versioned upper-clavicle atlas without training on Kevin Run",()=>{
    const obj=asset("makehuman-base.obj"),rawRig=asset("makehuman-default.mhskel"),
      rawWeights=asset("makehuman-default_weights.mhw");
    const rig=JSON.parse(rawRig) as SourceRig;
    const weights=JSON.parse(rawWeights) as SourceWeights;
    const human=bindTemplateToSemanticRig(parseAnatomicalOBJ(obj,
      {includeGroups:["body"]}),{rig,weights});
    const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
      jawTipWorldRest:human.jawTipWorldRest,
      forearmSkinBones:human.spike.forearmSkinBones,
      shoulderSkinBones:human.spike.shoulderSkinBones,
    });
    try{
      const roles=new Map(human.spike.graph.joints.map((j,i)=>[j.role,i]));
      const shoulderIds=new Set<number>();
      for(const side of ["L","R"] as const)
        for(const [id,w] of weights.weights["shoulder01."+side]??[])
          if(w>0)shoulderIds.add(id);
      const original=new Map<number,Map<number,number>>();
      for(const [name,entries] of Object.entries(weights.weights)){
        const suffix=/^shoulder01\.(L|R)$/.exec(name);
        const helper=suffix?human.spike.shoulderSkinBones?.get(
          suffix[1]==="L"?"right":"left"):undefined;
        const idx=helper?human.spike.skeleton.bones.indexOf(helper):
          roles.get(sourceWeightRole(name)??"");
        if(idx===undefined)continue;
        for(const [id,w] of entries){
          if(w<=0||!shoulderIds.has(id))continue;
          let bucket=original.get(id);
          if(!bucket){bucket=new Map();original.set(id,bucket);}
          bucket.set(idx,(bucket.get(idx)??0)+w);
        }
      }
      const frames:THREE.Matrix4[][]=[];
      for(const clipId of TRAIN){
        const clip=loadBakedStudioAnimation(clipId,human.spike.graph);
        const sampler=createAnimationSampler(clip,human.spike.graph);
        for(const f of [0,.25,.5,.75]){
          fk.applyRestDeltas(sampler.sample(clip.durationSeconds*f));
          frames.push(human.spike.skeleton.bones.map((bone,i)=>
            bone.matrixWorld.clone().multiply(human.spike.skeleton.boneInverses[i]!)));
        }
      }
      fk.applyRestDeltas([]);
      const positions=human.mesh.geometry.getAttribute("position");
      const renderForSource=new Map<number,number>();
      human.template.sourceVertexIds.forEach((id,render)=>{
        if(!renderForSource.has(id))renderForSource.set(id,render);
      });
      const neck=roles.get("neck")!,chest=roles.get("chest")!;
      const entries:readonly (readonly [number,readonly (readonly [number,number])[]])[]=
        [...original].sort((a,b)=>a[0]-b[0]).flatMap(([id,bucket])=>{
          if(bucket.size<=4||!bucket.has(neck)||!bucket.has(chest))return [];
          const side=(["left","right"] as const).find(s=>
            bucket.has(roles.get("clavicle_"+s)!)&&
            bucket.has(roles.get("shoulder_"+s)!));
          if(!side)return [];
          const render=renderForSource.get(id);
          if(render===undefined)throw new Error("Missing original CC0 render vertex "+id);
          const fitted=fitWeights(bucket,new THREE.Vector3().fromBufferAttribute(
            positions,render),frames);
          const row=[...fitted].sort((a,b)=>a[0]-b[0]);
          expect(row).toHaveLength(4);
          expect(row.reduce((s,[,w])=>s+w,0)).toBeCloseTo(1,7);
          return [[id,row] as const];
        });
      expect(entries.length).toBeGreaterThan(100);
      const atlas={schemaVersion:1,sourceVertexCount:human.template.sourceVertexCount,
        sourceMeshSha256:sha(obj),sourceRigSha256:sha(rawRig),
        sourceWeightsSha256:sha(rawWeights),
        canonicalJointIds:human.spike.graph.joints.map(j=>j.id),
        trainingClips:[...TRAIN],trainingFractions:[0,.25,.5,.75],
        entries};
      console.log("TRILOK_C121_OFFLINE_ATLAS "+JSON.stringify(atlas));
    }finally{human.dispose();}
  },180_000);
});
