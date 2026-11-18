import { CHARACTER_COORDINATES, type Quat, type Vec3 } from "./schema";

/**
 * C6.2 skeletal retargeting. Portable, deterministic quaternion mathematics;
 * deliberately has no Three.js objects, scene mutations, or clip-name policy.
 * A frame requires a shaft AND a non-collinear anatomical cue: one axis alone
 * never determines pronation/twist. Descriptors contain calibrated world-rest
 * data, not the nominal C1 bindTranslation values.
 */
export interface RetargetRigJointV1 {
  readonly id: string;
  readonly parentId: string | null;
  readonly restWorldPosition: Vec3;
  readonly restWorldRotation: Quat;
  readonly shaftWorld: Vec3;
  /** Signed anatomical direction, e.g. palm normal or bend-plane forward. */
  readonly secondaryWorld: Vec3;
}
export interface RetargetRigDescriptorV1 {
  readonly schemaVersion: 1;
  readonly identitySha256: string;
  readonly coordinates: typeof CHARACTER_COORDINATES;
  readonly joints: readonly RetargetRigJointV1[];
}
export interface RetargetJointMappingV1 {
  readonly sourceId: string;
  readonly targetId: string;
}
export interface RetargetJointCalibrationV1 extends RetargetJointMappingV1 {
  readonly sourceRestWorldRotation: Quat;
  readonly targetRestWorldRotation: Quat;
  readonly sourceAnatomicalFrameWorld: Quat;
  readonly targetAnatomicalFrameWorld: Quat;
  /** Anatomical reference-pose orientation transfer, target * inverse(source). */
  readonly frameConversion: Quat;
}
export interface RetargetProfileV1 {
  readonly schemaVersion: 1;
  readonly sourceRigSha256: string;
  readonly targetRigSha256: string;
  readonly unmappedTargetPolicy: "inherit-rest";
  readonly calibrations: readonly RetargetJointCalibrationV1[];
}
export interface RetargetSampleV1 {
  readonly jointId: string;
  /** Rest-relative rotation in the C1 joint's actual local bind basis. */
  readonly rotation: Quat;
}
const EPS = 1e-9;
const identity: Quat = [0, 0, 0, 1];

