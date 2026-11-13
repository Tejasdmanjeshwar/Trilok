import * as THREE from "three";
import {VANARA_SCAN_LANDMARKS_MM} from "./VanaraScanCalibration";

/**
 * Specimen-local rigid cranium/mandible alignment from the paired condylar
 * region proxies of USNM 334797. Both samples use a consistent +Z rostral,
 * +Y dorsal and +X lateral convention, but their translation and orientation
 * differ. The constrained two-point least-squares fit removes the previous
 * orientation mismatch WITHOUT scaling, shearing or editing source meshes.
 *
 * Two approximate landmarks cannot recover axial roll or dental occlusion.
 * This minimal-rotation solution is a documented anatomy prior, not a claim
 * that teeth/condyles were clinically registered or segmented by experts.
 */
export interface VanaraJawRegistration {
  readonly rotation: readonly [number,number,number,number];
  readonly translationMm: readonly [number,number,number];
  readonly residualRmsMm: number;
  readonly condyleMidpointMm: readonly [number,number,number];
  readonly symphysisMm: readonly [number,number,number];
  readonly mandibleCondyleSpanMm: number;
  readonly craniumJointSpanMm: number;
}

type Point = readonly [number,number,number];
const vector=(a:Point)=>new THREE.Vector3(a[0],a[1],a[2]);
const tuple=(v:THREE.Vector3):readonly [number,number,number]=>
  Object.freeze([v.x,v.y,v.z] as const);

export function registerVanaraMandible():VanaraJawRegistration {
  const l=VANARA_SCAN_LANDMARKS_MM;
  const fromL=vector(l.leftMandibleCondyleUnaligned);
  const fromR=vector(l.rightMandibleCondyleUnaligned);
  const toL=vector(l.leftCranialJointProxy);
  const toR=vector(l.rightCranialJointProxy);
  const jawAxis=fromR.clone().sub(fromL);
  const skullAxis=toR.clone().sub(toL);
  const jawSpan=jawAxis.length(), skullSpan=skullAxis.length();
  if(jawSpan<1||skullSpan<1)
    throw new Error("Unusable Smithsonian condyle landmarks");
  const rotation=new THREE.Quaternion().setFromUnitVectors(
    jawAxis.normalize(),skullAxis.normalize());
  const jawCenter=fromL.clone().add(fromR).multiplyScalar(.5);
  const skullCenter=toL.clone().add(toR).multiplyScalar(.5);
  const translation=skullCenter.clone().sub(jawCenter.applyQuaternion(rotation));
  const converted=(point:THREE.Vector3):THREE.Vector3=>
    point.clone().applyQuaternion(rotation).add(translation);
  const errL=converted(fromL).distanceToSquared(toL);
  const errR=converted(fromR).distanceToSquared(toR);
  return Object.freeze({
    rotation:Object.freeze(
      [rotation.x,rotation.y,rotation.z,rotation.w] as const),
    translationMm:tuple(translation),
    residualRmsMm:Math.sqrt((errL+errR)*.5),
    condyleMidpointMm:tuple(skullCenter),
    symphysisMm:tuple(converted(vector(l.mandibularSymphysisUnaligned))),
    mandibleCondyleSpanMm:jawSpan,
    craniumJointSpanMm:skullSpan,
  });
}

/** Deterministic rigid transform of a mandible-local scan landmark (millimetres). */
export function alignVanaraMandiblePoint(point:Point,
  registration:VanaraJawRegistration=VANARA_JAW_REGISTRATION):
  readonly [number,number,number] {
  const r=registration.rotation;
  const t=registration.translationMm;
  const p=vector(point).applyQuaternion(new THREE.Quaternion(...r));
  return tuple(p.add(new THREE.Vector3(...t)));
}

export const VANARA_JAW_REGISTRATION:VanaraJawRegistration=
  registerVanaraMandible();
