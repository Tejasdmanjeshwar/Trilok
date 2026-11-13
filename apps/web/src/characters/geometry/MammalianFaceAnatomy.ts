import * as THREE from "three";
import type {MammalianHeadFamilyV1, MammalianHeadMorphologyV1} from
  "@trilok/character-core";
import type {HumanHeadTransform} from "./HumanHeadDeformation";

const clamp=(t:number)=>THREE.MathUtils.clamp(t,0,1);
const smooth=(t:number)=>{const x=clamp(t);return x*x*(3-2*x);};
const gaussian=(d:number,r:number)=>Math.exp(-2*(d/r)**2);

/** Named source-derived soft-tissue features. Measurements in meters.
 * Values are stylized anatomical design constraints, NOT direct scan samples. */
export interface MammalianFaceMetrics {
  readonly noseY:number;
  readonly mouthY:number;
  readonly faceZ:number;
  readonly halfOrbit:number;
  readonly nasalHalfWidth:number;
  readonly noseHeight:number;
  readonly mouthHalfWidth:number;
  readonly maximumMuzzleProjectionMeters:number;
}
export interface MammalianFaceFields {
  readonly nosePad:number;
  readonly nostrilLeft:number;
  readonly nostrilRight:number;
  readonly mouthCrease:number;
  readonly upperLip:number;
  readonly lowerLip:number;
  readonly muzzle:number;
  readonly cheeks:number;
  readonly bridge:number;
  readonly brow:number;
  readonly earLeft:number;
  readonly earRight:number;
  readonly earBowl:number;
  readonly eyeSocket:number;
  readonly mask:number;
}
export interface MammalianFaceAnatomy {
  readonly metrics:ReadOnlyMetrics;
  fields(original:THREE.Vector3):MammalianFaceFields;
  point(original:THREE.Vector3):THREE.Vector3;
  color(original:THREE.Vector3):THREE.Color;
}
type ReadOnlyMetrics=Readonly<MammalianFaceMetrics>;

/** Unlike the former projected Gaussian tip, independent nose pad, paired
 * nostril recesses, lips/mouth seam, zygomatic cheeks and ear bowl are all
 * rooted in source head/jaw/orbit positions and blended into the same skin.
 * The 4-weight skin and indexed CC0 mesh are never reconstructed here. */
