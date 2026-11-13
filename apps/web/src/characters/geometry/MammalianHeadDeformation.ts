import * as THREE from "three";
import type {MammalianHeadFamilyV1,MammalianHeadMorphologyV1} from
  "@trilok/character-core";
import type {AnatomicalHuman} from "./AnatomicalTemplate";
import {makeHumanHeadTransform,type HumanHeadTransform} from "./HumanHeadDeformation";

const smooth=(v:number):number=>{
  const t=THREE.MathUtils.clamp(v,0,1);
  return t*t*(3-2*t);
};
const bell=(v:number,center:number,radius:number):number=>{
  const d=(v-center)/radius;
  return Math.exp(-2*d*d);
};
export type MammalSide="left"|"right";
export interface MammalianHeadTransform extends HumanHeadTransform {
  readonly family:MammalianHeadFamilyV1;
  readonly featureRest:Readonly<{
    muzzle:THREE.Vector3;
    earLeft:THREE.Vector3;
    earRight:THREE.Vector3;
  }>;
}
export interface MammalianHeadLandmarks {
  readonly family:MammalianHeadFamilyV1;
  readonly muzzleRest:readonly [number,number,number];
  readonly earLeftRest:readonly [number,number,number];
  readonly earRightRest:readonly [number,number,number];
  muzzleWorld(target?:THREE.Vector3):THREE.Vector3;
  earWorld(side:MammalSide,target?:THREE.Vector3):THREE.Vector3;
}

/** C3.5 family-local, analytical source surface displacement. This uses the
 * same *continuous* CC0 head topology as C3.4, its real source rig, original
 * four influences and original UVs; neither species is made of primitives.
 * C1 labels distinguish the two graph head families; topology connectivity
 * remains shared. Actual zoological fidelity requires rendered acceptance. */
export function makeMammalianHeadTransform(human:AnatomicalHuman,
  family:MammalianHeadFamilyV1,
  shape:MammalianHeadMorphologyV1):MammalianHeadTransform {
  if(family!=="primate"&&family!=="bear")
    throw new Error("Unsupported C3.5 mammalian family");
  const base=makeHumanHeadTransform(human,shape);
  const {neck,chin,crown,eyeLeft,eyeRight}=base.landmarks;
  const height=crown.y-neck.y;
  const cx=(eyeLeft.x+eyeRight.x)*.5;
  const eyeY=(eyeLeft.y+eyeRight.y)*.5;
  const orbitHalf=Math.abs(eyeRight.x-eyeLeft.x)*.5;
  const faceZ=(eyeLeft.z+eyeRight.z)*.5;
  const frontRise=Math.max(.015,height*.09);
  if(height<.15||height>.6||orbitHalf<.012)
    throw new Error("C3.5 invalid source cranium/orbit dimensions");
  const isBear=family==="bear";
  const muzzleY=chin.y+(eyeY-chin.y)*(isBear?.57:.48);
  const muzzleR=Math.max(.035,orbitHalf*(isBear?1.28:.94));
  const muzzleHeight=Math.max(.042,height*(isBear?.30:.26));
  const faceGate=(z:number)=>smooth((z-faceZ+height*.14)/(height*.24));
  const neckGate=(y:number)=>smooth((y-neck.y)/(height*.27));
  const point=(original:THREE.Vector3):THREE.Vector3=>{
    const p=base.point(original.clone());
    const y=original.y, x=original.x-cx, z=original.z;
    const h=neckGate(y);
    if(h===0)return p;
    const front=faceGate(z);
    const muzzle=bell(x,0,muzzleR)*bell(y,muzzleY,muzzleHeight)*front*h;
    const nose=bell(x,0,muzzleR*.55)*
      bell(y,muzzleY+muzzleHeight*.33,muzzleHeight*.40)*front*h;
    const cheek=bell(Math.abs(x),orbitHalf*.92,orbitHalf*.90)*
      bell(y,muzzleY+height*.055,height*.23)*h;
    const brow=bell(Math.abs(x),orbitHalf*.78,orbitHalf*.9)*
      bell(y,eyeY+height*.065,height*.13)*front*h;
    const cranium=bell(y,neck.y+height*.70,height*.38)*h;
    // The ear surface is the actual source ear's lateral and posterior
    // CC0 region. Reposition it continuously; no floating ear meshes.
    const side=bell(Math.abs(x),orbitHalf*(isBear?2.45:2.1),
      orbitHalf*.83);
    const earY=eyeY+height*(isBear?.24:.025);
    const ear=side*bell(y,earY,height*(isBear?.31:.27))*
      (1-smooth((z-faceZ+height*.05)/(height*.30)))*h;
    const muzzleLength=(isBear?.119:.072)*shape.muzzleLength;
    const jawDepth=(isBear?.020:.012)*shape.jawMass;
    const widen=(isBear?.19:.11)*shape.muzzleWidth;
    const muzzleLift=(shape.muzzleHeight-1)*height*.19;
    const eyeLine=bell(y,eyeY,height*.17);
    const dx=
      x*(isBear?.19:.09)*cranium +
      x*widen*muzzle +
      x*(shape.jawMass-1)*.55*cheek +
      Math.sign(x)*(isBear?.021:.013)*shape.earSize*ear;
    const dy=
      muzzleLift*muzzle -
      (isBear?.007:.004)*shape.jawMass*bell(y,chin.y,height*.18)*front*h +
      (isBear?.058:.008)*shape.earSize*ear;
    const dz=
      muzzleLength*(muzzle*.74+nose*.32) +
      jawDepth*cheek +
      (isBear?.022:.028)*shape.browMass*brow +
      (isBear?-.010:.004)*cranium*eyeLine;
    return p.add(new THREE.Vector3(dx,dy,dz));
  };
  const position=human.mesh.geometry.getAttribute("position");
  const skinIndex=human.mesh.geometry.getAttribute("skinIndex");
  const skinWeight=human.mesh.geometry.getAttribute("skinWeight");
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
  let muzzle:THREE.Vector3|undefined,muzzleScore=-Infinity;
  for(let i=0;i<position.count;i++){
    const p=new THREE.Vector3().fromBufferAttribute(position,i);
    if(Math.abs(p.x-cx)>muzzleR*.75)continue;
    if(Math.abs(p.y-muzzleY)>muzzleHeight)continue;
    const score=p.z-Math.abs(p.y-muzzleY)*.7;
    if(score>muzzleScore){muzzleScore=score;muzzle=p;}
  }
  if(!muzzle)throw new Error("C3.5 source muzzle patch missing");
  return {
    ...base,family,point,
    featureRest:{muzzle,earLeft:earProbe("left"),earRight:earProbe("right")},
  };
}

