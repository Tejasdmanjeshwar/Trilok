import * as THREE from "three";
import type {AnatomicalGraphV1} from "@trilok/character-core";
import type {AnatomicalFK,AnatomicalMotion,JointTarget} from
  "../characters/geometry/AnatomicalFK";
import {sourceBoneForRole} from "../characters/geometry/OfficialHumanRig";
import {fitConstrainedIK} from "./ConstrainedIK";
import {SOURCE_ARCHER_ROTATIONS_DEGREES,
  type ArcherReferenceVariant,type SourceEulerDegrees}
  from "./StudioMakeHumanArcherChannels";
import type {HandSide} from "./StudioTwoHandGrip";

/**
 * Retarget selected REAL MakeHuman archer BVH channels onto Trilok's legal
 * source-derived AnatomicalFK DOFs. This is a reference-seed/calibration
 * adapter, not another skeleton or IK runtime.
 *
 * Original single-frame BVHs: callharvey3d (metadata: CC-by; catalog: CC0).
 * Authored rotations are XYZ BVH channels in degrees, NOT direct FK angles.
 * Reference .L represents semantic RIGHT in OfficialHumanRig; .R is LEFT.
 */
export type ArcherReferenceHand="bow-holding"|"string-drawing";
export interface SourceRetargetDiagnostic {
  readonly jointId:string;
  readonly sourceBone:string;
  readonly reflected:boolean;
  readonly sourceRadians:number;
  readonly remainingQuaternionRadians:number;
}
export interface SourceRetargetResult {
  readonly commands:readonly JointTarget[];
  readonly diagnostics:readonly SourceRetargetDiagnostic[];
}
const SOURCE_DIGITS=["thumb","index","middle","ring","little"] as const;
type SourceDigit=typeof SOURCE_DIGITS[number];
type SourceChannel={name:string;motion:AnatomicalMotion;axis:THREE.Vector3;
  min:number;max:number};
const radians=THREE.MathUtils.degToRad;
const sourceReferenceName=(kind:ArcherReferenceHand)=>
  kind==="bow-holding"?"L":"R";

/** Reflection across the source rig X symmetry plane: M*R*M. Because M is
 * orientation reversing, the quaternion axial components transform as
 * (x,-y,-z), unlike an ordinary vector's (-x,y,z). */
export function mirrorSourceRotationX(q:THREE.Quaternion):THREE.Quaternion{
  return new THREE.Quaternion(q.x,-q.y,-q.z,q.w).normalize();
}
export function originalSourceEulerQuaternion(
  xyz:SourceEulerDegrees):THREE.Quaternion{
  if(xyz.length!==3||xyz.some(x=>!Number.isFinite(x)))
    throw new Error("Invalid original MakeHuman BVH Euler channels");
  // BVH explicitly declares Xrotation Yrotation Zrotation in this order.
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(
    radians(xyz[0]),radians(xyz[1]),radians(xyz[2]),"XYZ"));
}
function jointFor(graph:AnatomicalGraphV1,side:HandSide,role:string){
  const found=graph.joints.filter(j=>j.role===role&&
    (role.startsWith("finger_")?j.id.includes("arm["+side+",0]"):
      role.endsWith("_"+side)));
  if(found.length!==1)throw new Error("Expected unique source reference role "+role);
  return found[0]!;
}
function sourceEuler(variant:ArcherReferenceVariant,name:string):SourceEulerDegrees{
  const reference:Record<string,readonly number[]> =
    SOURCE_ARCHER_ROTATIONS_DEGREES[variant];
  const value=reference[name];
  if(!value||value.length!==3)throw new Error("Missing original MakeHuman source pose "+name);
  return value as SourceEulerDegrees;
}
function signedQuaternionResidual(actual:THREE.Quaternion,
  desired:THREE.Quaternion):readonly number[]{
  const difference=actual.clone().invert().multiply(desired).normalize();
  if(difference.w<0)difference.set(-difference.x,-difference.y,
    -difference.z,-difference.w);
  const magnitude=Math.hypot(difference.x,difference.y,difference.z);
  if(magnitude<1e-10)return [0,0,0];
  const radians=2*Math.atan2(magnitude,difference.w);
  const scale=radians/magnitude;
  return [difference.x*scale,difference.y*scale,difference.z*scale];
}
function legalProjection(fk:AnatomicalFK,jointId:string,
  sourceDelta:THREE.Quaternion,requested:readonly AnatomicalMotion[]){
  const frame=fk.frames.get(jointId);
  if(!frame)throw new Error("Missing source FK frame "+jointId);
  const channels:SourceChannel[]=requested.map(motion=>{
    const freedom=frame.freedoms.get(motion);
    if(!freedom)throw new Error("No source FK freedom "+jointId+"/"+motion);
    return {name:jointId,motion,axis:freedom.axis,min:freedom.min,max:freedom.max};
  });
  // The authoritative FK composes deltas right-multiplied after frame.rest
  // in flexion -> abduction -> rotation -> opposition order.
  const order:readonly AnatomicalMotion[]=["flexion","abduction","rotation","opposition"];
  const oriented=[...channels].sort((a,b)=>order.indexOf(a.motion)-order.indexOf(b.motion));
  const target=sourceDelta.clone();
  const twistSeed=oriented.map(c=>{
    const projection=target.x*c.axis.x+target.y*c.axis.y+target.z*c.axis.z;
    const signed=2*Math.atan2(projection,target.w);
    return THREE.MathUtils.clamp(signed,c.min,c.max);
  });
  const composite=(values:readonly number[])=>{
    const result=new THREE.Quaternion();
    for(let i=0;i<oriented.length;i++)result.multiply(
      new THREE.Quaternion().setFromAxisAngle(oriented[i]!.axis,values[i]!));
    return result;
  };
  const fit=fitConstrainedIK(twistSeed,oriented,
    values=>signedQuaternionResidual(composite(values),target),12);
  const error=signedQuaternionResidual(composite(fit.values),target);
  return {commands:oriented.map((ch,i)=>({
    jointId,motion:ch.motion,radians:fit.values[i]!,
  } as JointTarget)),error:Math.hypot(...error)};
}
/** Fit ONLY the supported FK controls. Residual angular mismatch represents
 * source twist outside the simplified semantic rig; report it instead of
 * illegally writing raw BVH Euler angles onto a joint or mutating the root.
 * The existing collision-coupled C5 contact IK remains authoritative. */
