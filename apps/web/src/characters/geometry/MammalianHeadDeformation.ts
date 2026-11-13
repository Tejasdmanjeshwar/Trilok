import * as THREE from "three";
import type {MammalianHeadFamilyV1,MammalianHeadMorphologyV1} from
  "@trilok/character-core";
import type {AnatomicalHuman} from "./AnatomicalTemplate";
import {makeHumanHeadTransform,type HumanHeadTransform} from "./HumanHeadDeformation";
import {makeMammalianFaceAnatomy,type MammalianFaceAnatomy} from
  "./MammalianFaceAnatomy";
import {makeLicensedVanaraFaceAnatomy} from "./LicensedVanaraFaceAtlas";

export type MammalSide="left"|"right";
export interface MammalianHeadTransform extends HumanHeadTransform {
  readonly family:MammalianHeadFamilyV1;
  readonly anatomy:MammalianFaceAnatomy;
  readonly featureRest:Readonly<{
    muzzle:THREE.Vector3;
    nose:THREE.Vector3;
    nostrilLeft:THREE.Vector3;
    nostrilRight:THREE.Vector3;
    mouth:THREE.Vector3;
    earLeft:THREE.Vector3;
    earRight:THREE.Vector3;
  }>;
}
export interface MammalianHeadLandmarks {
  readonly family:MammalianHeadFamilyV1;
  readonly muzzleRest:readonly [number,number,number];
  readonly noseRest:readonly [number,number,number];
  readonly nostrilLeftRest:readonly [number,number,number];
  readonly nostrilRightRest:readonly [number,number,number];
  readonly mouthRest:readonly [number,number,number];
  readonly earLeftRest:readonly [number,number,number];
  readonly earRightRest:readonly [number,number,number];
  muzzleWorld(target?:THREE.Vector3):THREE.Vector3;
  noseWorld(target?:THREE.Vector3):THREE.Vector3;
  nostrilWorld(side:MammalSide,target?:THREE.Vector3):THREE.Vector3;
  /** Lower oral contour follows the existing C1 jaw joint, not the skull. */
  mouthWorld(target?:THREE.Vector3):THREE.Vector3;
  earWorld(side:MammalSide,target?:THREE.Vector3):THREE.Vector3;
}

/** Reconstruct distinct facial regions on a C2-pinned continuous surface.
 * Source-index topology/UV and four-weight ownership remain unchanged.
 * This is a bounded procedural stylization, not a transferred animal scan. */
export function makeMammalianHeadTransform(human:AnatomicalHuman,
  family:MammalianHeadFamilyV1,
  shape:MammalianHeadMorphologyV1):MammalianHeadTransform {
  if(family!=="primate"&&family!=="bear")
    throw new Error("Unsupported C3.5 mammalian family");
  const base=makeHumanHeadTransform(human,shape);
  const prototype=makeMammalianFaceAnatomy(base,family,shape);
  const anatomy=family==="primate"
    ? makeLicensedVanaraFaceAnatomy(base,shape,prototype) : prototype;
  const {neck,crown,eyeLeft,eyeRight}=base.landmarks;
  const height=crown.y-neck.y;
  const cx=(eyeLeft.x+eyeRight.x)*.5;
  const eyeY=(eyeLeft.y+eyeRight.y)*.5;
  const orbitHalf=anatomy.metrics.halfOrbit;
  const faceZ=anatomy.metrics.faceZ;
  if(height<.15||height>.6||orbitHalf<.012)
    throw new Error("C3.5 invalid source cranium/orbit dimensions");
  const isBear=family==="bear";
  const position=human.mesh.geometry.getAttribute("position");
  const skinIndex=human.mesh.geometry.getAttribute("skinIndex");
  const skinWeight=human.mesh.geometry.getAttribute("skinWeight");
  const jawJointIndex=base.jawJointIndex;
  const sourceProbe=(x:number,y:number,kind:"head"|"jaw"):THREE.Vector3=>{
    let result:THREE.Vector3|undefined,score=-Infinity;
    for(let i=0;i<position.count;i++){
      let owner=0;
      for(let k=0;k<4;k++){
        const idx=skinIndex.getComponent(i,k);
        if(idx===(kind==="head"?base.headJointIndex:jawJointIndex))
          owner+=skinWeight.getComponent(i,k);
      }
      if(owner<.15)continue;
      const p=new THREE.Vector3().fromBufferAttribute(position,i);
      if(Math.abs(p.y-y)>height*.35)continue;
      const target=Math.abs(p.x-x)*1.8+Math.abs(p.y-y)*2;
      const value=p.z-target-(owner<.35?.03:0);
      if(value>score){score=value;result=p;}
    }
    if(!result)throw new Error("C3.5 cannot locate "+kind+" skin reference");
    return result;
  };
  const earProbe=(side:MammalSide):THREE.Vector3=>{
    let picked:THREE.Vector3|undefined,score=-Infinity;
    const sign=side==="left"?-1:1;
    for(let i=0;i<position.count;i++){
      let owner=0;
      for(let k=0;k<4;k++){
        if(skinIndex.getComponent(i,k)===base.headJointIndex)
          owner+=skinWeight.getComponent(i,k);
      }
      if(owner<.35)continue;
      const p=new THREE.Vector3().fromBufferAttribute(position,i);
      if((p.x-cx)*sign<orbitHalf*1.2)continue;
      const desiredY=eyeY+(isBear?.23:.025)*height;
      const value=p.x*sign-2*Math.abs(p.y-desiredY)-
        1.1*Math.abs(p.z-(faceZ-height*.19));
      if(value>score){score=value;picked=p;}
    }
    if(!picked)throw new Error("C3.5 source ear patch missing "+side);
    return picked;
  };
  const n=anatomy.metrics;
  const nostrilOffset=n.nasalHalfWidth*(isBear?.46:.40);
  const nose=sourceProbe(cx,n.noseY,"head");
  const mouth=sourceProbe(cx,n.mouthY,"jaw");
  const nostrilLeft=sourceProbe(cx-nostrilOffset,n.noseY-n.noseHeight*.22,"head");
  const nostrilRight=sourceProbe(cx+nostrilOffset,n.noseY-n.noseHeight*.22,"head");
  if(!(nostrilLeft.x<nostrilRight.x))
    throw new Error("C3.5 nasal reference order invalid");
  return {
    ...base,family,anatomy,point:anatomy.point,
    featureRest:{
      muzzle:sourceProbe(cx,(n.noseY+n.mouthY)*.5,"head"),
      nose,nostrilLeft,nostrilRight,mouth,
      earLeft:earProbe("left"),earRight:earProbe("right"),
    },
  };
}

