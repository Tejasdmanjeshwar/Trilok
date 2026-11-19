import type { AnatomicalGraphV1, Quat, Vec3 } from "./schema";
import type {
  RetargetRigDescriptorV1, RetargetRigJointV1,
  RetargetJointMappingV1,
} from "./retargeting";

/** Measured WORLD-rest transforms from the actual calibrated runtime bones,
 * or from the complete glTF source-node scene (not nominal C1 translations). */
export interface HumanoidRestSampleV1 {
  readonly targetJointId: string;
  readonly nodeId: string;
  readonly worldPosition: Vec3;
  readonly worldRotation: Quat;
}
type Side="left"|"right";
const ZERO=1e-9;
function sub(a:Vec3,b:Vec3):Vec3{
  return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
}
function cross(a:Vec3,b:Vec3):Vec3{
  return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],
    a[0]*b[1]-a[1]*b[0]];
}
function dot(a:Vec3,b:Vec3):number{
  return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
}
function norm(v:Vec3,label:string):Vec3{
  const n=Math.hypot(...v);
  if(!Number.isFinite(n)||n<ZERO)
    throw new Error("Invalid humanoid retarget cue "+label);
  return [v[0]/n,v[1]/n,v[2]/n];
}
function negate(v:Vec3):Vec3{return [-v[0],-v[1],-v[2]];}
/**
 * Human source-family frame adapter. Everything below is calibrated once
 * from paired signed anatomical landmarks. The generic retarget engine knows
 * nothing about humanoid roles, bilateral anatomy or finger counts.
 *
 * Exactly one sample per desired joint is required. Source descriptors may
 * omit unsupported targets (palm, foot helpers, extra limbs), retaining
 * source names while referencing the nearest *mapped* source ancestor.
 * Target descriptors retain the COMPLETE real C1 hierarchy.
 */
