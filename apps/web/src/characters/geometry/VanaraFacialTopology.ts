import * as THREE from "three";
import type {MammalianHeadMorphologyV1} from "@trilok/character-core";
import {VANARA_SCAN_LANDMARKS_MM,VANARA_SCAN_PROVENANCE} from
  "./VanaraScanCalibration";
import {VANARA_JAW_REGISTRATION} from "./VanaraScanRegistration";

/**
 * A spatially differentiated macaque face sculpt on a dedicated species mesh.
 * These are EXTERNAL soft-tissue masses informed by the skeletal specimen;
 * they are not an exposed skull or human-nose rest mesh.
 *
 * Species-specific regions: buccal pads, upper maxillary muzzle, separate
 * mandibular/jowl mass, flattened nasal pad with paired sunken nares,
 * recessed orbital sockets, projecting supraorbital brows and ear concha.
 *
 * Each region has its own independent local coordinate falloff and profile.
 * This is intentionally bounded stylized soft tissue, not a claimed digitized
 * primate face. Mesh connectivity remains a single continuous skinned surface
 * with a C2-compatible neck ring.
 */
export interface VanaraFaceSample {
  readonly lateral: number;
  readonly forward: number;
  readonly cheek: number;
  readonly muzzle: number;
  readonly jaw: number;
  readonly nose: number;
  readonly nostrilLeft: number;
  readonly nostrilRight: number;
  readonly mouth: number;
  readonly orbit: number;
  readonly brow: number;
  readonly ear: number;
  readonly concha: number;
  readonly faceMask: number;
  readonly jawWeight: number;
}
const clamp=THREE.MathUtils.clamp;
const smooth=(x:number)=>{const t=clamp(x,0,1);return t*t*(3-2*t);};
const gaussian=(distance:number,width:number):number=>
  Math.exp(-2*(distance/Math.max(width,1e-5))**2);
const double=(x:number,x0:number,width:number)=>
  gaussian(x-x0,width)+gaussian(x+x0,width);
const limited=(x:number,x0:number,width:number)=>
  smooth((x-(x0-width))/width)* (1-smooth((x-x0)/width));

/** Scan-constrained proportions in head-height normalized coordinates. */
export function calibrateVanaraFace(height:number,width:number,
  depth:number,shape:MammalianHeadMorphologyV1) {
  const lm=VANARA_SCAN_LANDMARKS_MM;
  const interp=(x:number)=>clamp(x,0,1);
  const eyeX=width*((Math.abs(lm.leftOrbitRimProxy[0])+
    Math.abs(lm.rightOrbitRimProxy[0]))*.5/
    (VANARA_SCAN_PROVENANCE.scanCranialZygomaticWidthMm*.5));
  const cheekX=width*((Math.abs(lm.leftZygomatic[0])+
    Math.abs(lm.rightZygomatic[0]))*.5/
    (VANARA_SCAN_PROVENANCE.scanCranialZygomaticWidthMm*.5));
  const jawPivotT=interp((VANARA_JAW_REGISTRATION.condyleMidpointMm[1]-
    VANARA_SCAN_PROVENANCE.scanVerticalMinMm)/
    (VANARA_SCAN_PROVENANCE.scanVerticalMaxMm-
      VANARA_SCAN_PROVENANCE.scanVerticalMinMm));
  const chinT=interp((VANARA_JAW_REGISTRATION.symphysisMm[1]-
    VANARA_SCAN_PROVENANCE.scanVerticalMinMm)/
    (VANARA_SCAN_PROVENANCE.scanVerticalMaxMm-
      VANARA_SCAN_PROVENANCE.scanVerticalMinMm));
  // The actual external soft-tissue muzzle extends beyond the skeletal
  // maxilla; keep the nose short and the upper muzzle broad.
  const mouthT=chinT+(jawPivotT-chinT)*.43;
  const noseT=Math.max(mouthT+.11,.46);
  const eyeT=.77;
  const fur=new THREE.Color(0x67594d);
  const bare=new THREE.Color(0xac8273);
  const pad=new THREE.Color(0xb18b7b);
  const dark=new THREE.Color(0x36282a);
  const orbital=new THREE.Color(0x503938);
  const sample=(x:number,t:number,theta:number):VanaraFaceSample=>{
    const front=smooth((Math.sin(theta)-.11)/.52);
    const flank=1-smooth((Math.sin(theta)+.1)/.65);
    const normalized=Math.abs(x)/Math.max(width,1e-5);
    const muzzleArea=gaussian(x,.66*width*shape.muzzleWidth)*
      gaussian(t-.385,.155)*front;
    const cheek=double(x,Math.min(cheekX*.79,width*.75),width*.39)*
      gaussian(t-.44,.15)*front;
    const jaw=gaussian(x,width*.82)*gaussian(t-.22,.105)*front;
    const nose=gaussian(x,width*.20)*gaussian(t-noseT,.065)*front;
    const nasalBridge=gaussian(x,width*.16)*
      gaussian(t-(noseT+.14),.16)*front;
    const nostrilL=gaussian(x+width*.125,width*.105)*
      gaussian(t-(noseT-.028),.026)*front;
    const nostrilR=gaussian(x-width*.125,width*.105)*
      gaussian(t-(noseT-.028),.026)*front;
    const mouth=gaussian(x,width*.71*shape.muzzleWidth)*
      gaussian(t-mouthT,.018)*front;
    const orbit=double(x,eyeX,width*.24)*gaussian(t-eyeT,.058)*front;
    const brow=double(x,eyeX,width*.35)*
      gaussian(t-(eyeT+.095),.055)*front;
    const ear=gaussian(normalized-.95,.28)*gaussian(t-.65,.16)*
      (flank+.38*front);
    const concha=gaussian(normalized-1.02,.19)*
      gaussian(t-.65,.083)*(flank+.45*front);
    const faceMask=front*smooth((t-.13)/.17)*
      (1-smooth((t-.91)/.095))*
      (1-smooth((normalized-.75)/.35)*.45);
    const jawWeight=smooth((jawPivotT-t)/.16)*
      smooth((Math.sin(theta)+.6)/1.03)*.92;
    // A separately projected midface and mandibular jaw: the nasal bridge is
    // deliberately NOT a stretched human nose.
    const forward=
      depth*(.42*shape.muzzleLength*muzzleArea+
        .20*shape.jawMass*cheek+
        .27*shape.jawMass*jaw+
        .12*nose+.075*nasalBridge+
        .21*shape.browMass*brow-
        .16*orbit-.14*(nostrilL+nostrilR)-.115*mouth-
        .10*concha);
    const lateral=Math.sign(x)*width*
      (.24*shape.earSize*ear-.105*concha+
        .065*cheek);
    return {lateral,forward,cheek,muzzle:muzzleArea,jaw,nose,
      nostrilLeft:nostrilL,nostrilRight:nostrilR,mouth,orbit,brow,
      ear,concha,faceMask,jawWeight};
  };
  const color=(f:VanaraFaceSample):THREE.Color=>{
    const result=fur.clone().lerp(bare,Math.min(f.faceMask,1));
    result.lerp(pad,clamp(f.muzzle*.55+f.cheek*.23,0,.8));
    result.lerp(orbital,clamp(f.orbit*.75,0,.72));
    result.lerp(dark,clamp(f.nostrilLeft*.95+f.nostrilRight*.95+
      f.mouth*.9,0,.96));
    result.lerp(new THREE.Color(0x886253),clamp(f.ear*.6-f.concha*.18,0,.72));
    return result;
  };
  return Object.freeze({sample,color,eyeX,eyeT,mouthT,noseT,
    jawPivotT,chinT,cheekX});
}