export function retargetSourceArcherPose(graph:AnatomicalGraphV1,
  fk:AnatomicalFK,side:HandSide,kind:ArcherReferenceHand,
  variant:ArcherReferenceVariant="square",includeArm=false):SourceRetargetResult{
  const commands:JointTarget[]=[];
  const diagnostics:SourceRetargetDiagnostic[]=[];
  const canonicalSuffix=sourceReferenceName(kind);
  const actualSuffix=side==="right"?"L":"R";
  const reflected=actualSuffix!==canonicalSuffix;
  const apply=(role:string,sourceName:string,
    motions:readonly AnatomicalMotion[])=>{
    const joint=jointFor(graph,side,role);
    const boundSource=sourceBoneForRole(role,joint.id);
    if(!boundSource||!boundSource.endsWith("."+actualSuffix))
      throw new Error("MakeHuman source semantic handedness mismatch "+role);
    const xyz=sourceEuler(variant,sourceName);
    const q=originalSourceEulerQuaternion(xyz);
    const target=reflected?mirrorSourceRotationX(q):q;
    // FK uses local axes referenced to the original source bind orientation.
    // Project quaternion rather than interpreting X as a raw bend angle.
    const fitted=legalProjection(fk,joint.id,target,motions);
    commands.push(...fitted.commands);
    diagnostics.push({jointId:joint.id,sourceBone:sourceName,reflected,
      sourceRadians:2*Math.acos(Math.min(1,Math.abs(target.w))),
      remainingQuaternionRadians:fitted.error});
  };
  for(let d=0;d<SOURCE_DIGITS.length;d++){
    const digit:SourceDigit=SOURCE_DIGITS[d]!;
    const total=digit==="thumb"?2:3;
    for(let index=0;index<total;index++){
      const motions:AnatomicalMotion[]=digit==="thumb"&&index===0?
        ["flexion","opposition"]:index===0&&digit!=="thumb"?
        ["flexion","abduction"]:["flexion"];
      apply("finger_"+digit+"_"+index,
        "finger"+(d+1)+"-"+(index+1)+"."+canonicalSuffix,motions);
    }
  }
  if(includeArm){
    for(const [role,source,motions] of [
      ["clavicle","clavicle",["abduction","flexion"]],
      ["shoulder","upperarm01",["abduction","flexion","rotation"]],
      ["elbow","lowerarm01",["flexion","rotation"]],
      ["wrist","wrist",["flexion","abduction"]],
    ] as const){
      apply(role+"_"+side,source+"."+canonicalSuffix,
        motions as readonly AnatomicalMotion[]);
    }
  }
  if(commands.length!== (includeArm?26:17))
    throw new Error("Invalid MakeHuman source retarget channel count");
  return Object.freeze({commands:Object.freeze(commands),
    diagnostics:Object.freeze(diagnostics)});
}
