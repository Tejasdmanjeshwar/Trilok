import * as THREE from "three";
import type {AnatomicalGraphV1} from "@trilok/character-core";
import {AnatomicalFK,type JointTarget,type AnatomicalMotion}
  from "../characters/geometry/AnatomicalFK";
import type {StudioHumanModel} from "./StudioHumanModel";
import {calibrateGripSpreads,swordGripTargets,fitHandleCenter} from "./StudioWeaponGrip";

export type HandSide="left"|"right";
export type TwoHandWeapon="longsword"|"staff";
export type TwoHandEquipment =
  "longsword-right"|"longsword-left"|"staff-right"|"staff-left";
export type EquipmentChoice="none"|"left"|"right"|TwoHandEquipment;
export const isTwoHandEquipment=(value:EquipmentChoice):
  value is TwoHandEquipment=>value.startsWith("longsword-")||value.startsWith("staff-");
export function primaryHand(mode:EquipmentChoice):HandSide|undefined{
  if(mode==="none")return undefined;
  return mode.endsWith("right")?"right":"left";
}
export function twoHandKind(mode:TwoHandEquipment):TwoHandWeapon{
  return mode.startsWith("longsword-")?"longsword":"staff";
}
export interface TwoHandGripV1 {
  readonly schemaVersion:1;
  readonly kind:TwoHandWeapon;
  readonly primary:HandSide;
  readonly secondary:HandSide;
  readonly primarySocket:string;
  readonly secondarySocket:string;
  readonly separationMeters:number;
  readonly radiusMeters:number;
  readonly dimensions:TwoHandDimensions;
}
export interface TwoHandIKResult {
  readonly reachable:boolean;
  readonly commands:readonly JointTarget[];
  readonly primaryErrorMeters:number;
  readonly secondaryErrorMeters:number;
  readonly primaryDeltaMeters:readonly number[];
  readonly secondaryDeltaMeters:readonly number[];
  readonly primaryAxisDot:number;
  readonly secondaryAxisDot:number;
  readonly iterations:number;
  readonly refinementIterations?:number;
  readonly reason:"ok"|"primary-unreachable"|"secondary-unreachable"|"unsafe-stance";
  readonly headClearanceMeters:number;
  readonly elbowMaxHeightMeters:number;
  readonly headHeightMeters:number;
  readonly maximumPalmHeightMeters:number;
  readonly separationMeters:number;
  /** Distance between initially posed native source-hand grip channels. */
  readonly initialHandSpanMeters:number;
  readonly reachDiagnostics?:readonly Readonly<{seed:number;initialSpan:number;
    primaryError:number;secondaryError:number;primaryAxis:number;
    secondaryAxis:number;reason:string}>[];
  readonly weaponWorld:THREE.Matrix4;
  readonly dimensions:TwoHandDimensions;
  /** Optional palm-local skin-fitted staff grip landmarks, measured before IK. */
  readonly gripAnchors?:Readonly<Record<HandSide,readonly [number,number,number]>>;
}

/** Independently specified dimensions in meters for a reference adult.
 * The fixed, same-shaft grip landmarks are NOT inferred from the hands.
 * A body-stature scale is permitted; an IK reach error is not. */
export interface TwoHandDimensions {
  readonly handleLength:number;
  readonly bladeLength:number;
  readonly shaftLength:number;
  readonly guardWidth:number;
  readonly radius:number;
  readonly primaryGripY:number;
  readonly secondaryGripY:number;
  readonly scale:number;
}
export const TWO_HAND_REFERENCE:Readonly<Record<TwoHandWeapon,Omit<TwoHandDimensions,"scale">>>=
  Object.freeze({
    longsword:Object.freeze({handleLength:.28,bladeLength:.86,shaftLength:0,
      guardWidth:.22,radius:.0135,primaryGripY:.095,secondaryGripY:-.095}),
    staff:Object.freeze({handleLength:0,bladeLength:0,shaftLength:1.72,
      guardWidth:0,radius:.015,primaryGripY:.245,secondaryGripY:-.245}),
  });
/** Source-height scaling is independent of finger or palm separation.
 * Unsupported young/small bodies can fail reach without stretching the weapon. */
export function twoHandDimensions(model:StudioHumanModel,kind:TwoHandWeapon):
  TwoHandDimensions {
  const root=model.human.spike.character.root;
  root.updateWorldMatrix(true,true);
  const head=root.worldToLocal(world(jointBone(model,"head","right")));
  const ankle=root.worldToLocal(world(jointBone(model,"ankle_left","left")));
  const stature=head.y-ankle.y+.13;
  if(!Number.isFinite(stature)||stature<=0)throw new Error("Invalid source stature");
  const scale=THREE.MathUtils.clamp(stature/1.75,.4,1.2);
  const spec=TWO_HAND_REFERENCE[kind];
  return Object.freeze({scale,handleLength:spec.handleLength*scale,
    bladeLength:spec.bladeLength*scale,shaftLength:spec.shaftLength*scale,
    guardWidth:spec.guardWidth*scale,radius:spec.radius*scale,
    primaryGripY:spec.primaryGripY*scale,
    secondaryGripY:spec.secondaryGripY*scale});
}

/** The same calibrated anatomical rig supplies every joint and motion range.
 * The solver emits immutable FK commands; it does not write free Euler angles,
 * move the character root, or bypass C2 shoulder/forearm skin helpers. */
const MOTIONS:readonly (readonly [string,readonly AnatomicalMotion[]])[]=[
  ["clavicle",["abduction","flexion"]],
  ["shoulder",["flexion","abduction","rotation"]],
  ["elbow",["flexion","rotation"]],
  ["wrist",["flexion","abduction"]],
];
type AxisDOF={readonly jointId:string;readonly motion:AnatomicalMotion;
  readonly min:number;readonly max:number;readonly key:string};
const key=(jointId:string,motion:AnatomicalMotion)=>jointId+"/"+motion;
function scopedJoint(graph:AnatomicalGraphV1,role:string,hand:HandSide){
  const joint=graph.joints.find(j=>j.role===role&&
    (role.startsWith("finger_")?j.id.includes("arm["+hand+",0]"):true));
  if(!joint)throw new Error("Missing two-hand joint "+role);
  return joint;
}
function jointBone(model:StudioHumanModel,role:string,hand:HandSide):THREE.Bone{
  const j=scopedJoint(model.human.spike.graph,role,hand);
  const bone=model.human.spike.bones.get(j.id);
  if(!bone)throw new Error("Missing two-hand bone "+j.id);
  return bone;
}
const world=(bone:THREE.Object3D)=>bone.getWorldPosition(new THREE.Vector3());
/** Contact center is inside the curled finger envelope, not at the
 * skinning palm joint. Authored independently using the same source-bone
 * landmarks as Blender, preserving the 6mm grip-contact acceptance bound.
 * The anatomical palm joint may correctly remain centimetres from the axis. */
export function twoHandGripContactWorld(model:StudioHumanModel,hand:HandSide):THREE.Vector3{
  const palm=world(jointBone(model,"palm_"+hand,hand));
  const index=world(jointBone(model,"finger_index_0",hand));
  const little=world(jointBone(model,"finger_little_0",hand));
  return palm.add(index.add(little).multiplyScalar(.5).sub(palm).multiplyScalar(.53));
}
function palmFrame(model:StudioHumanModel,hand:HandSide):
  {palm:THREE.Vector3;axis:THREE.Vector3;width:number;forward:THREE.Vector3;
    normal:THREE.Vector3}{
  const wrist=world(jointBone(model,"wrist_"+hand,hand));
  const palm=world(jointBone(model,"palm_"+hand,hand));
  const middle=world(jointBone(model,"finger_middle_0",hand));
  const index=world(jointBone(model,"finger_index_0",hand));
  const little=world(jointBone(model,"finger_little_0",hand));
  const forward=middle.sub(wrist).normalize();
  const across=index.clone().sub(little);
  const axis=across.clone().addScaledVector(forward,-across.dot(forward));
  if(axis.lengthSq()<1e-9)throw new Error("Degenerate source knuckle axis");
  axis.normalize();
  const normal=forward.clone().negate().cross(axis).normalize();
  return {palm:twoHandGripContactWorld(model,hand),axis,width:across.length(),forward,normal};
}
function poseMap(base:readonly JointTarget[]):Map<string,JointTarget>{
  return new Map(base.map(c=>[key(c.jointId,c.motion),c]));
}
function freedomSet(graph:AnatomicalGraphV1,fk:AnatomicalFK,hand:HandSide):AxisDOF[]{
  const result:AxisDOF[]=[];
  for(const [name,motions] of MOTIONS){
    const j=scopedJoint(graph,name+"_"+hand,hand);
    for(const motion of motions){
      const f=fk.frames.get(j.id)?.freedoms.get(motion);
      if(!f)throw new Error("Missing calibrated "+j.role+" "+motion);
      result.push({jointId:j.id,motion,min:f.min,max:f.max,key:key(j.id,motion)});
    }
  }
  return result;
}
/** Explicit, source-calibrated ready stances. These are rotation
 * channels in the existing MakeHuman rest-relative FK, not an independent rig.
 * Both elbows remain below shoulder level and the hands in front of the torso.
 * The sword starts with the lead elbow forward and its supporting arm folded
 * inward; the staff starts as a comfortable inclined two-hand guard. */