function fail(message: string): never { throw new Error("Retarget calibration: " + message); }
function finite(v: readonly number[], n: number): boolean {
  return v.length === n && v.every(Number.isFinite);
}
function unitVector(v: Vec3, label: string): Vec3 {
  if (!finite(v, 3)) fail("invalid vector " + label);
  const length = Math.hypot(...v);
  if (length < EPS) fail("zero anatomical direction " + label);
  return [v[0] / length, v[1] / length, v[2] / length];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function multiply(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
function normalize(q: Quat, label: string): Quat {
  if (!finite(q, 4)) fail("invalid quaternion " + label);
  const magnitude = Math.hypot(...q);
  if (magnitude < EPS) fail("zero quaternion " + label);
  return q.map(v => v / magnitude) as unknown as Quat;
}
function inverse(q: Quat): Quat { return [-q[0], -q[1], -q[2], q[3]]; }
function product(...q: readonly Quat[]): Quat {
  return normalize(q.reduce((a, b) => multiply(a, b), identity), "product");
}
/** Converts right-handed orthonormal *column* axes to XYZW. */
function fromBasis(x: Vec3, y: Vec3, z: Vec3): Quat {
  const m00=x[0],m01=y[0],m02=z[0];
  const m10=x[1],m11=y[1],m12=z[1];
  const m20=x[2],m21=y[2],m22=z[2];
  const trace=m00+m11+m22;
  let q: Quat;
  if(trace>0){
    const s=2*Math.sqrt(trace+1);
    q=[(m21-m12)/s,(m02-m20)/s,(m10-m01)/s,s/4];
  }else if(m00>m11&&m00>m22){
    const s=2*Math.sqrt(1+m00-m11-m22);
    q=[s/4,(m01+m10)/s,(m02+m20)/s,(m21-m12)/s];
  }else if(m11>m22){
    const s=2*Math.sqrt(1+m11-m00-m22);
    q=[(m01+m10)/s,s/4,(m12+m21)/s,(m02-m20)/s];
  }else{
    const s=2*Math.sqrt(1+m22-m00-m11);
    q=[(m02+m20)/s,(m12+m21)/s,s/4,(m10-m01)/s];
  }
  return normalize(q,"anatomical frame");
}
/** Local Y is signed shaft, local Z is projected secondary cue, X=Y cross Z. */
export function anatomicalFrame(shaft: Vec3, secondary: Vec3): Quat {
  const y=unitVector(shaft,"shaft"), cue=unitVector(secondary,"secondary");
  const parallel=dot(y,cue);
  const projected: Vec3=[cue[0]-parallel*y[0],
    cue[1]-parallel*y[1],cue[2]-parallel*y[2]];
  if (Math.hypot(...projected) < 1e-4)
    fail("collinear anatomical cues; twist cannot be calibrated");
  const z=unitVector(projected,"projected secondary");
  const x=unitVector(cross(y,z),"anatomical lateral");
  return fromBasis(x,y,cross(x,y));
}
function validatedRig(rig: RetargetRigDescriptorV1): Map<string,RetargetRigJointV1> {
  if (rig.schemaVersion!==1 || rig.coordinates!==CHARACTER_COORDINATES ||
      !/^[a-f0-9]{64}$/.test(rig.identitySha256) ||
      !Array.isArray(rig.joints) || !rig.joints.length ||
      rig.joints.length>512) fail("invalid rig identity or size");
  const nodes=new Map<string,RetargetRigJointV1>();
  for(const joint of rig.joints){
    if(!joint.id || nodes.has(joint.id) ||
        !finite(joint.restWorldPosition,3) ||
        !finite(joint.restWorldRotation,4) ||
        Math.abs(Math.hypot(...joint.restWorldRotation)-1)>1e-5)
      fail("duplicate/malformed rest joint " + joint.id);
    anatomicalFrame(joint.shaftWorld,joint.secondaryWorld);
    nodes.set(joint.id,joint);
  }
  let roots=0;
  for(const joint of rig.joints){
    if(joint.parentId===null){roots++;continue;}
    if(!nodes.has(joint.parentId)||joint.parentId===joint.id)
      fail("invalid parent for " + joint.id);
    const seen=new Set<string>([joint.id]);
    let current: RetargetRigJointV1 | undefined=joint;
    while(current?.parentId){
      if(seen.has(current.parentId))fail("cyclic hierarchy " + joint.id);
      seen.add(current.parentId);
      current=nodes.get(current.parentId);
    }
  }
  if(roots!==1)fail("rig must contain a single root");
  return nodes;
}
/** Once-per-rig calibration. The same output applies to every compatible clip. */
export function createRetargetProfile(
  source: RetargetRigDescriptorV1, target: RetargetRigDescriptorV1,
  mappings: readonly RetargetJointMappingV1[],
): RetargetProfileV1 {
  const src=validatedRig(source), dst=validatedRig(target);
  if(!mappings.length)fail("no explicit joint mappings");
  const usedSource=new Set<string>(), usedTarget=new Set<string>();
  const mapped=new Map<string,string>();
  for(const mapping of mappings){
    if(!src.has(mapping.sourceId)||!dst.has(mapping.targetId)||
      usedSource.has(mapping.sourceId)||usedTarget.has(mapping.targetId))
      fail("unknown or duplicate joint mapping " + mapping.sourceId + " -> " + mapping.targetId);
    usedSource.add(mapping.sourceId);usedTarget.add(mapping.targetId);
    mapped.set(mapping.targetId,mapping.sourceId);
  }
  // Stable order follows target canonical graph; nothing depends on source node indices.
  const calibrations: RetargetJointCalibrationV1[]=[];
  for(const joint of target.joints){
    const sourceId=mapped.get(joint.id);
    if(!sourceId)continue;
    const origin=src.get(sourceId)!;
    const sf=anatomicalFrame(origin.shaftWorld,origin.secondaryWorld);
    const tf=anatomicalFrame(joint.shaftWorld,joint.secondaryWorld);
    calibrations.push({
      sourceId,targetId:joint.id,
      sourceRestWorldRotation:origin.restWorldRotation,
      targetRestWorldRotation:joint.restWorldRotation,
      sourceAnatomicalFrameWorld:sf,targetAnatomicalFrameWorld:tf,
      frameConversion:product(tf,inverse(sf)),
    });
  }
  return {schemaVersion:1,sourceRigSha256:source.identitySha256,
    targetRigSha256:target.identitySha256,unmappedTargetPolicy:"inherit-rest",
    calibrations};
}
/**
 * Transfer complete world orientation deltas through anatomical coordinates:
 * QtargetWorld = Ftarget/Fsource * (QsourceNow/QsourceRest) *
 *                Fsource/Ftarget * QtargetRest.
 * Reconstruct local rotations using the animated TARGET parent, not source
 * parent names; untracked target joints inherit their own local rest transform.
 */
export function retargetWorldPose(
  profile: RetargetProfileV1, target: RetargetRigDescriptorV1,
  sourceWorldRotations: ReadonlyMap<string,Quat>,
  sourceSha256: string,
  poseMode: "rest-relative" | "source-anatomical" = "rest-relative",
): readonly RetargetSampleV1[] {
  if(!["rest-relative","source-anatomical"].includes(poseMode))
    fail("unsupported retarget pose mode");
  if(profile.schemaVersion!==1 || profile.sourceRigSha256!==sourceSha256 ||
      profile.targetRigSha256!==target.identitySha256 ||
      profile.unmappedTargetPolicy!=="inherit-rest")
    fail("stale or incompatible retarget profile");
  const targetNodes=validatedRig(target);
  const cal=new Map(profile.calibrations.map(c=>[c.targetId,c]));
  const computed=new Map<string,Quat>();
  const visiting=new Set<string>();
  const world=(id:string):Quat=>{
    const existing=computed.get(id);
    if(existing)return existing;
    if(visiting.has(id))fail("cyclic target parent during retarget " + id);
    const joint=targetNodes.get(id);
    if(!joint)fail("missing target " + id);
    visiting.add(id);
    const parent=joint!.parentId?world(joint!.parentId):identity;
    const restParent=joint!.parentId?targetNodes.get(joint!.parentId)!.restWorldRotation:identity;
    const restLocal=product(inverse(restParent),joint!.restWorldRotation);
    const c=cal.get(id);
    let desired:Quat;
    if(!c){
      desired=product(parent,restLocal);
    }else{
      const now=sourceWorldRotations.get(c.sourceId);
      if(!now || !finite(now,4) || Math.abs(Math.hypot(...now)-1)>1e-5)
        fail("missing/nonunit animated source " + c.sourceId);
      const srcMotion=product(now,inverse(c.sourceRestWorldRotation));
      desired=poseMode==="source-anatomical"
        // Source rest T and target rest A are not the SAME auxiliary pose.
        // Express absolute source segment orientation in the measured
        // shaft+twist frame, rather than assuming their raw rest poses match.
        // Consequently source rest T maps to physical T, not target rest A.
        ? product(srcMotion,c.sourceAnatomicalFrameWorld,
            inverse(c.targetAnatomicalFrameWorld),c.targetRestWorldRotation)
        : product(c.frameConversion,srcMotion,
            inverse(c.frameConversion),c.targetRestWorldRotation);
    }
    computed.set(id,desired);
    visiting.delete(id);
    return desired;
  };
  // Evaluate every target parent even if omitted from output.
  for(const joint of target.joints)world(joint.id);
  return profile.calibrations.map(c=>{
    const joint=targetNodes.get(c.targetId)!;
    const parent=joint.parentId?computed.get(joint.parentId)!:identity;
    const restParent=joint.parentId?targetNodes.get(joint.parentId)!.restWorldRotation:identity;
    const restLocal=product(inverse(restParent),joint.restWorldRotation);
    const local=product(inverse(parent),computed.get(joint.id)!);
    return {jointId:joint.id,rotation:product(inverse(restLocal),local)};
  });
}

/**
 * Retarget modes:
 * - rest-relative: source and target rest are a matched auxiliary reference pose.
 * - source-anatomical: rest poses differ (UAL1 T versus MakeHuman A).
 *   Preserve source anatomical shaft AND signed twist frame in the canonical
 *   target skeleton, including the original source rest's physical T posture.
 * Both modes reconstruct target local rotations from the animated target
 * parent and include all mapped rotational degrees of freedom.
 */
