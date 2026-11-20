import {readFileSync} from "node:fs";
import {describe,it} from "vitest";
import * as THREE from "three";
import {createAnimationSampler} from "../packages/character-core/src/index";
import {loadBakedStudioAnimation} from "../apps/web/src/studio/StudioAnimationLibrary";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {AnatomicalFK} from "../apps/web/src/characters/geometry/AnatomicalFK";
import {sourceWeightRole,type SourceRig,type SourceWeights} from "../apps/web/src/characters/geometry/OfficialHumanRig";

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

/** CPU-only dual-quaternion reference for diagnosis: never used in gameplay. */
function dualQuaternionSurface(human:ReturnType<typeof bindTemplateToSemanticRig>){
  const mesh=human.mesh;
  human.spike.character.root.updateWorldMatrix(true,true);
  const matrices=human.spike.skeleton.bones.map((bone,i)=>
    mesh.bindMatrixInverse.clone().multiply(bone.matrixWorld)
      .multiply(human.spike.skeleton.boneInverses[i]!).multiply(mesh.bindMatrix));
  const positions=mesh.geometry.getAttribute("position");
  const skinIndex=mesh.geometry.getAttribute("skinIndex");
  const skinWeight=mesh.geometry.getAttribute("skinWeight");
  const rotations=matrices.map(matrix=>new THREE.Quaternion().setFromRotationMatrix(matrix));
  const translations=matrices.map(matrix=>new THREE.Vector3().setFromMatrixPosition(matrix));
  const cache=new Map<number,THREE.Vector3>();
  return (vertex:number):THREE.Vector3=>{
    const previous=cache.get(vertex);
    if(previous)return previous;
    const real=[0,0,0,0],dual=[0,0,0,0];
    let reference:THREE.Quaternion|undefined;
    for(let k=0;k<4;k++){
      const weight=skinWeight.getComponent(vertex,k);
      if(weight===0)continue;
      const index=skinIndex.getComponent(vertex,k);
      const q=rotations[index]!,t=translations[index]!;
      if(!reference)reference=q;
      const sign=reference.dot(q)<0?-1:1;
      const d=new THREE.Quaternion(t.x,t.y,t.z,0).multiply(q);
      for(let component=0;component<4;component++){
        const value=[q.x,q.y,q.z,q.w][component]!;
        const dv=[d.x,d.y,d.z,d.w][component]!;
        real[component]!;dual[component]!;
        real[component]=(real[component]??0)+value*weight*sign;
        dual[component]=(dual[component]??0)+dv*weight*sign*.5;
      }
    }
    const norm=Math.hypot(...real);
    if(norm<1e-10||!Number.isFinite(norm))
      throw new Error("Invalid DQS accumulated orientation");
    const qr=new THREE.Quaternion(real[0]!/norm,real[1]!/norm,
      real[2]!/norm,real[3]!/norm);
    const qd=new THREE.Quaternion(dual[0]!/norm,dual[1]!/norm,
      dual[2]!/norm,dual[3]!/norm);
    const translation=qd.multiply(qr.clone().invert());
    const p=new THREE.Vector3().fromBufferAttribute(positions,vertex)
      .applyQuaternion(qr).add(new THREE.Vector3(translation.x*2,
        translation.y*2,translation.z*2));
    cache.set(vertex,p);
    return p;
  };
}
function referenceFace(human:ReturnType<typeof bindTemplateToSemanticRig>,
  face:number,get:(i:number)=>THREE.Vector3){
  const indices=human.mesh.geometry.getIndex()!;
  const corners=Array.from({length:3},(_,k)=>get(indices.getX(face*3+k)));
  const a=corners[1]!.clone().sub(corners[0]!)
    .cross(corners[2]!.clone().sub(corners[0]!));
  return {area:a.length()*.5,normal:a.normalize()};
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
      // The source CC0 skin may have 5+ distinct mapped owners, truncated
      // to four on the GPU. Compare exact unpruned mapped LBS at the same
      // pose to isolate whether compaction explains the *upper clavicle* fold.
      const roles=new Map(human.spike.graph.joints.map((j,i)=>[j.role,i]));
      const originals=new Map<number,Map<number,number>>();
      const targetSourceIds=new Set(targetFaces.flatMap(face=>
        Array.from({length:3},(_,k)=>human.template.sourceVertexIds[
          human.mesh.geometry.getIndex()!.getX(face*3+k)]!)));
      for(const [name,entries] of Object.entries(weights.weights)){
        const role=sourceWeightRole(name);
        let mapped=role?roles.get(role):undefined;
        const connector=/^shoulder01\.(L|R)$/.exec(name);
        if(connector){
          const side=connector[1]==="L"?"right":"left";
          mapped=human.spike.skeleton.bones.indexOf(
            human.spike.shoulderSkinBones!.get(side as "left"|"right")!);
        }
        if(!entries.some(([id])=>targetSourceIds.has(id)))continue;
        if(mapped===undefined)throw new Error("Unmapped original source skin "+name);
        for(const [id,weight] of entries){
          if(!targetSourceIds.has(id))continue;
          let byBone=originals.get(id);
          if(!byBone){byBone=new Map();originals.set(id,byBone);}
          byBone.set(mapped,(byBone.get(mapped)??0)+weight);
        }
      }
      const unpruned=(()=>{
        const matrices=human.spike.skeleton.bones.map((bone,i)=>
          bone.matrixWorld.clone().multiply(human.spike.skeleton.boneInverses[i]!));
        const memo=new Map<number,THREE.Vector3>();
        return (id:number)=>{
          const cached=memo.get(id);if(cached)return cached;
          const sourceId=sourceIds[id]!;
          const weightsByBone=originals.get(sourceId);
          if(!weightsByBone)throw new Error("Missing MakeHuman source owner "+sourceId);
          const sum=[...weightsByBone.values()].reduce((a,b)=>a+b,0);
          const position=new THREE.Vector3().fromBufferAttribute(
            human.mesh.geometry.getAttribute("position"),id);
          const out=new THREE.Vector3();
          for(const [bone,weight] of weightsByBone)
            out.addScaledVector(position.clone().applyMatrix4(matrices[bone]!),weight/sum);
          memo.set(id,out);return out;
        };
      })();
      for(const face of targetFaces){
        const rest=referenceFace(human,face,i=>new THREE.Vector3().fromBufferAttribute(
          human.mesh.geometry.getAttribute("position"),i));
        const current=referenceFace(human,face,i=>
          human.mesh.getVertexPosition(i,new THREE.Vector3()));
        const exact=referenceFace(human,face,unpruned);
        console.log("TRILOK_C121_UNPRUNED "+JSON.stringify({
          face,currentRatio:current.area/rest.area,unprunedRatio:exact.area/rest.area,
          currentNormalDot:current.normal.dot(rest.normal),
          unprunedNormalDot:exact.normal.dot(rest.normal),
        }));
      }
      // Compare linear-blend skinning against a per-vertex DQS reference
      // with identical source geometry, weights, bind matrices and pose.
      // A DQS win is only a hypothesis gate, not GPU shader approval.
      const dq=dualQuaternionSurface(human);
      const restPosition=human.mesh.geometry.getAttribute("position");
      for(const face of targetFaces){
        const rest=referenceFace(human,face,i=>
          new THREE.Vector3().fromBufferAttribute(restPosition,i));
        const lbs=referenceFace(human,face,i=>
          human.mesh.getVertexPosition(i,new THREE.Vector3()));
        const dqs=referenceFace(human,face,dq);
        console.log("TRILOK_C121_DQS "+JSON.stringify({
          face,restArea:rest.area,lbsRatio:lbs.area/rest.area,
          dqsRatio:dqs.area/rest.area,
          lbsDot:lbs.normal.dot(rest.normal),
          dqsDot:dqs.normal.dot(rest.normal),
        }));
      }
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
      // Snapshot read-only bone-skin matrices for a source-indexed offline
      // optimization experiment. Never modify production animation clips.
      console.log("TRILOK_C121_ROLE_INDEX "+JSON.stringify({
        roles:human.spike.graph.joints.map((j,i)=>[j.role,i]),
        shoulderHelpers:(["left","right"] as const).map(side=>[
          side,human.spike.skeleton.bones.indexOf(
            human.spike.shoulderSkinBones!.get(side)!)
        ]),
        forearmHelpers:(["left","right"] as const).map(side=>[
          side,human.spike.skeleton.bones.indexOf(
            human.spike.forearmSkinBones!.get(side)!)
        ]),
      }));
      for(const clipId of ["human-kevin-idle","human-kevin-walk",
        "human-kevin-run","human-idle","human-walk","human-jog",
        "human-sprint"]){
        const source=loadBakedStudioAnimation(clipId,human.spike.graph);
        const sampleClip=createAnimationSampler(source,human.spike.graph);
        const times=clipId==="human-kevin-run"?
          [0,.15,.30,.40,.45,.48,.50,.51,.52,.54,.57,.60]:
          [0,source.durationSeconds*.25,source.durationSeconds*.5,
            source.durationSeconds*.75];
        for(const t of times){
          fk.applyRestDeltas(sampleClip.sample(t));
          const matrices=human.spike.skeleton.bones.map((bone,i)=>
            bone.matrixWorld.clone().multiply(
              human.spike.skeleton.boneInverses[i]!).elements.map(x=>
              +x.toFixed(9)));
          console.log("TRILOK_C121_BONE_MATRIX "+JSON.stringify({
            clipId,time:t,matrices,
          }));
        }
      }
    }finally{human.dispose();}
  },120_000);
});