/** Localize measured source patches to the shaped C1 head bone. These probes
 * follow FK; they do not add simulation joints, IK decisions or extra buffers. */
export function calibrateMammalianHeadLandmarks(human:AnatomicalHuman,
  transform:MammalianHeadTransform,
  mapBody:(p:THREE.Vector3,jointIndex:number)=>THREE.Vector3):
  MammalianHeadLandmarks {
  const root=human.spike.character.root;
  root.updateWorldMatrix(true,true);
  const bone=human.spike.skeleton.bones[transform.headJointIndex]!;
  const mapped=(p:THREE.Vector3)=>mapBody(transform.point(p.clone()),
    transform.headJointIndex);
  const muzzle=mapped(transform.featureRest.muzzle);
  const left=mapped(transform.featureRest.earLeft);
  const right=mapped(transform.featureRest.earRight);
  if(![muzzle,left,right].every(v=>v.toArray().every(Number.isFinite)))
    throw new Error("C3.5 nonfinite species landmark");
  const local=(p:THREE.Vector3)=>bone.worldToLocal(
    p.clone().applyMatrix4(root.matrixWorld));
  const headLocal={muzzle:local(muzzle),left:local(left),right:local(right)};
  const coord=(p:THREE.Vector3):readonly [number,number,number] =>
    Object.freeze(p.toArray() as [number,number,number]);
  const world=(p:THREE.Vector3,out:THREE.Vector3):THREE.Vector3=>{
    root.updateWorldMatrix(true,true);
    return out.copy(p).applyMatrix4(bone.matrixWorld);
  };
  return Object.freeze({
    family:transform.family,
    muzzleRest:coord(muzzle),earLeftRest:coord(left),earRightRest:coord(right),
    muzzleWorld(target=new THREE.Vector3()):THREE.Vector3{
      return world(headLocal.muzzle,target);
    },
    earWorld(side:MammalSide,target=new THREE.Vector3()):THREE.Vector3 {
      return world(side==="left"?headLocal.left:headLocal.right,target);
    },
  });
}