const STANCES:Readonly<Record<TwoHandWeapon,{
  readonly shoulderAbduction:number;
  readonly shoulderFlexion:number;
  readonly shoulderRoll:number;
  readonly elbowFlexion:number;
  readonly forearmRoll:number;
  readonly wristFlexion:number;
}>>=Object.freeze({
  longsword:{shoulderAbduction:.60,shoulderFlexion:.20,
    shoulderRoll:1.08,elbowFlexion:1.10,forearmRoll:0,wristFlexion:-.08},
  staff:{shoulderAbduction:.16,shoulderFlexion:.34,
    shoulderRoll:1.07,elbowFlexion:.98,forearmRoll:0,wristFlexion:0},
});
/** Alternative initial anatomical stances are evaluated ONLY if the approved
 * nominal sword/staff guard is unreachable on the current morphology.
 * These are bounded source-FK seed differences, not visual root scaling. */
const REACH_SEEDS=Object.freeze([
  {abduction:0,flexion:0,rotation:0,elbow:0},
  {abduction:-.45,flexion:.20,rotation:-.25,elbow:.40},
  {abduction:-.65,flexion:.12,rotation:.30,elbow:.45},
  {abduction:-.30,flexion:-.20,rotation:-.45,elbow:.12},
] as const);
function stageReadyPose(graph:AnatomicalGraphV1,fk:AnatomicalFK,
  state:Map<string,JointTarget>,kind:TwoHandWeapon,primary:HandSide,
  seed=0):void{
  // Morphology-only close-grip fallback borrows the already source-validated
  // low staff upper-arm start. Sword remains one diagonal sword with the
  // approved finger curl; only its arm pose seed is different on failure.
  const pose=STANCES[kind==="longsword"&&seed>=REACH_SEEDS.length?"staff":kind];
  const variation=REACH_SEEDS[seed%REACH_SEEDS.length]!;

  const add=(hand:HandSide,role:string,motion:AnatomicalMotion,value:number)=>{
    const joint=scopedJoint(graph,role+"_"+hand,hand);
    const freedom=fk.frames.get(joint.id)?.freedoms.get(motion);
    if(!freedom)throw new Error("Missing authored grip freedom");
    state.set(key(joint.id,motion),{jointId:joint.id,motion,
      radians:THREE.MathUtils.clamp(value,freedom.min,freedom.max)});
  };
  for(const hand of ["left","right"] as const){
    const mirror=hand==="right"?1:-1;
    // Deliberately asymmetric, no mirrored overhead X-shaped arms.
    const isLead=hand===primary;
    add(hand,"clavicle","abduction",0);
    add(hand,"clavicle","flexion",0);
    add(hand,"shoulder","abduction",pose.shoulderAbduction+variation.abduction);
    add(hand,"shoulder","flexion",pose.shoulderFlexion+variation.flexion+
      (kind==="longsword"?(isLead?.20:-.15):0));
    add(hand,"shoulder","rotation",mirror*(pose.shoulderRoll+variation.rotation));
    add(hand,"elbow","flexion",pose.elbowFlexion+variation.elbow+
      (kind==="longsword"?(isLead?.05:.15):0));
    add(hand,"elbow","rotation",mirror*pose.forearmRoll);
    add(hand,"wrist","flexion",pose.wristFlexion);
    add(hand,"wrist","abduction",0);
  }
}
function anatomicalGuard(model:StudioHumanModel,kind:TwoHandWeapon,
  primary:HandSide):{ok:boolean;headClearance:number;elbowMax:number;
    headY:number;maximumPalmY:number;forearmClearance:number;scale:number}{
  const secondary:HandSide=primary==="left"?"right":"left";
  const head=world(jointBone(model,"head",primary));
  const chest=world(jointBone(model,"chest",primary));
  // Collision distances track the source's physical stature. The old
  // adult-only 19cm head and 4.5cm forearm clearance falsely rejected
  // infant rigs although the same proportions are valid at smaller scale.
  const root=model.human.spike.character.root;
  const ankle=world(jointBone(model,"ankle_left","left"));
  const headLocal=root.worldToLocal(head.clone());
  const ankleLocal=root.worldToLocal(ankle.clone());
  const scale=THREE.MathUtils.clamp((headLocal.y-ankleLocal.y+.13)/1.75,.4,1.2);
  let elbowMax=-Infinity,headClearance=Infinity;
  const forearms:THREE.Line3[]=[];
  const scratch=new THREE.Vector3();
  for(const hand of [primary,secondary]){
    const shoulder=world(jointBone(model,"shoulder_"+hand,hand));
    const elbow=world(jointBone(model,"elbow_"+hand,hand));
    const wrist=world(jointBone(model,"wrist_"+hand,hand));
    const palm=world(jointBone(model,"palm_"+hand,hand));
    elbowMax=Math.max(elbowMax,elbow.y);
    const upper=new THREE.Line3(shoulder,elbow);
    const lower=new THREE.Line3(elbow,wrist);
    forearms.push(lower);
    for(const segment of [upper,lower]){
      segment.closestPointToPoint(head,true,scratch);
      headClearance=Math.min(headClearance,scratch.distanceTo(head));
    }
    headClearance=Math.min(headClearance,palm.distanceTo(head));
  }
  // All points along the two forearm centerlines are checked against one
  // another; this prevents two wrists reaching the handle through each
  // other's forearm. Sampling is a conservative pose guard, not a mesh-level
  // skin collision certification.
  let forearmClearance=Infinity;
  const alongA=new THREE.Vector3(),alongB=new THREE.Vector3();
  for(let i=0;i<=16;i++){
    forearms[0]!.at(i/16,alongA);
    forearms[1]!.closestPointToPoint(alongA,true,scratch);
    forearmClearance=Math.min(forearmClearance,alongA.distanceTo(scratch));
    forearms[1]!.at(i/16,alongB);
    forearms[0]!.closestPointToPoint(alongB,true,scratch);
    forearmClearance=Math.min(forearmClearance,alongB.distanceTo(scratch));
  }
  const palms=[world(jointBone(model,"palm_"+primary,primary)),
    world(jointBone(model,"palm_"+secondary,secondary))];
  const maxRise=Math.max(...palms.map(p=>p.y));
  const minForward=Math.min(...palms.map(p=>p.z-chest.z));
  return {ok:headClearance>.19*scale&&forearmClearance>.045*scale&&
    elbowMax<head.y-.12*scale&&maxRise<head.y-.18*scale&&
    minForward>-.06*scale,
    headClearance,elbowMax,headY:head.y,maximumPalmY:maxRise,
    forearmClearance,scale};
}
/** Weapon authority: one rigid frame and two grip transforms, defined before
 * any arm optimization. The source chest determines placement, root orientation
 * determines the facing, never the already posed palm-to-palm vector. */
function authoredWeaponWorld(model:StudioHumanModel,kind:TwoHandWeapon,
  primary:HandSide,dim:TwoHandDimensions):THREE.Matrix4 {
  const root=model.human.spike.character.root;
  root.updateWorldMatrix(true,true);
  const facing=root.getWorldQuaternion(new THREE.Quaternion());
  const chest=world(jointBone(model,"chest",primary));
  const scale=dim.scale;
  const offset=kind==="longsword"?
    new THREE.Vector3(0,-.18*scale,.28*scale):
    new THREE.Vector3(0,-.17*scale,.31*scale);
  const y=(kind==="longsword"?
    new THREE.Vector3(primary==="right"?.76:-.76,.51,.42):
    new THREE.Vector3(primary==="right"?.65:-.65,.70,.29))
    .normalize().applyQuaternion(facing);
  const referenceX=(kind==="longsword"?
    new THREE.Vector3(1,0,0):new THREE.Vector3(0,0,1))
    .applyQuaternion(facing);
  const x=referenceX.addScaledVector(y,-referenceX.dot(y)).normalize();
  const z=x.clone().cross(y).normalize();
  x.crossVectors(y,z).normalize();
  const rotation=new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(x,y,z));
  return new THREE.Matrix4().compose(
    chest.add(offset.applyQuaternion(facing)),rotation,new THREE.Vector3(1,1,1));
}
function gripWorld(weapon:THREE.Matrix4,y:number):THREE.Vector3 {
  return new THREE.Vector3(0,y,0).applyMatrix4(weapon);
}
function weaponAxis(weapon:THREE.Matrix4):THREE.Vector3 {
  return new THREE.Vector3(0,1,0).transformDirection(weapon);
}
/** Source-surface calibrated grip offset attached to the real palm bone.
 * Solving target contact against this local landmark keeps shaft placement
 * anatomically stable while the shoulder/elbow/wrist FK channels move. */
