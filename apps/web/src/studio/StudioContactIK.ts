import * as THREE from "three";
import type {AnatomicalGraphV1} from "@trilok/character-core";
import type {AnatomicalFK,AnatomicalMotion,JointTarget}
  from "../characters/geometry/AnatomicalFK";
import {fitConstrainedIK,type IKFit,type IKFreedom} from "./ConstrainedIK";

/** Source-rig-independent mechanisms for any contact-constrained equipment.
 * Contact geometries and skin tests belong to the caller, not the solver.
 * Scoped IDs avoid guessing which arm a role belongs to. */
export interface ContactFreedom extends IKFreedom {
  readonly jointId:string;
  readonly motion:AnatomicalMotion;
}
export type ContactArmSide="left"|"right";

/** Reflection is defined in avatar-local X, not raw Euler angles. A rotation
 * axis is an axial vector: (x,y,z) -> (x,-y,-z). The signed parameter probe
 * direction must reverse where the source-calibrated right axis is anti-
 * parallel to the reflected left axis. Morphological lengths are irrelevant;
 * both arms still solve their own independently bounded DOFs.
 */
export function mirrorContactDifferenceSign(graph:AnatomicalGraphV1,
  fk:AnatomicalFK,jointId:string,motion:AnatomicalMotion,
  side:ContactArmSide):1|-1{
  if(side==="left")return 1;
  const joint=graph.joints.find(j=>j.id===jointId);
  if(!joint)throw new Error("Missing anatomical mirrored joint "+jointId);
  const counterpartRole=joint.role.endsWith("_right")?
    joint.role.slice(0,-6)+"_left":joint.role;
  const opposite=graph.joints.find(j=>j.role===counterpartRole&&
    (joint.role.startsWith("finger_")?j.id.includes("arm[left,0]"):true));
  const a=opposite&&fk.frames.get(opposite.id)?.freedoms.get(motion);
  const b=fk.frames.get(jointId)?.freedoms.get(motion);
  const qa=opposite&&fk.restWorldQuaternions.get(opposite.id);
  const qb=fk.restWorldQuaternions.get(jointId);
  if(!a||!b||!qa||!qb)
    throw new Error("Missing mirrored FK axial frames "+jointId+"/"+motion);
  const left=a.axis.clone().applyQuaternion(qa);
  const right=b.axis.clone().applyQuaternion(qb);
  const reflected=new THREE.Vector3(left.x,-left.y,-left.z);
  if(Math.abs(reflected.dot(right))<.25)
    throw new Error("Incompatible mirrored FK axes "+jointId+"/"+motion);
  return reflected.dot(right)<0?-1:1;
}

export const ARM_CONTACT_CHANNELS:readonly (readonly [string,readonly AnatomicalMotion[]])[]=[
  ["clavicle",["abduction","flexion"]],
  ["shoulder",["abduction","flexion","rotation"]],
  ["elbow",["flexion","rotation"]],
  ["wrist",["flexion","abduction"]],
];
export function contactArmFreedoms(graph:AnatomicalGraphV1,fk:AnatomicalFK,
  side:ContactArmSide):readonly ContactFreedom[]{
  const result:ContactFreedom[]=[];
  for(const [part,motions] of ARM_CONTACT_CHANNELS){
    // Current MakeHuman clavicle/shoulder roles are side-scoped but do not
    // necessarily have a nested arm[side,0] graph ID. Require the semantic
    // side, prefer the named arm branch when present, never cross sides.
    const matching=graph.joints.filter(j=>j.role===part+"_"+side);
    const joint=matching.find(j=>j.id.includes("arm["+side+",0]"))??
      (matching.length===1?matching[0]:undefined);
    if(!joint)throw new Error("Missing scoped contact arm joint "+part+"/"+side);
    for(const motion of motions){
      const limit=fk.frames.get(joint.id)?.freedoms.get(motion);
      if(!limit)throw new Error("Uncalibrated contact arm freedom "+part+"/"+motion);
      result.push(Object.freeze({jointId:joint.id,motion,
        min:limit.min,max:limit.max,
        differenceSign:mirrorContactDifferenceSign(graph,fk,joint.id,motion,side)}));
    }
  }
  return Object.freeze(result);
}
/** Pose composition is immutable and preserves unrelated animation channels.
 * The result is a full FK command overlay, never a mutable solver skeleton. */
export function composeContactPose(base:readonly JointTarget[],
  freedoms:readonly ContactFreedom[],values:readonly number[]):readonly JointTarget[]{
  if(freedoms.length!==values.length)throw new Error("Mismatched contact command count");
  const pose=new Map(base.map(c=>[c.jointId+"/"+c.motion,c]));
  freedoms.forEach((f,i)=>pose.set(f.jointId+"/"+f.motion,
    {jointId:f.jointId,motion:f.motion,radians:values[i]!}));
  return [...pose.values()];
}
/** Caller owns a geometry-specific residual: cylinders, shields and dynamic
 * string/point contacts all use identical legal parameter bounds and DLS. */
export function solveContactConstraints(seed:readonly number[],
  freedoms:readonly ContactFreedom[],
  residual:(values:readonly number[])=>readonly number[],
  iterations=24):IKFit{
  return fitConstrainedIK(seed,freedoms,residual,iterations);
}
export function clampContactSeed(values:readonly number[],
  freedoms:readonly ContactFreedom[]):number[]{
  if(values.length!==freedoms.length)throw new Error("Invalid contact seed length");
  return values.map((v,i)=>Math.max(freedoms[i]!.min,Math.min(freedoms[i]!.max,v)));
}
