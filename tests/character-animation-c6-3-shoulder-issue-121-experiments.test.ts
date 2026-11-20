import {readFileSync} from "node:fs";
import {describe,it} from "vitest";
import * as THREE from "three";
import {createAnimationSampler} from "../packages/character-core/src/index";
import {loadBakedStudioAnimation} from "../apps/web/src/studio/StudioAnimationLibrary";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {AnatomicalFK} from "../apps/web/src/characters/geometry/AnatomicalFK";
import type {SourceRig,SourceWeights} from "../apps/web/src/characters/geometry/OfficialHumanRig";

/** Experimental C121 measurements. Remove this after isolating a reusable fix. */
const asset=(name:string)=>readFileSync(
  new URL("../apps/web/public/anatomy/"+name,import.meta.url),"utf8");
function faceInfo(human:ReturnType<typeof bindTemplateToSemanticRig>,face:number){
  const index=human.mesh.geometry.getIndex()!;
  const p=human.mesh.geometry.getAttribute("position");
  const ids=Array.from({length:3},(_,k)=>index.getX(face*3+k));
  const rest=ids.map(id=>new THREE.Vector3().fromBufferAttribute(p,id));
  const pose=ids.map(id=>human.mesh.getVertexPosition(id,new THREE.Vector3()));
  const surface=(v:THREE.Vector3[])=>v[1]!.clone().sub(v[0]!).cross(v[2]!.clone().sub(v[0]!));
  const r=surface(rest),s=surface(pose);
  const source=ids.map(id=>human.template.sourceVertexIds[id]);
  return {face,render:ids,source,restArea:r.length()*.5,posedArea:s.length()*.5,
    ratio:s.length()/r.length(),normalDot:s.normalize().dot(r.normalize()),
    centroid:pose[0]!.clone().add(pose[1]!).add(pose[2]!).divideScalar(3).toArray()};
}
function stats(human:ReturnType<typeof bindTemplateToSemanticRig>,faceIds:readonly number[]){
  return faceIds.map(f=>faceInfo(human,f));
}
describe("C121 controlled shoulder connector diagnostic",()=>{
  it("compares actual Kevin pose against UAL and connector interpolation",()=>{
    const template=parseAnatomicalOBJ(asset("makehuman-base.obj"),{includeGroups:["body"]});
    const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
    const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
    const human=bindTemplateToSemanticRig(template,{rig,weights});
    const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
      jawTipWorldRest:human.jawTipWorldRest,
      forearmSkinBones:human.spike.forearmSkinBones,
      shoulderSkinBones:human.spike.shoulderSkinBones,
    });
    try{
      const ids={left:[6797,6634,2365],right:[20356,20357,15844,15871,15607]};
      const joint=(role:string)=>human.spike.graph.joints.find(j=>j.role===role)!.id;
      for(const name of ["human-kevin-idle","human-kevin-walk","human-kevin-run",
        "human-idle","human-walk","human-jog","human-sprint"]){
        const clip=loadBakedStudioAnimation(name,human.spike.graph);
        const sampler=createAnimationSampler(clip,human.spike.graph);
        for(const time of name==="human-kevin-run"?[.48,.50,.51,.52,.54]:[0,.51]){
          const t=Math.min(time,clip.durationSeconds);
          const samples=sampler.sample(t);
          fk.applyRestDeltas(samples);
          const angles=Object.fromEntries(["left","right"].map(side=>[side,
            new THREE.Quaternion(...(samples.find(p=>p.jointId===joint("shoulder_"+side))?.rotation??
              [0,0,0,1])).angleTo(new THREE.Quaternion())]));
          const base=Object.fromEntries((["left","right"] as const).map(side=>[
            side,stats(human,ids[side]).map(x=>({face:x.face,ratio:+x.ratio.toFixed(4),
              dot:+x.normalDot.toFixed(4),centroid:x.centroid.map(v=>+v.toFixed(3))}))]));
          console.log("TRILOK_C121_CLIP "+JSON.stringify({name,time:t,angles,base}));
        }
      }
      const sampler=createAnimationSampler(
        loadBakedStudioAnimation("human-kevin-run",human.spike.graph),human.spike.graph);
      for(const time of [.48,.50,.51,.52,.54]){
        fk.applyRestDeltas(sampler.sample(time));
        const shoulderRest=new Map((["left","right"] as const).map(side=>[side,{
          connector:human.spike.shoulderSkinBones!.get(side)!,
          joint:human.spike.bones.get(joint("shoulder_"+side))!,
        }]));
        for(const blend of [0,.25,.5,.75,1]){
          for(const side of ["left","right"] as const){
            const {connector,joint:bone}=shoulderRest.get(side)!;
            const restJoint=fk.frames.get(joint("shoulder_"+side))!.rest;
            const delta=restJoint.clone().invert().multiply(bone.quaternion);
            const partial=new THREE.Quaternion().slerp(delta,blend);
            // Helpers share parent with semantic shoulders. Reconstruct
            // calibrated rest pivots using the alpha=.5 actual state first.
            const restQuat=restJoint;
            const fullOffset=bone.position.clone().sub(
              connector.position.clone().sub(
                bone.position.clone().sub(connector.position).applyQuaternion(
                  new THREE.Quaternion().slerp(delta,.5)
                ).negate()
              )
            );
            void fullOffset;void restQuat;
          }
          // This initial experiment logs pose triangles; connector variation
          // is measured by an isolated follow-up after rest anchors are captured.
          console.log("TRILOK_C121_VARIANT "+JSON.stringify({time,blend,
            left:stats(human,ids.left).map(x=>+x.ratio.toFixed(5)),
            right:stats(human,ids.right).map(x=>+x.ratio.toFixed(5))}));
        }
      }
    }finally{human.dispose();}
  },120_000);
});