type GripAnchor={readonly local:THREE.Vector3};
type GripAnchors=ReadonlyMap<HandSide,GripAnchor>;
function contactWorld(model:StudioHumanModel,hand:HandSide,anchors?:GripAnchors):
  THREE.Vector3{
  const offset=anchors?.get(hand);
  if(offset)return jointBone(model,"palm_"+hand,hand).localToWorld(offset.local.clone());
  return twoHandGripContactWorld(model,hand);
}
/** Reuse C5.1's actual source-skin five-finger cylinder fit, independently for
 * the two hands. A rigid staff then aligns to THESE hand-local surface
 * channels rather than penetrating the palm-joint proxy. */
function calibrateStaffAnchors(model:StudioHumanModel,dim:TwoHandDimensions):
  GripAnchors{
  const anchors=new Map<HandSide,GripAnchor>();
  model.human.spike.character.root.updateWorldMatrix(true,true);
  for(const hand of ["left","right"] as const){
    const frame=palmFrame(model,hand);
    const bone=jointBone(model,"palm_"+hand,hand);
    const palm=world(bone);
    const x=frame.forward.clone().negate();
    const y=frame.axis.clone();
    const z=x.clone().cross(y).normalize();
    const initial=palm.clone().addScaledVector(frame.forward,.012*dim.scale)
      .addScaledVector(z,.006*dim.scale);
    const width=frame.width;
    const length=THREE.MathUtils.clamp(width*1.45,.035,.18);
    const fitted=fitHandleCenter(model,hand,initial,x,y,z,dim.radius,length);
    anchors.set(hand,{local:bone.worldToLocal(fitted)});
  }
  return anchors;
}
/** Resolve the exact source-surface contact point used by the selected
 * two-hand solver result, including after deterministic root movement. */
export function twoHandSolvedContactWorld(model:StudioHumanModel,
  hand:HandSide,solved:TwoHandIKResult):THREE.Vector3{
  const local=solved.gripAnchors?.[hand];
  if(!local)return twoHandGripContactWorld(model,hand);
  return jointBone(model,"palm_"+hand,hand).localToWorld(
    new THREE.Vector3(local[0],local[1],local[2]));
}
/** C5.1-style anatomy calibration for two-hand placement.
 * Dimensions and the shaft remain rigid. Unlike the fixed chest-offset
 * reference, placement is obtained from the actual POSED source hands,
 * making identical stance commands work across regenerated anatomies.
 * The offhand target still comes from ONE shaft, never a second weapon. */
export function adaptiveTwoHandWeaponWorld(model:StudioHumanModel,
  kind:TwoHandWeapon,primary:HandSide,dim:TwoHandDimensions,
  reference:THREE.Matrix4,anchors?:GripAnchors,
  staffAxisMode:"span"|"knuckle"="span"):THREE.Matrix4{
  const secondary:HandSide=primary==="right"?"left":"right";
  const lead=palmFrame(model,primary),offhand=palmFrame(model,secondary);
  lead.palm.copy(contactWorld(model,primary,anchors));
  offhand.palm.copy(contactWorld(model,secondary,anchors));
  const nominal=weaponAxis(reference);
  let axis:THREE.Vector3;
  if(kind==="longsword"){
    // Preserve the approved diagonal sword presentation while allowing its
    // grip direction to follow the lead hand as in C5.1.
    axis=nominal.multiplyScalar(.38).addScaledVector(lead.axis,.62).normalize();
  }else{
    // Both hands MUST lie along one collinear staff. Derive its world axis
    // from the actual knuckle-contact span, not a preselected chest slope.
    const handSpan=lead.palm.clone().sub(offhand.palm);
    if(handSpan.lengthSq()<1e-8)handSpan.copy(nominal);
    handSpan.normalize();
    const knuckles=lead.axis.clone().add(offhand.axis);
    if(staffAxisMode==="knuckle"&&knuckles.lengthSq()>1e-8){
      knuckles.normalize();
      if(knuckles.dot(handSpan)<0)knuckles.negate();
      // Same-direction thumbs require aligned knuckle axes, not opposition.
      // Preserve the inclined staff guard while resolving shared contact.
      axis=knuckles.multiplyScalar(.12)
        .addScaledVector(handSpan,.13)
        .addScaledVector(nominal,.75).normalize();
    }else{
      axis=handSpan.multiplyScalar(.12)
        .addScaledVector(nominal,.88).normalize();
    }
  }
  if(axis.lengthSq()<.9)throw new Error("Degenerate two-hand shaft axis");
  const leadCenter=lead.palm.clone().addScaledVector(axis,-dim.primaryGripY);
  const offhandCenter=offhand.palm.clone().addScaledVector(axis,-dim.secondaryGripY);
  const leadWeight=kind==="longsword"?1:.5;
  const center=leadCenter.multiplyScalar(leadWeight)
    .addScaledVector(offhandCenter,1-leadWeight);
  let x=new THREE.Vector3(1,0,0).transformDirection(reference);
  x.addScaledVector(axis,-x.dot(axis));
  if(x.lengthSq()<1e-6){
    x=new THREE.Vector3(0,0,1).transformDirection(reference);
    x.addScaledVector(axis,-x.dot(axis));
  }
  x.normalize();
  const z=x.clone().cross(axis).normalize();
  x.crossVectors(axis,z).normalize();
  const rotation=new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(x,axis,z));
  return new THREE.Matrix4().compose(center,rotation,new THREE.Vector3(1,1,1));
}
/** Project one RIGID weapon's center into the shared physical arm-reach
 * region, keeping its dimensions and axis unchanged. A primary-hand-only
 * candidate may be unreachable by the offhand on tall/wide morphologies.
 * This is a position-only fallback; the original approved sword matrix is
 * always tested first and is never changed when successful. */
function projectWeaponIntoArmReach(model:StudioHumanModel,
  primary:HandSide,dim:TwoHandDimensions,
  weapon:THREE.Matrix4):THREE.Matrix4{
  const secondary:HandSide=primary==="right"?"left":"right";
  const axis=weaponAxis(weapon);
  const candidate=weapon.clone();
  const center=new THREE.Vector3().setFromMatrixPosition(candidate);
  const arms=[{hand:primary,y:dim.primaryGripY},
    {hand:secondary,y:dim.secondaryGripY}] as const;
  const limits=arms.map(({hand,y})=>{
    const shoulder=world(jointBone(model,"shoulder_"+hand,hand));
    const elbow=world(jointBone(model,"elbow_"+hand,hand));
    const wrist=world(jointBone(model,"wrist_"+hand,hand));
    const palm=twoHandGripContactWorld(model,hand);
    const reach=(shoulder.distanceTo(elbow)+elbow.distanceTo(wrist)+
      wrist.distanceTo(palm))*.95;
    return {shoulder,y,reach};
  });
  // Alternating projections onto convex shoulder-reach spheres. Unlike
  // stretching the hilt, a rigid translation cannot change grip separation.
  for(let iteration=0;iteration<10;iteration++){
    let changed=false;
    for(const {shoulder,y,reach} of limits){
      const goal=center.clone().addScaledVector(axis,y);
      const offset=shoulder.clone().sub(goal);
      const distance=offset.length();
      if(distance>reach&&distance>1e-9){
        center.addScaledVector(offset,(distance-reach)/distance);
        changed=true;
      }
    }
    if(!changed)break;
  }
  candidate.setPosition(center);
  return candidate;
}
/** Normalized source upper-arm directions measured from independently
 * skinned Blender 4.5.16 candidate poses. These guide elbow pole placement
 * without imposing a copied bone rotation or altering arm lengths.
 * They are reference candidates, NOT visually accepted grip definitions. */
