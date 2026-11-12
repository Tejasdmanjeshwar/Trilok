import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { bindTemplateToSemanticRig, parseAnatomicalOBJ } from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import { sourceWeightRole, type SourceRig, type SourceWeights } from
  "../apps/web/src/characters/geometry/OfficialHumanRig";
import { AnatomicalFK, type JointTarget, type AnatomicalMotion } from
  "../apps/web/src/characters/geometry/AnatomicalFK";

const asset = (name: string) => readFileSync(
  new URL("../apps/web/public/anatomy/" + name, import.meta.url),"utf8");
const PATCHES = {
  shoulder:["shoulder01","clavicle","upperarm01","upperarm02"],
  elbow:["upperarm02","lowerarm01","lowerarm02"],
  hip:["pelvis","upperleg01","upperleg02"],
  knee:["upperleg02","lowerleg01","lowerleg02"],
  ankle:["lowerleg02","foot","toe1-1"],
  neck:["neck01","neck02","neck03","head"],
  jaw:["jaw","head"],
} as const;
type Patch = keyof typeof PATCHES;
function fixture() {
  const template=parseAnatomicalOBJ(asset("makehuman-base.obj"),{includeGroups:["body"]});
  const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
  const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
  const body=bindTemplateToSemanticRig(template,{rig,weights});
  const fk=new AnatomicalFK(body.spike.graph,body.spike.bones,{
    jawTipWorldRest:body.jawTipWorldRest,forearmSkinBones:body.spike.forearmSkinBones,
    shoulderSkinBones:body.spike.shoulderSkinBones,
  });
  const original=new Map<number,{name:string;weight:number}[]>();
  for(const [name,entries] of Object.entries(weights.weights))for(const [id,weight] of entries){
    if(weight<=0)continue;
    const owners=original.get(id)??[];
    owners.push({name,weight});
    original.set(id,owners);
  }
  const firstRender=new Map<number,number>();
  template.sourceVertexIds.forEach((id,i)=>{
    if(!firstRender.has(id))firstRender.set(id,i);
  });
  const index=new Map<string,number>();
  for(const name of Object.keys(weights.weights)) {
    const match=/\.(L|R)$/.exec(name);
    const side=match?.[1]==="L"?"right":"left";
    let target:THREE.Bone|undefined;
    if(/^shoulder01\.[LR]$/.test(name))target=body.spike.shoulderSkinBones?.get(side);
    if(/^lowerarm01\.[LR]$/.test(name))target=body.spike.forearmSkinBones?.get(side);
    let current:string|null=name;
    while(!target && current){
      const role=sourceWeightRole(current);
      if(role){
        const joint=body.spike.graph.joints.find(j =>
          j.role===role || (j.role.startsWith("finger_")&&
            role===j.role+"_"+side && j.id.includes("arm["+side+",")));
        if(joint)target=body.spike.bones.get(joint.id);
      }
      current=rig.bones[current]?.parent??null;
    }
    if(!target)throw Error("Unresolved original source owner "+name);
    const id=body.spike.skeleton.bones.indexOf(target);
    if(id<0)throw Error("Missing source bone in skinned skeleton "+name);
    index.set(name,id);
  }
  return {body,fk,weights,original,firstRender,index};
}
type Session=ReturnType<typeof fixture>;
function sourcePatch(s:Session,patch:Patch,side:"left"|"right") {
  const suffix=side==="left"?".R":".L";
  const ids=new Set<number>();
  for(const bone of PATCHES[patch]) {
    const key=(patch==="neck"||patch==="jaw"||bone==="head")?bone:bone+suffix;
    for(const [id,w] of s.weights.weights[key]??[])if(w>.01)ids.add(id);
  }
  return [...ids].sort((a,b)=>a-b).filter(id=>s.firstRender.has(id));
}
function targets(s:Session,pose:string) {
  const out:JointTarget[]=[];
  const add=(role:string,motion:AnatomicalMotion,radians:number)=>{
    const joint=s.body.spike.graph.joints.find(j=>j.role===role);
    if(!joint)throw Error("Missing role "+role);
    out.push({jointId:joint.id,motion,radians});
  };
  for(const side of ["left","right"] as const) {
    if(pose==="shoulder"||pose==="combined"){
      add("clavicle_"+side,"abduction",.22);
      add("shoulder_"+side,"abduction",1.5);
      add("shoulder_"+side,"flexion",.6);
    }
    if(pose==="elbow"||pose==="combined"){
      add("elbow_"+side,"flexion",1.8);
      add("elbow_"+side,"rotation",side==="left"?.8:-.8);
    }
    if(pose==="hip"||pose==="combined"){
      add("hip_"+side,"flexion",1.5);
      add("hip_"+side,"abduction",.45);
    }
    if(pose==="knee"||pose==="combined")add("knee_"+side,"flexion",1.9);
    if(pose==="ankle"||pose==="combined")add("ankle_"+side,"flexion",.45);
  }
  if(pose==="neck"||pose==="combined"){
    add("neck","rotation",.55);
    add("head","flexion",.3);
  }
  if(pose==="jaw"||pose==="combined")add("jaw","flexion",.5);
  if(pose==="combined") {
    add("chest","rotation",.32);
    add("spine_lower","rotation",.3);
  }
  return out;
}
function statistics(s:Session,ids:number[]) {
  const skeleton=s.body.spike.skeleton;
  const matrices=skeleton.bones.map((bone,i)=>
    bone.matrixWorld.clone().multiply(skeleton.boneInverses[i]!));
  const position=s.body.mesh.geometry.getAttribute("position");
  const predicted=new THREE.Vector3(),reference=new THREE.Vector3();
  const errors:number[]=[];
  let overloaded=0;
  for(const id of ids) {
    const render=s.firstRender.get(id)!;
    const weights=s.original.get(id)!;
    if(weights.length>4)overloaded++;
    reference.fromBufferAttribute(position,render);
    const full=new THREE.Vector3();
    let sum=0;
    for(const owner of weights) {
      predicted.copy(reference).applyMatrix4(matrices[s.index.get(owner.name)!]!);
      full.addScaledVector(predicted,owner.weight);
      sum+=owner.weight;
    }
    full.multiplyScalar(1/sum);
    const actual=s.body.mesh.getVertexPosition(render,new THREE.Vector3());
    errors.push(1000*actual.distanceTo(full));
  }
  errors.sort((a,b)=>a-b);
  return {
    n:errors.length,
    overloaded,
    rmsMm:+Math.sqrt(errors.reduce((t,x)=>t+x*x,0)/errors.length).toFixed(4),
    p95Mm:+errors[Math.floor(.95*errors.length)]!.toFixed(4),
    maxMm:+errors.at(-1)!.toFixed(4),
  };
}
describe("C2.4 pinned source-weight fidelity across all anatomical regions",()=>{
  it("measures GPU four-weight error against unpruned original CC0 weights",()=>{
    const s=fixture();
    try {
      const ids=new Map(Object.keys(PATCHES).flatMap(name=>
        (["left","right"] as const).map(side=>[
          name+side,sourcePatch(s,name as Patch,side)
        ] as const)));
      for(const pose of ["neutral","shoulder","elbow","hip","knee","ankle","neck","jaw","combined"]){
        s.fk.apply(targets(s,pose));
        const data=Object.keys(PATCHES).map(name=>({
          region:name,
          left:statistics(s,ids.get(name+"left")!),
          right:statistics(s,ids.get(name+"right")!),
        }));
        console.info("CC0_UNPRUNED_REFERENCE",JSON.stringify({pose,data}));
        for(const item of data)for(const side of ["left","right"] as const){
          const d=item[side];
          expect(d.n).toBeGreaterThan(100);
          expect(Number.isFinite(d.maxMm)&&Number.isFinite(d.rmsMm)).toBe(true);
        }
      }
    } finally{s.body.dispose();}
  });
});