export function makeMammalianFaceAnatomy(
  base:HumanHeadTransform,
  family:MammalianHeadFamilyV1,
  shape:MammalianHeadMorphologyV1,
):MammalianFaceAnatomy {
  const {neck,chin,crown,eyeLeft,eyeRight}=base.landmarks;
  const isBear=family==="bear";
  const span=(eyeLeft.y+eyeRight.y)*.5-chin.y;
  const headHeight=crown.y-neck.y;
  const cx=(eyeLeft.x+eyeRight.x)*.5;
  const eyeY=(eyeLeft.y+eyeRight.y)*.5;
  const halfOrbit=Math.abs(eyeRight.x-eyeLeft.x)*.5;
  const faceZ=(eyeLeft.z+eyeRight.z)*.5;
  if(![span,headHeight,halfOrbit].every(n=>Number.isFinite(n)&&n>.012))
    throw new Error("C3.5 source head landmarks out of physiological envelope");
  const noseY=chin.y+span*(isBear?.73:.76);
  const mouthY=chin.y+span*(isBear?.37:.35);
  const noseHeight=Math.max(.017,span*(isBear?.19:.16));
  const nasalHalfWidth=Math.max(.022,halfOrbit*(isBear?1.07:.76));
  const mouthHalfWidth=Math.max(.026,halfOrbit*(isBear?1.37:1.13));
  const cheekY=chin.y+span*.64;
  const browY=eyeY+headHeight*.055;
  const centerEarY=eyeY+headHeight*(isBear?.24:.04);
  const earX=halfOrbit*(isBear?2.35:2.15);
  const widthNose=(x:number)=>gaussian(x,nasalHalfWidth);
  const metrics:ReadOnlyMetrics=Object.freeze({
    noseY,mouthY,faceZ,halfOrbit,nasalHalfWidth,noseHeight,mouthHalfWidth,
    maximumMuzzleProjectionMeters:isBear?.063:.037,
  });
  const fields=(p:THREE.Vector3):MammalianFaceFields=>{
    const x=p.x-cx,y=p.y,z=p.z;
    const neckGate=smooth((y-neck.y)/(headHeight*.32));
    const front=smooth((z-faceZ+headHeight*.19)/(headHeight*.31));
    const mask=neckGate*front;
    const nosePad=widthNose(x)*gaussian(y-noseY,noseHeight)*mask;
    // Old World macaques have close, downward-facing nares; bears have a
    // broader rhinarium. Recesses are separate from the overall muzzle.
    const nostrilX=nasalHalfWidth*(isBear?.46:.40);
    const naresY=noseY-noseHeight*.22;
    const nostril=(center:number)=>gaussian(x-center,nasalHalfWidth*.25)*
      gaussian(y-naresY,noseHeight*.39)*mask;
    const mouthCrease=gaussian(x,mouthHalfWidth)*
      gaussian(y-mouthY,Math.max(.0038,span*.038))*mask;
    const lip=(offset:number)=>gaussian(x,mouthHalfWidth*.94)*
      gaussian(y-mouthY-offset,Math.max(.0065,span*.065))*mask;
    const cheeks=gaussian(Math.abs(x)-halfOrbit*.93,halfOrbit*.95)*
      gaussian(y-cheekY,span*.38)*mask;
    const muzzle=gaussian(x,halfOrbit*(isBear?1.64:1.35))*
      gaussian(y-(mouthY+noseY)*.5,span*.43)*mask;
    const bridge=gaussian(x,nasalHalfWidth*.76)*
      gaussian(y-(noseY+eyeY)*.5,span*.36)*mask;
    const brow=gaussian(Math.abs(x)-halfOrbit*.85,halfOrbit*.88)*
      gaussian(y-browY,headHeight*.13)*mask;
    const ear=(side:number)=>gaussian(x-side*earX,halfOrbit*.80)*
      gaussian(y-centerEarY,headHeight*(isBear?.23:.27))*
      (1-smooth((z-faceZ+headHeight*.03)/(headHeight*.26)))*neckGate;
    const leftEar=ear(-1),rightEar=ear(1);
    const earBowl=(leftEar+rightEar)*
      gaussian(y-centerEarY+headHeight*.022,headHeight*.16);
    const eyeSocket=gaussian(Math.abs(x)-halfOrbit,halfOrbit*.48)*
      gaussian(y-eyeY,headHeight*.085)*mask;
    return {
      nosePad,nostrilLeft:nostril(-nostrilX),
      nostrilRight:nostril(nostrilX),mouthCrease,
      upperLip:lip(span*.070),lowerLip:lip(-span*.070),
      muzzle,cheeks,bridge,brow,earLeft:leftEar,earRight:rightEar,
      earBowl,eyeSocket,mask,
    };
  };
  const point=(original:THREE.Vector3):THREE.Vector3=>{
    const basePoint=base.point(original.clone());
    const f=fields(original);
    if(f.mask===0&&f.earLeft===0&&f.earRight===0)return basePoint;
    const x=original.x-cx;
    const top=gaussian(original.y-(neck.y+headHeight*.73),headHeight*.40);
    const muzzleProjection=(isBear?.029:.016)*shape.muzzleLength*f.muzzle;
    const noseProjection=(isBear?.011:.007)*shape.muzzleLength*f.nosePad;
    const upperLipProjection=(isBear?.006:.004)*shape.jawMass*f.upperLip;
    const lowerLipProjection=(isBear?.006:.004)*shape.jawMass*f.lowerLip;
    // Tame the original human nose tip before applying the species' own nose
    // pad. Prevents a stretched human nose plus another projected snout.
    const flattenHumanNose=.42*f.bridge*f.nosePad;
    const humanTip=Math.max(0,original.z-faceZ);
    const concaveBrow=isBear?-.009*f.bridge:0;
    let dz=muzzleProjection+noseProjection+upperLipProjection+
      lowerLipProjection+(isBear?.007:.004)*shape.jawMass*f.cheeks+
      (isBear?.012:.014)*shape.browMass*f.brow+concaveBrow;
    dz-=humanTip*flattenHumanNose;
    dz-=(isBear?.008:.006)*(f.nostrilLeft+f.nostrilRight);
    dz-=(isBear?.008:.006)*f.mouthCrease;
    // Respect a conservative muzzle reach budget even at 1.15 x extremes.
    dz=THREE.MathUtils.clamp(dz,-.024,metrics.maximumMuzzleProjectionMeters);
    const widen=(isBear?.12:.058)*top*f.mask+
      (isBear?.16:.092)*shape.muzzleWidth*f.muzzle+
      (isBear?.09:.06)*shape.jawMass*f.cheeks;
    const ears=f.earLeft+f.earRight;
    const dx=x*widen+
      Math.sign(x)*(isBear?.012:.007)*shape.earSize*ears;
    const dy=(shape.muzzleHeight-1)*span*.16*f.muzzle+
      (isBear?.017:.003)*shape.earSize*ears-
      (isBear?.003:.002)*shape.jawMass*f.lowerLip;
    return basePoint.add(new THREE.Vector3(dx,dy,dz));
  };
  const palette = isBear ? {
    fur:new THREE.Color(0x806149),
    skin:new THREE.Color(0xab8868),
    muzzle:new THREE.Color(0xc3a180),
    nose:new THREE.Color(0x292a28),
    nostril:new THREE.Color(0x101213),
    lip:new THREE.Color(0x342923),
    ear:new THREE.Color(0x342921),
    eyelid:new THREE.Color(0x44332c),
  } : {
    fur:new THREE.Color(0x5c5850),
    skin:new THREE.Color(0x9c7164),
    muzzle:new THREE.Color(0x97766b),
    nose:new THREE.Color(0x795e55),
    nostril:new THREE.Color(0x302629),
    lip:new THREE.Color(0x4c3334),
    ear:new THREE.Color(0x6e4b48),
    eyelid:new THREE.Color(0x433034),
  };
  const color=(p:THREE.Vector3):THREE.Color=>{
    const f=fields(p),result=palette.fur.clone();
    // Soft contours and a separate nasal pad/lips make readably distinct
    // anatomy without third-party image assets or noncommercial CT meshes.
    result.lerp(palette.skin,clamp((isBear?.28:.86)*f.mask));
    result.lerp(palette.muzzle,clamp(f.muzzle*(isBear?.62:.54)+f.cheeks*.20));
    result.lerp(palette.eyelid,clamp(f.eyeSocket*(isBear?.55:.62)));
    result.lerp(palette.nose,clamp(f.nosePad*(isBear?.96:.60)));
    result.lerp(palette.nostril,clamp((f.nostrilLeft+f.nostrilRight)*.96));
    result.lerp(palette.lip,clamp(f.mouthCrease*.93));
    result.lerp(palette.ear,clamp(f.earBowl*.75));
    return result;
  };
  return Object.freeze({metrics,fields,point,color});
}