export const C52_ELBOW_REFERENCE_V1:Readonly<Record<TwoHandWeapon,
  {readonly lead:readonly [number,number,number];
   readonly support:readonly [number,number,number]}>>=Object.freeze({
  longsword:Object.freeze({lead:[.43409,-.58034,.68904] as const,
    support:[.51459,-.71707,.47011] as const}),
  staff:Object.freeze({lead:[.49152,-.82289,.28508] as const,
    support:[.80522,-.35852,.47232] as const}),
});
function referenceElbow(model:StudioHumanModel,kind:TwoHandWeapon,
  lead:HandSide,hand:HandSide):THREE.Vector3 {
  const isLead=hand===lead;
  const vector=C52_ELBOW_REFERENCE_V1[kind][isLead?"lead":"support"];
  const shoulder=world(jointBone(model,"shoulder_"+hand,hand));
  const elbow=world(jointBone(model,"elbow_"+hand,hand));
  const length=shoulder.distanceTo(elbow);
  const sourceDirection=new THREE.Vector3(
    (hand==="right"?1:-1)*vector[0],vector[1],vector[2]).normalize();
  sourceDirection.applyQuaternion(
    model.human.spike.character.root.getWorldQuaternion(new THREE.Quaternion()));
  return shoulder.addScaledVector(sourceDirection,length);
}
/** Bounded FK coordinate-descent in source-calibrated anatomical channels.
 * Neither hand determines the other hand's objective: both target two
 * independent immutable landmarks on one predetermined weapon frame.
 * Arm and wrist joints are optimized, not the weapon, pelvis or root. */
function fitHand(model:StudioHumanModel,fk:AnatomicalFK,
  state:Map<string,JointTarget>,kind:TwoHandWeapon,lead:HandSide,
  hand:HandSide,target:THREE.Vector3,shaft:THREE.Vector3,anchors?:GripAnchors,
  maxTravelRadians=1.10):
  {error:number;dot:number;iterations:number}{
  const dofs=freedomSet(model.human.spike.graph,fk,hand);
  const starting=new Map(dofs.map(d=>[d.key,state.get(d.key)?.radians??0]));
  // Both hands share the same index-to-little axis: no mixed thumb grip.
  const direction=1;
  const desiredAxis=shaft.clone().multiplyScalar(direction);
  const apply=()=>fk.apply([...state.values()]);
  const cost=()=>{
    const frame=palmFrame(model,hand);
    const positionError=contactWorld(model,hand,anchors).distanceTo(target);
    const elbow=world(jointBone(model,"elbow_"+hand,hand));
    const poleReference=referenceElbow(model,kind,lead,hand);
    const elbowPoleError=elbow.distanceTo(poleReference);
    const dot=THREE.MathUtils.clamp(frame.axis.dot(desiredAxis),-1,1);
    const forwardOverlap=Math.abs(frame.forward.dot(shaft));
    const guard=anatomicalGuard(model,kind,lead);
    let travel=0;
    for(const d of dofs){
      const delta=(state.get(d.key)?.radians??0)-starting.get(d.key)!;
      travel+=delta*delta;
    }
    const headGap=Math.max(0,.195*guard.scale-guard.headClearance);
    const elbowGap=Math.max(0,guard.elbowMax-guard.headY+.135*guard.scale);
    const palmGap=Math.max(0,guard.maximumPalmY-guard.headY+.20*guard.scale);
    const forearmGap=Math.max(0,.05*guard.scale-guard.forearmClearance);
    return {value:positionError*positionError*(kind==="staff"?180:95)+
      (kind==="staff"?1.2:.20)*(1-dot)*(1-dot)+
      .006*Math.max(0,forwardOverlap-.36)**2+
      .00015*travel+(kind==="longsword"?.06:0)*elbowPoleError*elbowPoleError+
      35*(headGap*headGap+elbowGap*elbowGap+
        palmGap*palmGap+forearmGap*forearmGap),
      error:positionError,dot};
  };
  apply();let best=cost(),iterations=0;
  for(const step of [.50,.26,.13,.065,.03,.01]){
    for(let sweep=0;sweep<2;sweep++){
      iterations++;let improved=false;
      for(const dof of dofs){
        const current=state.get(dof.key)?.radians??0;
        let selected=current;
        for(const sign of [-1,1]){
          const candidate=THREE.MathUtils.clamp(current+step*sign,dof.min,dof.max);
          // No single axis may jump wildly away from its initial weapon stance.
          if(Math.abs(candidate-starting.get(dof.key)!)>maxTravelRadians)continue;
          state.set(dof.key,{jointId:dof.jointId,motion:dof.motion,radians:candidate});
          apply();
          const next=cost();
          if(next.value<best.value-1e-12){
            best=next;selected=candidate;improved=true;
          }
        }
        state.set(dof.key,{jointId:dof.jointId,motion:dof.motion,radians:selected});
        apply();
      }
      if(!improved)break;
    }
  }
  return {...cost(),iterations};
}
/** Deterministic damped-least-squares refinement for morphology-dependent
 * configurations where greedy per-axis descent cannot reach the SAME shared
 * rigid weapon. Only legal source AnatomicalFK freedoms are applied.
 * 9 features (contact/knuckle/elbow), at most 18 steps; no root/shaft scaling. */
function solveDampedNormal(matrix:number[][],rhs:number[]):number[]|undefined{
  const n=rhs.length;
  const rows=matrix.map((line,i)=>[...line,rhs[i]!]);
  for(let col=0;col<n;col++){
    let pivot=col;
    for(let row=col+1;row<n;row++)
      if(Math.abs(rows[row]![col]!)>Math.abs(rows[pivot]![col]!))pivot=row;
    if(Math.abs(rows[pivot]![col]!)<1e-10)return undefined;
    [rows[col],rows[pivot]]=[rows[pivot]!,rows[col]!];
    const divide=rows[col]![col]!;
    for(let j=col;j<=n;j++)rows[col]![j]!/=divide;
    for(let row=0;row<n;row++){
      if(row===col)continue;
      const factor=rows[row]![col]!;
      for(let j=col;j<=n;j++)rows[row]![j]!-=factor*rows[col]![j]!;
    }
  }
  return rows.map(row=>row[n]!);
}
function fitHandDamped(model:StudioHumanModel,fk:AnatomicalFK,
  state:Map<string,JointTarget>,kind:TwoHandWeapon,lead:HandSide,
  hand:HandSide,target:THREE.Vector3,shaft:THREE.Vector3,
  anchors?:GripAnchors):number{
  const dofs=freedomSet(model.human.spike.graph,fk,hand);
  const direction=1;
  const desiredAxis=shaft.clone().multiplyScalar(direction);
  const elbowGoal=referenceElbow(model,kind,lead,hand);
  const desired=[target.x,target.y,target.z,
    desiredAxis.x*.15,desiredAxis.y*.15,desiredAxis.z*.15,
    elbowGoal.x*.035,elbowGoal.y*.035,elbowGoal.z*.035];
  const apply=()=>fk.apply([...state.values()]);
  const sample=()=>{
    const frame=palmFrame(model,hand);
    const point=contactWorld(model,hand,anchors);
    const elbow=world(jointBone(model,"elbow_"+hand,hand));
    return [point.x,point.y,point.z,
      frame.axis.x*.15*direction,frame.axis.y*.15*direction,
      frame.axis.z*.15*direction,
      elbow.x*.035,elbow.y*.035,elbow.z*.035];
  };
  // Both hands use the same shared shaft orientation.
  desired[3]=shaft.x*.15;
  desired[4]=shaft.y*.15;
  desired[5]=shaft.z*.15;
  const cost=(values:number[])=>{
    let sum=0;
    for(let i=0;i<9;i++){
      const delta=desired[i]!-values[i]!;
      sum+=delta*delta;
    }
    const safety=anatomicalGuard(model,kind,lead);
    if(!safety.ok){
      const head=Math.max(0,.195*safety.scale-safety.headClearance);
      const arm=Math.max(0,safety.elbowMax-safety.headY+.135*safety.scale);
      const palm=Math.max(0,safety.maximumPalmY-safety.headY+.20*safety.scale);
      const forearm=Math.max(0,.05*safety.scale-safety.forearmClearance);
      sum+=20*(head*head+arm*arm+palm*palm+forearm*forearm);
    }
    return sum;
  };
  apply();
  let best=sample(),bestCost=cost(best),iterations=0;
  for(let iteration=0;iteration<18;iteration++){
    iterations++;
    const base=dofs.map(d=>state.get(d.key)?.radians??0);
    const residual=desired.map((d,i)=>d-best[i]!);
    const jacobian:number[][]=Array.from({length:9},()=>[]);
    for(let j=0;j<dofs.length;j++){
      const dof=dofs[j]!;
      const h=.008;
      const adjusted=THREE.MathUtils.clamp(base[j]!+h,dof.min,dof.max);
      const actualH=adjusted-base[j]!;
      if(actualH<1e-7){
        for(let i=0;i<9;i++)jacobian[i]!.push(0);
        continue;
      }
      state.set(dof.key,{jointId:dof.jointId,motion:dof.motion,radians:adjusted});
      apply();
      const next=sample();
      for(let i=0;i<9;i++)jacobian[i]!.push((next[i]!-best[i]!)/actualH);
      state.set(dof.key,{jointId:dof.jointId,motion:dof.motion,radians:base[j]!});
    }
    apply();
    const n=dofs.length;
    const normal=Array.from({length:n},()=>Array<number>(n).fill(0));
    const rhs=Array<number>(n).fill(0);
    for(let j=0;j<n;j++){
      for(let k=0;k<n;k++){
        let sum=0;
        for(let i=0;i<9;i++)sum+=jacobian[i]![j]!*jacobian[i]![k]!;
        normal[j]![k]=sum+(j===k ? .003 : 0);
      }
      for(let i=0;i<9;i++)rhs[j]!+=jacobian[i]![j]!*residual[i]!;
    }
    const step=solveDampedNormal(normal,rhs);
    if(!step)break;
    let improved=false;
    for(const gain of [1,.5,.25,.125]){
      for(let j=0;j<n;j++){
        const dof=dofs[j]!;
        const change=THREE.MathUtils.clamp(step[j]!*gain,-.30,.30);
        const angle=THREE.MathUtils.clamp(base[j]!+change,dof.min,dof.max);
        state.set(dof.key,{jointId:dof.jointId,motion:dof.motion,radians:angle});
      }
      apply();
      const candidate=sample(),value=cost(candidate);
      if(value<bestCost-1e-10){
        best=candidate;bestCost=value;improved=true;
        break;
      }
    }
    if(!improved){
      for(let j=0;j<n;j++){
        const dof=dofs[j]!;
        state.set(dof.key,{jointId:dof.jointId,motion:dof.motion,radians:base[j]!});
      }
      apply();
      break;
    }
    const frame=palmFrame(model,hand);
    if(contactWorld(model,hand,anchors).distanceTo(target)<.005&&
      frame.axis.dot(desiredAxis)>.89)break;
  }
  apply();
  return iterations;
}