/** Calibrate both head-following nose/ear and jaw-following mouth references
 * after rest-space rebind. These probes do not add domain joints or hits. */
export function calibrateMammalianHeadLandmarks(human:AnatomicalHuman,
  transform:MammalianHeadTransform,
  mapBody:(p:THREE.Vector3,jointIndex:number)=>THREE.Vector3):
  MammalianHeadLandmarks {
  const root=human.spike.character.root;
  root.updateWorldMatrix(true,true);
  const head=human.spike.skeleton.bones[transform.headJointIndex]!;
  const jaw=human.spike.skeleton.bones[transform.jawJointIndex]!;
  const mapped=(p:THREE.Vector3,index=transform.headJointIndex)=>
    mapBody(transform.point(p.clone()),index);
  const p=transform.featureRest;
  const rest={
    muzzle:mapped(p.muzzle),nose:mapped(p.nose),
    nostrilLeft:mapped(p.nostrilLeft),nostrilRight:mapped(p.nostrilRight),
    mouth:mapped(p.mouth,transform.jawJointIndex),
    earLeft:mapped(p.earLeft),earRight:mapped(p.earRight),
  };
  if(Object.values(rest).some(v=>!v.toArray().every(Number.isFinite)))
    throw new Error("C3.5 nonfinite shaped facial references");
  const loc=(v:THREE.Vector3,bone:THREE.Bone)=>bone.worldToLocal(
    v.clone().applyMatrix4(root.matrixWorld));
  const local={
    muzzle:loc(rest.muzzle,head),nose:loc(rest.nose,head),
    nostrilLeft:loc(rest.nostrilLeft,head),
    nostrilRight:loc(rest.nostrilRight,head),
    mouth:loc(rest.mouth,jaw),
    earLeft:loc(rest.earLeft,head),earRight:loc(rest.earRight,head),
  };
  const arr=(v:THREE.Vector3):readonly [number,number,number]=>
    Object.freeze(v.toArray() as [number,number,number]);
  const world=(v:THREE.Vector3,bone:THREE.Bone,out:THREE.Vector3):THREE.Vector3=>{
    root.updateWorldMatrix(true,true);
    return out.copy(v).applyMatrix4(bone.matrixWorld);
  };
  return Object.freeze({
    family:transform.family,
    muzzleRest:arr(rest.muzzle),noseRest:arr(rest.nose),
    nostrilLeftRest:arr(rest.nostrilLeft),
    nostrilRightRest:arr(rest.nostrilRight),
    mouthRest:arr(rest.mouth),
    earLeftRest:arr(rest.earLeft),earRightRest:arr(rest.earRight),
    muzzleWorld(target=new THREE.Vector3()):THREE.Vector3{
      return world(local.muzzle,head,target);
    },
    noseWorld(target=new THREE.Vector3()):THREE.Vector3{
      return world(local.nose,head,target);
    },
    nostrilWorld(side:MammalSide,target=new THREE.Vector3()):THREE.Vector3{
      return world(side==="left"?local.nostrilLeft:local.nostrilRight,head,target);
    },
    mouthWorld(target=new THREE.Vector3()):THREE.Vector3{
      return world(local.mouth,jaw,target);
    },
    earWorld(side:MammalSide,target=new THREE.Vector3()):THREE.Vector3{
      return world(side==="left"?local.earLeft:local.earRight,head,target);
    },
  });
}
