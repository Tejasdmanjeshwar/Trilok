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
  readonly reason:"ok"|"primary-unreachable"|"secondary-unreachable"|"unsafe-stance";
  readonly headClearanceMeters:number;
  readonly elbowMaxHeightMeters:number;
  readonly headHeightMeters:number;
  readonly maximumPalmHeightMeters:number;
  readonly separationMeters:number;
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
 * inward; the staff starts as a wide, lower horizontal guard. */
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
function stageReadyPose(graph:AnatomicalGraphV1,fk:AnatomicalFK,
  state:Map<string,JointTarget>,kind:TwoHandWeapon,primary:HandSide):void{
  const pose=STANCES[kind];
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
    add(hand,"shoulder","abduction",pose.shoulderAbduction);
    add(hand,"shoulder","flexion",pose.shoulderFlexion+
      (kind==="longsword"?(isLead?.20:-.15):0));
    add(hand,"shoulder","rotation",mirror*pose.shoulderRoll);
    add(hand,"elbow","flexion",pose.elbowFlexion+
      (kind==="longsword"?(isLead?.05:.15):0));
    add(hand,"elbow","rotation",mirror*pose.forearmRoll);
    add(hand,"wrist","flexion",pose.wristFlexion);
    add(hand,"wrist","abduction",0);
  }
}
function anatomicalGuard(model:StudioHumanModel,kind:TwoHandWeapon,
  primary:HandSide):{ok:boolean;headClearance:number;elbowMax:number;
    headY:number;maximumPalmY:number;forearmClearance:number}{
  const secondary:HandSide=primary==="left"?"right":"left";
  const head=world(jointBone(model,"head",primary));
  const chest=world(jointBone(model,"chest",primary));
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
  return {ok:headClearance>.19&&forearmClearance>.045&&
    elbowMax<head.y-.12&&maxRise<head.y-.18&&minForward>-.06,
    headClearance,elbowMax,headY:head.y,maximumPalmY:maxRise,forearmClearance};
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
    new THREE.Vector3(primary==="right"?.94:-.94,.16,.30))
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
    const knuckles=lead.axis.clone().sub(offhand.axis);
    if(staffAxisMode==="knuckle"&&knuckles.lengthSq()>1e-8){
      knuckles.normalize();
      if(knuckles.dot(handSpan)<0)knuckles.negate();
      // The shaft must be COLLINEAR with the two opposed fist axes,
      // not merely lie near the two approximate palm-joint landmarks.
      axis=knuckles.multiplyScalar(.60)
        .addScaledVector(handSpan,.35)
        .addScaledVector(nominal,.05).normalize();
    }else{
      axis=handSpan.multiplyScalar(.82)
        .addScaledVector(nominal,.18).normalize();
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
  hand:HandSide,target:THREE.Vector3,shaft:THREE.Vector3,anchors?:GripAnchors):
  {error:number;dot:number;iterations:number}{
  const dofs=freedomSet(model.human.spike.graph,fk,hand);
  const starting=new Map(dofs.map(d=>[d.key,state.get(d.key)?.radians??0]));
  // Sword hands use the same little-to-index direction toward the guard;
  // staff guards may use opposed grips. Never mistake sword grip for dual wield.
  const direction=kind==="longsword"||hand===lead?1:-1;
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
    const headGap=Math.max(0,.195-guard.headClearance);
    const elbowGap=Math.max(0,guard.elbowMax-guard.headY+.135);
    const palmGap=Math.max(0,guard.maximumPalmY-guard.headY+.20);
    const forearmGap=Math.max(0,.05-guard.forearmClearance);
    return {value:positionError*positionError*95+
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
          if(Math.abs(candidate-starting.get(dof.key)!)>1.10)continue;
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
  stageReadyPose(graph,fk,state,kind,primary);
  const staged=Object.freeze([...state.values()]);
  fk.apply(staged);
  // The calibrated staff channel is a true source-skin contact point,
  // whereas the accepted sword pose retains its existing grip semantics.
  const anchors=kind==="staff"?calibrateStaffAnchors(model,dimensions):undefined;
  const authored=authoredWeaponWorld(model,kind,primary,dimensions);
  const adaptive=adaptiveTwoHandWeaponWorld(model,kind,primary,dimensions,authored,anchors);
  const aligned=kind==="staff"?adaptiveTwoHandWeaponWorld(
    model,kind,primary,dimensions,authored,anchors,"knuckle"):undefined;
  // Sword: preserve the owner-approved default pose if it is already valid.
  // Staff: try the line through both posed hands first. On a morphology
  // boundary, a rigid chest reference is a deterministic backup candidate.
  const candidates=kind==="longsword"?[authored,adaptive]:[aligned!,adaptive,authored];
  let chosen:TwoHandIKResult|undefined;
  let lowest=Infinity;
  for(const weaponWorld of candidates){
    state=poseMap(staged);
    fk.apply([...state.values()]);
    const shaft=weaponAxis(weaponWorld);
    const firstGoal=gripWorld(weaponWorld,dimensions.primaryGripY);
    const secondGoal=gripWorld(weaponWorld,dimensions.secondaryGripY);
    const a=fitHand(model,fk,state,kind,primary,primary,firstGoal,shaft,anchors);
    const b=fitHand(model,fk,state,kind,primary,secondary,secondGoal,shaft,anchors);
    fk.apply([...state.values()]);
    const first=palmFrame(model,primary),second=palmFrame(model,secondary);
    const primaryError=contactWorld(model,primary,anchors).distanceTo(firstGoal);
    const secondaryError=contactWorld(model,secondary,anchors).distanceTo(secondGoal);
    const primaryDot=first.axis.dot(shaft);
    const secondaryDot=second.axis.dot(shaft)*(kind==="longsword"?1:-1);
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
      iterations:a.iterations+b.iterations,reason,
      headClearanceMeters:guard.headClearance,elbowMaxHeightMeters:guard.elbowMax,
      headHeightMeters:guard.headY,maximumPalmHeightMeters:guard.maximumPalmY,
      separationMeters:dimensions.primaryGripY-dimensions.secondaryGripY,
      dimensions,weaponWorld:weaponWorld.clone(),
      gripAnchors:anchors?Object.freeze({
        left:Object.freeze(anchors.get("left")!.local.toArray() as [number,number,number]),
        right:Object.freeze(anchors.get("right")!.local.toArray() as [number,number,number]),
      }):undefined,
    });
    const score=primaryError+secondaryError+
      .04*(Math.max(0,.42-primaryDot)+Math.max(0,.42-secondaryDot))+
      (guard.ok?0:.1);
    if(score<lowest){lowest=score;chosen=result;}
    if(reached)break;
  }
  // Failed candidates are not allowed to persist an invalid skin pose.
  if(!chosen?.reachable)fk.apply(base);
  return chosen!;
}

export function createTwoHandDescriptor(model:StudioHumanModel,
  kind:TwoHandWeapon,primary:HandSide):TwoHandGripV1 {
  const secondary:HandSide=primary==="left"?"right":"left";
  const graph=model.human.spike.graph;
  const socket=(hand:HandSide,purpose:"primary_grip"|"secondary_grip")=>{
    const palm=scopedJoint(graph,"palm_"+hand,hand);
    const hits=graph.sockets.filter(s=>s.purpose===purpose&&
      s.parentJointId===palm.id);
    if(hits.length!==1)throw new Error("Missing/ambiguous "+purpose+" socket "+hand);
    return hits[0]!.id;
  };
  const dimensions=twoHandDimensions(model,kind);
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
    this.descriptor=createTwoHandDescriptor(model,kind,primary);
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