/** Solve the TWO hands against one movable contact line, never against two
 * fixed world targets. The shaft is fitted to the posed lead-hand knuckles
 * (C5.1 convention); its world translation is eliminated analytically by
 * taking the difference of the two palm-local, source-skinned contacts.
 *
 * This is only a fallback. The owner's approved sword/staff candidate is
 * returned unchanged when it reaches both grips.
 */
function fitRelativeTwoHandContacts(model:StudioHumanModel,fk:AnatomicalFK,
  base:readonly JointTarget[],kind:TwoHandWeapon,lead:HandSide,
  dimensions:TwoHandDimensions,seed:number,
  diagnostics:{seed:number;initialSpan:number;primaryError:number;
    secondaryError:number;primaryAxis:number;secondaryAxis:number;reason:string}[]):
  TwoHandIKResult|undefined {
  const off:HandSide=lead==="left"?"right":"left";
  const graph=model.human.spike.graph;
  const state=poseMap(base);
  stageReadyPose(graph,fk,state,kind,lead,seed);
  fk.apply([...state.values()]);
  const anchors=calibrateStaffAnchors(model,dimensions);
  const initialSpan=contactWorld(model,lead,anchors)
    .distanceTo(contactWorld(model,off,anchors));
  const authored=authoredWeaponWorld(model,kind,lead,dimensions);
  const referenceAxis=weaponAxis(authored);
  const dofs=[...freedomSet(graph,fk,lead),...freedomSet(graph,fk,off)];
  const start=dofs.map(d=>state.get(d.key)?.radians??0);
  const apply=()=>fk.apply([...state.values()]);
  const spacings=kind==="longsword"?
    [dimensions.primaryGripY-dimensions.secondaryGripY,
      dimensions.handleLength*.57,dimensions.handleLength*.48,
      dimensions.handleLength*.72,dimensions.handleLength*.80,
      dimensions.handleLength*.84]:
    [dimensions.primaryGripY-dimensions.secondaryGripY,
      dimensions.shaftLength*.23,dimensions.shaftLength*.30];
  const maxSpan=kind==="longsword"?
    dimensions.handleLength-3.2*dimensions.radius:
    dimensions.shaftLength*.70;
  const minSpan=kind==="longsword"?
    dimensions.handleLength*.42:dimensions.shaftLength*.18;
  for(const separation of spacings){
    if(separation>maxSpan||separation<minSpan)continue;
    for(let i=0;i<dofs.length;i++){
      const d=dofs[i]!;
      state.set(d.key,{jointId:d.jointId,motion:d.motion,radians:start[i]!});
    }
    apply();
    const shaft=()=>{
      const first=palmFrame(model,lead),second=palmFrame(model,off);
      if(kind==="longsword"){
        const axis=first.axis.clone().multiplyScalar(.82)
          .addScaledVector(referenceAxis,.18);
        return axis.normalize();
      }
      const span=contactWorld(model,lead,anchors)
        .sub(contactWorld(model,off,anchors));
      const axis=span.lengthSq()>1e-7?span.normalize():referenceAxis.clone();
      return axis.multiplyScalar(.12).addScaledVector(referenceAxis,.88).normalize();
    };
    const sample=()=>{
      const axis=shaft();
      const first=contactWorld(model,lead,anchors),second=contactWorld(model,off,anchors);
      const relative=first.sub(second).addScaledVector(axis,-separation);
      const supportAxis=palmFrame(model,off).axis;
      const guard=anatomicalGuard(model,kind,lead);
      // Derivative-aware soft barriers prevent convergence by twisting the
      // wrist through the face or crossing the forearm centerlines.
      return [relative.x,relative.y,relative.z,
        (supportAxis.x-axis.x)*.025,
        (supportAxis.y-axis.y)*.025,
        (supportAxis.z-axis.z)*.025,
        Math.max(0,.195*guard.scale-guard.headClearance)*4,
        Math.max(0,guard.elbowMax-guard.headY+.135*guard.scale)*4,
        Math.max(0,guard.maximumPalmY-guard.headY+.20*guard.scale)*4,
        Math.max(0,.05*guard.scale-guard.forearmClearance)*4];
    };
    const cost=(values:readonly number[])=>{
      let sum=values.reduce((s,v)=>s+v*v,0);
      for(let i=0;i<dofs.length;i++){
        const delta=(state.get(dofs[i]!.key)?.radians??0)-start[i]!;
        sum+=.0000005*delta*delta;
      }
      return sum;
    };
    let best=sample(),bestCost=cost(best);
    for(let iteration=0;iteration<65;iteration++){
      const axis=shaft();
      const first=contactWorld(model,lead,anchors);
      const second=contactWorld(model,off,anchors);
      const difference=first.sub(second).addScaledVector(axis,-separation);
      const guard=anatomicalGuard(model,kind,lead);
      if(difference.length()<.008&&guard.ok)break;
      const baseValues=dofs.map(d=>state.get(d.key)?.radians??0);
      const jacobian:number[][]=Array.from({length:best.length},()=>[]);
      for(let j=0;j<dofs.length;j++){
        const d=dofs[j]!;
        const adjusted=THREE.MathUtils.clamp(baseValues[j]!+.006,d.min,d.max);
        const h=adjusted-baseValues[j]!;
        if(h<1e-8){
          for(const row of jacobian)row.push(0);
          continue;
        }
        state.set(d.key,{jointId:d.jointId,motion:d.motion,radians:adjusted});
        apply();
        const next=sample();
        for(let k=0;k<best.length;k++)
          jacobian[k]!.push((next[k]!-best[k]!)/h);
        state.set(d.key,{jointId:d.jointId,motion:d.motion,radians:baseValues[j]!});
      }
      apply();
      const n=dofs.length;
      const matrix=Array.from({length:n},()=>Array<number>(n).fill(0));
      const rhs=Array<number>(n).fill(0);
      for(let j=0;j<n;j++){
        for(let k=0;k<n;k++){
          let value=0;
          for(let row=0;row<best.length;row++)
            value+=jacobian[row]![j]!*jacobian[row]![k]!;
          matrix[j]![k]=value+(j===k?.00025:0);
        }
        for(let row=0;row<best.length;row++)
          rhs[j]!-=jacobian[row]![j]!*best[row]!;
      }
      const changes=solveDampedNormal(matrix,rhs);
      if(!changes)break;
      let improved=false;
      for(const gain of [1,.5,.25,.125]){
        for(let j=0;j<n;j++){
          const d=dofs[j]!;
          const value=THREE.MathUtils.clamp(baseValues[j]!+
            THREE.MathUtils.clamp(changes[j]!*gain,-.45,.45),d.min,d.max);
          state.set(d.key,{jointId:d.jointId,motion:d.motion,radians:value});
        }
        apply();
        const next=sample(),nextCost=cost(next);
        if(nextCost<bestCost-1e-11){
          best=next;bestCost=nextCost;improved=true;break;
        }
      }
      if(!improved){
        for(let j=0;j<n;j++){
          const d=dofs[j]!;
          state.set(d.key,{jointId:d.jointId,motion:d.motion,radians:baseValues[j]!});
        }
        apply();
        break;
      }
    }
    apply();
    const axis=shaft();
    const leadContact=contactWorld(model,lead,anchors);
    const offContact=contactWorld(model,off,anchors);
    const relative=leadContact.clone().sub(offContact).addScaledVector(axis,-separation);
    const center=leadContact.clone().add(offContact).multiplyScalar(.5);
    let x=new THREE.Vector3(1,0,0).transformDirection(authored);
    x.addScaledVector(axis,-x.dot(axis));
    if(x.lengthSq()<1e-8)
      x=new THREE.Vector3(0,0,1).transformDirection(authored)
        .addScaledVector(axis,-new THREE.Vector3(0,0,1).transformDirection(authored).dot(axis));
    x.normalize();
    const z=x.clone().cross(axis).normalize();
    x.crossVectors(axis,z).normalize();
    const matrix=new THREE.Matrix4().compose(
      center,new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(x,axis,z)),new THREE.Vector3(1,1,1));
    const dim:TwoHandDimensions=Object.freeze({...dimensions,
      primaryGripY:separation*.5,secondaryGripY:-separation*.5});
    const firstGoal=gripWorld(matrix,dim.primaryGripY);
    const secondGoal=gripWorld(matrix,dim.secondaryGripY);
    const errorA=leadContact.distanceTo(firstGoal);
    const errorB=offContact.distanceTo(secondGoal);
    const dotA=palmFrame(model,lead).axis.dot(axis);
    const dotB=palmFrame(model,off).axis.dot(axis);
    const guard=anatomicalGuard(model,kind,lead);
    const minimum=kind==="staff"?.85:.42;
    diagnostics.push({seed,initialSpan,primaryError:errorA,secondaryError:errorB,
      primaryAxis:dotA,secondaryAxis:dotB,
      reason:!guard.ok?"relative-unsafe":
        dotA<=minimum||dotB<=minimum?"relative-orientation":"relative-span"});
    if(guard.ok&&errorA<=.023&&errorB<=.023&&dotA>minimum&&dotB>minimum){
      return Object.freeze({
        reachable:true,commands:Object.freeze([...state.values()]),
        primaryErrorMeters:errorA,secondaryErrorMeters:errorB,
        primaryDeltaMeters:Object.freeze(leadContact.sub(firstGoal).toArray()),
        secondaryDeltaMeters:Object.freeze(offContact.sub(secondGoal).toArray()),
        primaryAxisDot:dotA,secondaryAxisDot:dotB,
        iterations:0,refinementIterations:65,reason:"ok" as const,
        headClearanceMeters:guard.headClearance,elbowMaxHeightMeters:guard.elbowMax,
        headHeightMeters:guard.headY,maximumPalmHeightMeters:guard.maximumPalmY,
        separationMeters:separation,initialHandSpanMeters:initialSpan,
        dimensions:dim,weaponWorld:matrix,
        gripAnchors:Object.freeze({
          left:Object.freeze(anchors.get("left")!.local.toArray() as [number,number,number]),
          right:Object.freeze(anchors.get("right")!.local.toArray() as [number,number,number]),
        }),
      });
    }
  }
  return undefined;
}

