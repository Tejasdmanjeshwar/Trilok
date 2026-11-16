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
    const joint=graph.joints.find(j=>j.role===part+"_"+side&&
      j.id.includes("arm["+side+",0]"));
    if(!joint)throw new Error("Missing scoped contact arm joint "+part+"/"+side);
    for(const motion of motions){
      const limit=fk.frames.get(joint.id)?.freedoms.get(motion);
      if(!limit)throw new Error("Uncalibrated contact arm freedom "+part+"/"+motion);
      result.push(Object.freeze({jointId:joint.id,motion,
        min:limit.min,max:limit.max}));
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
