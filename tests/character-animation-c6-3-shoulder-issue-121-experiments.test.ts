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
      // Reconstruct the helper's original calibrated pivot for every tested
      // blend; unlike a fixed translation, this uses the exact shared pivot.
      fk.applyRestDeltas([]);
      const anchors=Object.fromEntries((["left","right"] as const).map(side=>{
        const connector=human.spike.shoulderSkinBones!.get(side)!;
        const shoulder=human.spike.bones.get(joint("shoulder_"+side))!;
        return [side,{rest:connector.quaternion.clone(),
          connectorRestPosition:connector.position.clone(),
          shoulderRestPosition:shoulder.position.clone()}];
      })) as Record<"left"|"right",{
        rest:THREE.Quaternion;connectorRestPosition:THREE.Vector3;
        shoulderRestPosition:THREE.Vector3;
      }>;
      const sampler=createAnimationSampler(
        loadBakedStudioAnimation("human-kevin-run",human.spike.graph),human.spike.graph);
      for(const time of [.48,.50,.51,.52,.54]){
        fk.applyRestDeltas(sampler.sample(time));
        for(const blend of [0,.25,.5,.75,1]){
          for(const side of ["left","right"] as const){
            const connector=human.spike.shoulderSkinBones!.get(side)!;
            const shoulder=human.spike.bones.get(joint("shoulder_"+side))!;
            const rest=anchors[side];
            const localDelta=fk.frames.get(joint("shoulder_"+side))!.rest.clone()
              .invert().multiply(shoulder.quaternion);
            const partial=new THREE.Quaternion().slerp(localDelta,blend);
            connector.quaternion.copy(rest.rest).multiply(partial);
            const offset=rest.shoulderRestPosition.clone().sub(rest.connectorRestPosition);
            connector.position.copy(rest.connectorRestPosition).add(
              offset.clone().sub(offset.applyQuaternion(partial)));
          }
          human.spike.character.root.updateWorldMatrix(true,true);
          console.log("TRILOK_C121_VARIANT "+JSON.stringify({time,blend,
            left:stats(human,ids.left).map(x=>({face:x.face,
              ratio:+x.ratio.toFixed(5),dot:+x.normalDot.toFixed(5)})),
            right:stats(human,ids.right).map(x=>({face:x.face,
              ratio:+x.ratio.toFixed(5),dot:+x.normalDot.toFixed(5)}))}));
        }
      }
      // Face-edge neighborhood evidence: compare posed normals against
      // ADJACENT posed normals, not against unrotated world-space rest normals.
      // Shared original OBJ IDs connect intentional UV-seam duplicates.
      fk.applyRestDeltas(sampler.sample(.51));
      const index=human.mesh.geometry.getIndex()!;
      const p=human.mesh.geometry.getAttribute("position");
      const sourceIds=human.template.sourceVertexIds;
      const targetFaces=[6797,6634,2365,20356,20357,15844,15871,15607] as const;
      const edgeFaces=new Map<string,number[]>();
      const faceSource=(face:number)=>Array.from({length:3},(_,k)=>
        sourceIds[index.getX(face*3+k)]!);
      const edgeKey=(a:number,b:number)=>Math.min(a,b)+":"+Math.max(a,b);
      for(let f=0;f<index.count/3;f++){
        const source=faceSource(f);
        for(const [a,b] of [[source[0]!,source[1]!],
          [source[1]!,source[2]!],[source[2]!,source[0]!]]){
          const key=edgeKey(a!,b!),faces=edgeFaces.get(key)??[];
          faces.push(f);edgeFaces.set(key,faces);
        }
      }
      const norm=(face:number,posed:boolean)=>{
        const corners=Array.from({length:3},(_,k)=>{
          const id=index.getX(face*3+k);
          return posed?human.mesh.getVertexPosition(id,new THREE.Vector3()):
            new THREE.Vector3().fromBufferAttribute(p,id);
        });
        return corners[1]!.clone().sub(corners[0]!)
          .cross(corners[2]!.clone().sub(corners[0]!)).normalize();
      };
      for(const face of targetFaces){
        const ids=faceSource(face),neighbors=new Set<number>();
        for(const [a,b] of [[ids[0]!,ids[1]!],[ids[1]!,ids[2]!],
          [ids[2]!,ids[0]!]]){
          for(const other of edgeFaces.get(edgeKey(a!,b!))??[])
            if(other!==face)neighbors.add(other);
        }
        const rest=norm(face,false),posed=norm(face,true);
        const adjoining=[...neighbors].sort((a,b)=>a-b).map(other=>({
          face:other,
          restDot:+rest.dot(norm(other,false)).toFixed(6),
          poseDot:+posed.dot(norm(other,true)).toFixed(6),
        }));
        const original=ids.map(id=>Object.entries(weights.weights)
          .flatMap(([bone,rows])=>rows.filter(([source,w])=>source===id&&w>0)
            .map(([,w])=>[bone,w])));
        console.log("TRILOK_C121_ADJACENCY "+JSON.stringify({
          face,source:ids,original,adjoining,
          faceRatio:+faceInfo(human,face).ratio.toFixed(6),
        }));
      }
    }finally{human.dispose();}
  },120_000);
});