/** Morphology fallback: seek a common torso-centered grip instead of pinning
 * the weapon to a widely displaced source-FK lead hand. All two-hand contacts
 * remain rigid and dimensioned, and every emitted angle is FK-limit bounded. */
function fitTorsoCenteredSword(model:StudioHumanModel,fk:AnatomicalFK,
  fingerState:readonly JointTarget[],lead:HandSide,
  dimensions:TwoHandDimensions,
  diagnostics:{seed:number;initialSpan:number;primaryError:number;
    secondaryError:number;primaryAxis:number;secondaryAxis:number;reason:string}[]):
  TwoHandIKResult|undefined{
  const off:HandSide=lead==="left"?"right":"left";
  const root=model.human.spike.character.root;
  root.updateWorldMatrix(true,true);
  const facing=root.getWorldQuaternion(new THREE.Quaternion());
  const shoulderA=world(jointBone(model,"shoulder_"+lead,lead));
  const shoulderB=world(jointBone(model,"shoulder_"+off,off));
  const midpoint=shoulderA.add(shoulderB).multiplyScalar(.5);
  const chest=world(jointBone(model,"chest",lead));
  const origin=chest.lerp(midpoint,.35);
  const graph=model.human.spike.graph;
  for(const seed of [0,6,2]){
    const state=poseMap(fingerState);
    stageReadyPose(graph,fk,state,"longsword",lead,seed);
    const staged=[...state.values()];
    fk.apply(staged);
    const initialSpan=twoHandGripContactWorld(model,lead)
      .distanceTo(twoHandGripContactWorld(model,off));
    // These two frames sit in the physical intersection of the source arm
    // reach spheres rather than inheriting the dislocated original hands.
    for(const [rise,depth] of [[-.18,.30],[-.27,.38]] as const){
      state.clear();
      for(const c of staged)state.set(key(c.jointId,c.motion),c);
      fk.apply(staged);
      const frame=authoredWeaponWorld(model,"longsword",lead,dimensions);
      frame.setPosition(origin.clone().add(new THREE.Vector3(
        0,rise*dimensions.scale,depth*dimensions.scale).applyQuaternion(facing)));
      const shaft=weaponAxis(frame);
      const goalA=gripWorld(frame,dimensions.primaryGripY);
      const goalB=gripWorld(frame,dimensions.secondaryGripY);
      let refinementIterations=0;
      // Fitting the offhand first prevents the original lead-locked local
      // minimum that had <1 mm primary error but >290 mm secondary error.
      for(let pass=0;pass<2;pass++){
        refinementIterations+=fitHandDamped(model,fk,state,"longsword",
          lead,off,goalB,shaft);
        refinementIterations+=fitHandDamped(model,fk,state,"longsword",
          lead,lead,goalA,shaft);
      }
      fk.apply([...state.values()]);
      const a=twoHandGripContactWorld(model,lead);
      const b=twoHandGripContactWorld(model,off);
      const errorA=a.distanceTo(goalA),errorB=b.distanceTo(goalB);
      const dotA=palmFrame(model,lead).axis.dot(shaft);
      const dotB=palmFrame(model,off).axis.dot(shaft);
      const guard=anatomicalGuard(model,"longsword",lead);
      diagnostics.push({seed:100+seed,initialSpan,
        primaryError:errorA,secondaryError:errorB,
        primaryAxis:dotA,secondaryAxis:dotB,
        reason:guard.ok?"torso-contact":"torso-unsafe"});
      if(errorA<=.023&&errorB<=.023&&dotA>.42&&dotB>.42&&guard.ok)
        return Object.freeze({
          reachable:true,commands:Object.freeze([...state.values()]),
          primaryErrorMeters:errorA,secondaryErrorMeters:errorB,
          primaryDeltaMeters:Object.freeze(a.sub(goalA).toArray()),
          secondaryDeltaMeters:Object.freeze(b.sub(goalB).toArray()),
          primaryAxisDot:dotA,secondaryAxisDot:dotB,
          iterations:0,refinementIterations,reason:"ok" as const,
          headClearanceMeters:guard.headClearance,
          elbowMaxHeightMeters:guard.elbowMax,headHeightMeters:guard.headY,
          maximumPalmHeightMeters:guard.maximumPalmY,
          separationMeters:dimensions.primaryGripY-dimensions.secondaryGripY,
          initialHandSpanMeters:initialSpan,dimensions,weaponWorld:frame,
        });
    }
  }
  return undefined;
}

/** Last-chance bounded staff reach from a shared torso-relative contact line.
 * A staff has generous legal contact spacing but never two independent shafts.
 * Used only when existing same-thumb contact fits cannot reach. */