export function createHumanRestDescriptor(
  graph: AnatomicalGraphV1,
  identitySha256: string,
  samples: readonly HumanoidRestSampleV1[],
  options: { readonly sourceMapping?:readonly RetargetJointMappingV1[] } = {},
): RetargetRigDescriptorV1 {
  if(!/^[a-f0-9]{64}$/.test(identitySha256))
    throw new Error("Invalid descriptor fingerprint");
  const byTarget=new Map<string,HumanoidRestSampleV1>();
  const byNode=new Set<string>();
  const known=new Set(graph.joints.map(j=>j.id));
  for(const sample of samples){
    if(!known.has(sample.targetJointId)||byTarget.has(sample.targetJointId)||
      byNode.has(sample.nodeId)||sample.worldPosition.length!==3||
      sample.worldRotation.length!==4||
      ![...sample.worldPosition,...sample.worldRotation].every(Number.isFinite)||
      Math.abs(Math.hypot(...sample.worldRotation)-1)>1e-5)
      throw new Error("Duplicate/invalid measured rest sample "+sample.nodeId);
    byTarget.set(sample.targetJointId,sample);
    byNode.add(sample.nodeId);
  }
  const mapping=options.sourceMapping;
  if(mapping){
    if(samples.length!==mapping.length ||
      mapping.some(m=>byTarget.get(m.targetId)?.nodeId!==m.sourceId))
      throw new Error("Source descriptor does not match the exact anatomy mapping");
  }else if(samples.length!==graph.joints.length||
    graph.joints.some(j=>byTarget.get(j.id)?.nodeId!==j.id)){
    throw new Error("Target descriptor needs every actual runtime C1 bone");
  }
  const jointById=new Map(graph.joints.map(j=>[j.id,j]));
  const role=(name:string,side?:Side):HumanoidRestSampleV1=>{
    const candidates=graph.joints.filter(j=>j.role===name&&
      (side===undefined||j.id.includes("["+side+",0]"))&&
      byTarget.has(j.id));
    if(candidates.length!==1)
      throw new Error("Missing or ambiguous human landmark "+name+"/"+side);
    return byTarget.get(candidates[0]!.id)!;
  };
  const position=(name:string,side?:Side):Vec3=>role(name,side).worldPosition;
  const hipsRight=sub(position("hip_right"),position("hip_left"));
  const up=norm(sub(position("neck"),position("pelvis")),"torso up");
  const right=norm(hipsRight,"bilateral hips");
  const forward=norm(cross(right,up),"signed torso forward");
  const palms=new Map<Side,Vec3>();
  for(const side of ["left","right"] as const){
    const wrist=position("wrist_"+side);
    const index=position("finger_index_0",side);
    const little=position("finger_little_0",side);
    const middle=position("finger_middle_0",side);
    const thumb=position("finger_thumb_1",side);
    // Signed palm plane, resolved by actual thumb geometry (not guessed
    // left/right and not an uncalibrated global +Z/-Z).
    const plane=norm(cross(sub(index,little),sub(middle,wrist)),
      side+" palm plane");
    const orientation=dot(sub(thumb,wrist),plane);
    if(Math.abs(orientation)<1e-5)
      throw new Error("Ambiguous real palm normal "+side);
    palms.set(side,orientation>0?plane:negate(plane));
  }
  const sampleForRole=(name:string,side?:Side):HumanoidRestSampleV1|undefined=>{
    const matches=graph.joints.filter(j=>j.role===name&&
      (side===undefined||j.id.includes("["+side+",0]"))&&byTarget.has(j.id));
    return matches.length===1?byTarget.get(matches[0]!.id):undefined;
  };
  const shaftFor=(id:string):Vec3=>{
    const joint=jointById.get(id)!;
    const sample=byTarget.get(id)!;
    const name=joint.role;
    const side:Side|undefined=joint.id.includes("[left,0]")?"left":
      joint.id.includes("[right,0]")?"right":undefined;
    let target:HumanoidRestSampleV1|undefined;
    if(name==="pelvis")target=sampleForRole("spine_lower");
    else if(name==="spine_lower")target=sampleForRole("chest");
    else if(name==="chest")target=sampleForRole("neck");
    else if(name==="neck")target=sampleForRole("head");
    else if(name.startsWith("clavicle_"))target=sampleForRole("shoulder_"+side);
    else if(name.startsWith("shoulder_"))target=sampleForRole("elbow_"+side);
    else if(name.startsWith("elbow_"))target=sampleForRole("wrist_"+side);
    else if(name.startsWith("wrist_")||name.startsWith("palm_"))
      target=sampleForRole("finger_middle_0",side);
    else if(name.startsWith("hip_"))target=sampleForRole("knee_"+side);
    else if(name.startsWith("knee_"))target=sampleForRole("ankle_"+side);
    else if(name.startsWith("ankle_")||name.startsWith("foot_"))
      target=sampleForRole("toe_"+side);
    else if(name.startsWith("finger_")){
      const match=/^finger_(thumb|index|middle|ring|little)_([0-2])$/.exec(name);
      if(match){
        target=sampleForRole("finger_"+match[1]+"_"+(Number(match[2])+1),side);
      }
    }
    if(target && target.nodeId!==sample.nodeId)
      return norm(sub(target.worldPosition,sample.worldPosition),name+" shaft");
    // Leaf joints need an upstream measured segment direction, never an
    // invented bone-local Euler axis. For source toes this skips C1 foot.
    let parent=joint.parentId;
    while(parent&&!byTarget.has(parent))parent=jointById.get(parent)?.parentId??null;
    const proximal=parent?byTarget.get(parent):undefined;
    if(proximal)
      return norm(sub(sample.worldPosition,proximal.worldPosition),name+" distal shaft");
    // Only the source/target pelvis should have no ancestor.
    throw new Error("Uncalibrated leaf anatomical axis "+id);
  };
  const records:RetargetRigJointV1[]=samples.map(sample=>{
    const j=jointById.get(sample.targetJointId)!;
    const side:Side|undefined=j.id.includes("[left,0]")?"left":
      j.id.includes("[right,0]")?"right":undefined;
    let secondary:Vec3=forward;
    if(side && (j.role.startsWith("finger_")||
      j.role.startsWith("wrist_")||j.role.startsWith("palm_")||
      j.role.startsWith("elbow_")))
      secondary=palms.get(side)!;
    else if(j.role.startsWith("ankle_")||
      j.role.startsWith("foot_")||j.role.startsWith("toe_")||
      j.role==="jaw")
      secondary=up;
    let parent=j.parentId;
    while(parent && !byTarget.has(parent))
      parent=jointById.get(parent)?.parentId??null;
    return {id:sample.nodeId,parentId:parent?byTarget.get(parent)!.nodeId:null,
      restWorldPosition:sample.worldPosition,
      restWorldRotation:sample.worldRotation,
      shaftWorld:shaftFor(j.id),secondaryWorld:secondary};
  });
  return {schemaVersion:1,identitySha256,
    coordinates:graph.coordinates,joints:records};
}