function fitTorsoCenteredStaff(model:StudioHumanModel,fk:AnatomicalFK,
  fingerState:readonly JointTarget[],lead:HandSide,
  dimensions:TwoHandDimensions,
  diagnostics:{seed:number;initialSpan:number;primaryError:number;
    secondaryError:number;primaryAxis:number;secondaryAxis:number;reason:string}[]):
  TwoHandIKResult|undefined{
  const off:HandSide=lead==="left"?"right":"left";
  const root=model.human.spike.character.root;
  root.updateWorldMatrix(true,true);
  const facing=root.getWorldQuaternion(new THREE.Quaternion());
  const shoulderA=world(jointBone(model,"shoulder_"+lead,lead));
  const shoulderB=world(jointBone(model,"shoulder_"+off,off));
  const chest=world(jointBone(model,"chest",lead));
  const center=chest.lerp(shoulderA.add(shoulderB).multiplyScalar(.5),.35);
  const state=poseMap(fingerState);
  stageReadyPose(model.human.spike.graph,fk,state,"staff",lead,3);
  const staged=[...state.values()];
  fk.apply(staged);
  const anchors=calibrateStaffAnchors(model,dimensions);
  const initialSpan=contactWorld(model,lead,anchors)
    .distanceTo(contactWorld(model,off,anchors));
  for(const [height,forward] of [[-.20,.32],[-.30,.40]] as const){
    for(const spanFactor of [.24,.32] as const){
      state.clear();
      for(const command of staged)state.set(key(command.jointId,command.motion),command);
      fk.apply(staged);
      const separation=dimensions.shaftLength*spanFactor;
      const dim:TwoHandDimensions=Object.freeze({...dimensions,
        primaryGripY:separation*.5,secondaryGripY:-separation*.5});
      const matrix=authoredWeaponWorld(model,"staff",lead,dimensions);
      matrix.setPosition(center.clone().add(new THREE.Vector3(
        0,height*dimensions.scale,forward*dimensions.scale).applyQuaternion(facing)));
      const axis=weaponAxis(matrix);
      const firstGoal=gripWorld(matrix,dim.primaryGripY);
      const secondGoal=gripWorld(matrix,dim.secondaryGripY);
      let refinementIterations=0;
      for(let pass=0;pass<2;pass++){
        refinementIterations+=fitHandDamped(model,fk,state,"staff",
          lead,off,secondGoal,axis,anchors);
        refinementIterations+=fitHandDamped(model,fk,state,"staff",
          lead,lead,firstGoal,axis,anchors);
      }
      fk.apply([...state.values()]);
      const first=contactWorld(model,lead,anchors);
      const second=contactWorld(model,off,anchors);
      const errorA=first.distanceTo(firstGoal);
      const errorB=second.distanceTo(secondGoal);
      const dotA=palmFrame(model,lead).axis.dot(axis);
      const dotB=palmFrame(model,off).axis.dot(axis);
      const guard=anatomicalGuard(model,"staff",lead);
      diagnostics.push({seed:200,initialSpan,
        primaryError:errorA,secondaryError:errorB,
        primaryAxis:dotA,secondaryAxis:dotB,
        reason:guard.ok?"staff-torso-contact":"staff-torso-unsafe"});
      if(guard.ok&&errorA<=.023&&errorB<=.023&&dotA>.85&&dotB>.85)
        return Object.freeze({
          reachable:true,commands:Object.freeze([...state.values()]),
          primaryErrorMeters:errorA,secondaryErrorMeters:errorB,
          primaryDeltaMeters:Object.freeze(first.sub(firstGoal).toArray()),
          secondaryDeltaMeters:Object.freeze(second.sub(secondGoal).toArray()),
          primaryAxisDot:dotA,secondaryAxisDot:dotB,
          iterations:0,refinementIterations,
          reason:"ok" as const,headClearanceMeters:guard.headClearance,
          elbowMaxHeightMeters:guard.elbowMax,headHeightMeters:guard.headY,
          maximumPalmHeightMeters:guard.maximumPalmY,
          separationMeters:separation,initialHandSpanMeters:initialSpan,
          dimensions:dim,weaponWorld:matrix,
          gripAnchors:Object.freeze({
            left:Object.freeze(anchors.get("left")!.local.toArray() as [number,number,number]),
            right:Object.freeze(anchors.get("right")!.local.toArray() as [number,number,number]),
          }),
        });
    }
  }
  return undefined;
}

export function solveTwoHandIK(model:StudioHumanModel,fk:AnatomicalFK,
  base:readonly JointTarget[],primary:HandSide,
  kind:TwoHandWeapon="longsword"):TwoHandIKResult {
  const secondary:HandSide=primary==="left"?"right":"left";
  const graph=model.human.spike.graph;
  // Calibration must never inherit a previous equipped pose.
  fk.apply([]);
  let state=poseMap(base);
  const dimensions=twoHandDimensions(model,kind);
  for(const hand of [primary,secondary]){
    const spread=calibrateGripSpreads(graph,model.human.spike.bones,fk.frames,hand);
    for(const c of swordGripTargets(graph,hand,spread))
      state.set(key(c.jointId,c.motion),c);
  }
  // Default seed first: the owner's accepted normal sword grip must remain
  // untouched whenever already reachable. Morphology fallbacks only run when
  // this pose cannot satisfy the SAME unchanged anatomical acceptance gates.
  const fingerState=Object.freeze([...state.values()]);
  let chosen:TwoHandIKResult|undefined;
  let lowest=Infinity;
  const diagnostics:{seed:number;initialSpan:number;primaryError:number;
    secondaryError:number;primaryAxis:number;secondaryAxis:number;reason:string}[]=[];
  candidateSeeds:for(let seed=0;seed<REACH_SEEDS.length*(kind==="longsword"?2:1);seed++){
    state=poseMap(fingerState);
    stageReadyPose(graph,fk,state,kind,primary,seed);
    const staged=Object.freeze([...state.values()]);
    fk.apply(staged);
    const anchors=kind==="staff"?calibrateStaffAnchors(model,dimensions):undefined;
    const initialHandSpanMeters=contactWorld(model,primary,anchors).distanceTo(
      contactWorld(model,secondary,anchors));
    const authored=authoredWeaponWorld(model,kind,primary,dimensions);
    const adaptive=adaptiveTwoHandWeaponWorld(
      model,kind,primary,dimensions,authored,anchors);
    const aligned=kind==="staff"?adaptiveTwoHandWeaponWorld(
      model,kind,primary,dimensions,authored,anchors,"knuckle"):undefined;
    const projected=kind==="longsword"?projectWeaponIntoArmReach(
      model,primary,dimensions,adaptive):undefined;
    const candidates=kind==="longsword"?
      (seed===0?[authored,adaptive,projected!]:[adaptive,projected!]):
      (seed===0?[aligned!,adaptive,authored]:[aligned!,adaptive]);
    for(const weaponWorld of candidates){
    state=poseMap(staged);
    fk.apply([...state.values()]);
    const shaft=weaponAxis(weaponWorld);
    const firstGoal=gripWorld(weaponWorld,dimensions.primaryGripY);
    const secondGoal=gripWorld(weaponWorld,dimensions.secondaryGripY);
    const a=fitHand(model,fk,state,kind,primary,primary,firstGoal,shaft,anchors,
      seed===0?1.10:1.55);
    const b=fitHand(model,fk,state,kind,primary,secondary,secondGoal,shaft,anchors,
      seed===0?1.10:1.55);
    let refinementIterations=0;
    // The original accepted pose uses only the existing coordinate-descent
    // solver. Damped refinement is strictly a failed sword configuration path.
    if(kind==="longsword"&&a.error<.07&&b.error<.40&&
      (a.error>.023||b.error>.023||a.dot<.42||b.dot<.42)){
      refinementIterations+=fitHandDamped(model,fk,state,kind,primary,
        secondary,secondGoal,shaft,anchors);
      if(contactWorld(model,primary,anchors).distanceTo(firstGoal)>.023)
        refinementIterations+=fitHandDamped(model,fk,state,kind,primary,
          primary,firstGoal,shaft,anchors);
    }
    fk.apply([...state.values()]);
    const first=palmFrame(model,primary),second=palmFrame(model,secondary);
    const primaryError=contactWorld(model,primary,anchors).distanceTo(firstGoal);
    const secondaryError=contactWorld(model,secondary,anchors).distanceTo(secondGoal);
    const primaryDot=first.axis.dot(shaft);
    const secondaryDot=second.axis.dot(shaft);
    const guard=anatomicalGuard(model,kind,primary);
    const orientationMinimum=kind==="staff"?.85:.42;
    const reached=guard.ok&&primaryError<=.023&&secondaryError<=.023&&
      primaryDot>orientationMinimum&&secondaryDot>orientationMinimum;
    const reason=reached?"ok":!guard.ok?"unsafe-stance":
      primaryError>.023||primaryDot<=orientationMinimum?"primary-unreachable":"secondary-unreachable";
    const commands=reached?[...state.values()]:[...base];
    const result:TwoHandIKResult=Object.freeze({
      reachable:reached,commands:Object.freeze(commands),
      primaryErrorMeters:primaryError,secondaryErrorMeters:secondaryError,
      primaryDeltaMeters:Object.freeze(contactWorld(model,primary,anchors).sub(firstGoal).toArray()),
      secondaryDeltaMeters:Object.freeze(contactWorld(model,secondary,anchors).sub(secondGoal).toArray()),
      primaryAxisDot:primaryDot,secondaryAxisDot:secondaryDot,
      iterations:a.iterations+b.iterations,refinementIterations,reason,
      headClearanceMeters:guard.headClearance,elbowMaxHeightMeters:guard.elbowMax,
      headHeightMeters:guard.headY,maximumPalmHeightMeters:guard.maximumPalmY,
      separationMeters:dimensions.primaryGripY-dimensions.secondaryGripY,
      initialHandSpanMeters,
      dimensions,weaponWorld:weaponWorld.clone(),
      gripAnchors:anchors?Object.freeze({
        left:Object.freeze(anchors.get("left")!.local.toArray() as [number,number,number]),
        right:Object.freeze(anchors.get("right")!.local.toArray() as [number,number,number]),
      }):undefined,
    });
    diagnostics.push({seed,initialSpan:initialHandSpanMeters,
      primaryError,secondaryError,primaryAxis:primaryDot,
      secondaryAxis:secondaryDot,reason});
    const score=primaryError+secondaryError+
      .04*(Math.max(0,.42-primaryDot)+Math.max(0,.42-secondaryDot))+
      (guard.ok?0:.1);
    if(reached){chosen=result;break candidateSeeds;}
    if(score<lowest){lowest=score;chosen=result;}

    }
  }
  // Only an otherwise rejected morphology or Studio pose enters the
  // relative-hand solver. The approved, successful presentation is immutable.
  if(!chosen?.reachable){
    for(const seed of kind==="longsword"?[6,2,5,0]:[3,2,1,0]){
      const paired=fitRelativeTwoHandContacts(model,fk,fingerState,
        kind,primary,dimensions,seed,diagnostics);
      if(paired){chosen=paired;break;}
    }
    if(!chosen?.reachable&&kind==="longsword"){
      const torso=fitTorsoCenteredSword(model,fk,fingerState,primary,
        dimensions,diagnostics);
      if(torso)chosen=torso;
    }
    if(!chosen?.reachable&&kind==="staff"){
      const torso=fitTorsoCenteredStaff(model,fk,fingerState,primary,
        dimensions,diagnostics);
      if(torso)chosen=torso;
    }
    if(!chosen?.reachable)fk.apply(base);
  }
  return Object.freeze({...chosen!,
    reachDiagnostics:Object.freeze(diagnostics.map(x=>Object.freeze(x)))});
}

export function createTwoHandDescriptor(model:StudioHumanModel,
  kind:TwoHandWeapon,primary:HandSide,
  dimensions=twoHandDimensions(model,kind)):TwoHandGripV1 {
  const secondary:HandSide=primary==="left"?"right":"left";
  const graph=model.human.spike.graph;
  const socket=(hand:HandSide,purpose:"primary_grip"|"secondary_grip")=>{
    const palm=scopedJoint(graph,"palm_"+hand,hand);
    const hits=graph.sockets.filter(s=>s.purpose===purpose&&
      s.parentJointId===palm.id);
    if(hits.length!==1)throw new Error("Missing/ambiguous "+purpose+" socket "+hand);
    return hits[0]!.id;
  };
  return Object.freeze({schemaVersion:1,kind,primary,secondary,
    primarySocket:socket(primary,"primary_grip"),
    secondarySocket:socket(secondary,"secondary_grip"),
    separationMeters:dimensions.primaryGripY-dimensions.secondaryGripY,
    radiusMeters:dimensions.radius,dimensions});
}
function referenceWeapon(kind:TwoHandWeapon,dim:TwoHandDimensions):THREE.Group {
  const group=new THREE.Group();
  const steel=new THREE.MeshStandardMaterial({color:0xc5d2df,metalness:.83,roughness:.29});
  const edge=new THREE.MeshStandardMaterial({color:0xe5edf1,metalness:.84,roughness:.24});
  const dark=new THREE.MeshStandardMaterial({color:0x292329,metalness:.18,roughness:.72});
  const brass=new THREE.MeshStandardMaterial({color:0xbc9755,metalness:.63,roughness:.32});
  const wood=new THREE.MeshStandardMaterial({color:0x6e492d,metalness:0,roughness:.81});
  const add=(geo:THREE.BufferGeometry,material:THREE.Material,y:number,x=0,z=0)=>{
    const mesh=new THREE.Mesh(geo,material);
    mesh.position.set(x,y,z);mesh.castShadow=true;group.add(mesh);return mesh;
  };
  if(kind==="longsword"){
    const half=dim.handleLength/2;
    const r=dim.radius;
    add(new THREE.CylinderGeometry(r,r,dim.handleLength,12),dark,0);
    for(let y=-half+r*1.4;y<half-r*1.4;y+=r*2.5)
      add(new THREE.TorusGeometry(r*1.02,r*.13,5,14),brass,y);
    add(new THREE.SphereGeometry(r*1.75,12,8),brass,-half-r*.8);
    const guardY=half+r*.55;
    add(new THREE.BoxGeometry(dim.guardWidth,r*1.25,r*2),brass,guardY);
    for(const x of [-dim.guardWidth/2,dim.guardWidth/2])
      add(new THREE.SphereGeometry(r*.95,8,8),brass,guardY,x);
    const bladeBase=guardY+r*1.1;
    add(new THREE.BoxGeometry(r*3.4,dim.bladeLength,r*.75),steel,
      bladeBase+dim.bladeLength*.5);
    add(new THREE.BoxGeometry(r*.38,dim.bladeLength*.83,r*.92),edge,
      bladeBase+dim.bladeLength*.45,0,r*.42);
    const tip=add(new THREE.ConeGeometry(r*2.05,r*5.2,4),steel,
      bladeBase+dim.bladeLength+r*2.4);
    tip.rotation.y=Math.PI/4;
  }else{
    // One continuous shaft: grip bands are labels on the SAME shaft.
    add(new THREE.CylinderGeometry(dim.radius,dim.radius,dim.shaftLength,12),
      wood,0);
    for(const y of [dim.primaryGripY,dim.secondaryGripY]){
      add(new THREE.CylinderGeometry(dim.radius*1.12,dim.radius*1.12,
        dim.radius*.6,12),brass,y);
    }
    for(const y of [-dim.shaftLength*.485,dim.shaftLength*.485])
      add(new THREE.CylinderGeometry(dim.radius*1.2,dim.radius*1.2,
        dim.radius*1.7,12),brass,y);
  }
  return group;
}
/** The same rigid authored weapon transform supplies BOTH hand targets.
 * Attachment is owned by the primary source socket, never secondary palm
 * placement or an artificially stretched handle. */
export class StudioTwoHandPreview {
  readonly descriptor:TwoHandGripV1;
  readonly object:THREE.Group;
  private readonly offset:THREE.Matrix4;
  constructor(private readonly model:StudioHumanModel,kind:TwoHandWeapon,
    primary:HandSide,solved:TwoHandIKResult){
    if(!solved.reachable)throw new Error("Unable to reach both weapon grips");
    model.human.spike.character.root.updateWorldMatrix(true,true);
    this.descriptor=createTwoHandDescriptor(model,kind,primary,solved.dimensions);
    this.object=referenceWeapon(kind,this.descriptor.dimensions);
    this.offset=model.human.spike.character
      .socketWorld(this.descriptor.primarySocket).invert().multiply(solved.weaponWorld);
    this.update();
  }
  update():void {
    this.object.matrixAutoUpdate=false;
    this.object.matrix.multiplyMatrices(
      this.model.human.spike.character.socketWorld(this.descriptor.primarySocket),
      this.offset);
    this.object.matrixWorldNeedsUpdate=true;
  }
  dispose():void {
    this.object.removeFromParent();
    const materials=new Set<THREE.Material>();
    this.object.traverse(object=>{
      if(object instanceof THREE.Mesh){
        object.geometry.dispose();
        for(const m of Array.isArray(object.material)?object.material:[object.material])
          materials.add(m);
      }
    });
    for(const material of materials)material.dispose();
    this.object.clear();
  }
}
