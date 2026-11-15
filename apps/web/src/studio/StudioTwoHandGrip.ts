import * as THREE from "three";
import type {AnatomicalGraphV1} from "@trilok/character-core";
import {AnatomicalFK,type JointTarget,type AnatomicalMotion}
  from "../characters/geometry/AnatomicalFK";
import type {StudioHumanModel} from "./StudioHumanModel";
import {calibrateGripSpreads,swordGripTargets} from "./StudioWeaponGrip";

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
}
export interface TwoHandIKResult {
  readonly reachable:boolean;
  readonly commands:readonly JointTarget[];
  readonly primaryErrorMeters:number;
  readonly secondaryErrorMeters:number;
  readonly primaryAxisDot:number;
  readonly secondaryAxisDot:number;
  readonly iterations:number;
  readonly reason:"ok"|"primary-unreachable"|"secondary-unreachable"|"unsafe-stance";
  readonly headClearanceMeters:number;
  readonly elbowMaxHeightMeters:number;
  readonly headHeightMeters:number;
  readonly maximumPalmHeightMeters:number;
  readonly separationMeters:number;
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
  return {palm,axis,width:across.length(),forward,normal};
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
  longsword:{shoulderAbduction:.60,shoulderFlexion:.40,
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
function axisDirection(a:THREE.Vector3,b:THREE.Vector3):THREE.Vector3{
  return b.clone().sub(a).normalize();
}
function anatomicalGuard(model:StudioHumanModel,kind:TwoHandWeapon,
  primary:HandSide):{ok:boolean;headClearance:number;elbowMax:number;
    headY:number;maximumPalmY:number}{
  const secondary:HandSide=primary==="left"?"right":"left";
  const head=world(jointBone(model,"head",primary));
  const chest=world(jointBone(model,"chest",primary));
  let elbowMax=-Infinity,headClearance=Infinity;
  for(const hand of [primary,secondary]){
    const elbow=world(jointBone(model,"elbow_"+hand,hand));
    const wrist=world(jointBone(model,"wrist_"+hand,hand));
    const palm=world(jointBone(model,"palm_"+hand,hand));
    elbowMax=Math.max(elbowMax,elbow.y);
    for(const p of [elbow,wrist,palm]){
      headClearance=Math.min(headClearance,p.distanceTo(head));
    }
  }
  const palms=[world(jointBone(model,"palm_"+primary,primary)),
    world(jointBone(model,"palm_"+secondary,secondary))];
  const maxRise=Math.max(...palms.map(p=>p.y));
  const minForward=Math.min(...palms.map(p=>p.z-chest.z));
  return {ok:headClearance>.19&&elbowMax<head.y-.12&&
    maxRise<head.y-.18&&minForward>-.06,
    headClearance,elbowMax,headY:head.y,maximumPalmY:maxRise};
}
/** A tiny secondary-arm correction around an already usable authored pose.
 * Fails safely instead of inventing a high crossed-arm configuration. */
function refineOffhand(model:StudioHumanModel,fk:AnatomicalFK,
  state:Map<string,JointTarget>,kind:TwoHandWeapon,primary:HandSide,
  goal:THREE.Vector3,wantedAxis:THREE.Vector3):
  {error:number;dot:number;iterations:number}{
  const secondary:HandSide=primary==="left"?"right":"left";
  const dofs=freedomSet(model.human.spike.graph,fk,secondary)
    .filter(d=>d.motion!=="rotation"||!d.jointId.includes("clavicle"));
  const start=new Map(dofs.map(d=>[d.key,state.get(d.key)?.radians??0]));
  const apply=()=>fk.apply([...state.values()]);
  const measure=()=>{
    const frame=palmFrame(model,secondary);
    const error=frame.palm.distanceTo(goal);
    const dot=THREE.MathUtils.clamp(-frame.axis.dot(wantedAxis),-1,1);
    const safety=anatomicalGuard(model,kind,primary);
    let travel=0;
    for(const d of dofs){
      const delta=(state.get(d.key)?.radians??0)-start.get(d.key)!;
      travel+=delta*delta;
    }
    const overshoot=Math.max(0,safety.elbowMax-
      world(jointBone(model,"head",primary)).y+.13);
    const cost=error*error+.00018*(1-dot)*(1-dot)+
      .00010*travel+overshoot*overshoot*40+
      (safety.headClearance<.19?(.19-safety.headClearance)**2*50:0);
    return {cost,error,dot};
  };
  apply();let best=measure(),iterations=0;
  for(const step of [.25,.12,.06,.03]){
    for(let sweep=0;sweep<2;sweep++){
      iterations++;let improved=false;
      for(const dof of dofs){
        const current=state.get(dof.key)?.radians??0;
        let selected=current;
        for(const d of [-step,step]){
          const candidate=THREE.MathUtils.clamp(current+d,dof.min,dof.max);
          if(Math.abs(candidate-start.get(dof.key)!)>.45)continue;
          state.set(dof.key,{jointId:dof.jointId,motion:dof.motion,radians:candidate});
          apply();
          const next=measure();
          if(next.cost<best.cost-1e-12){best=next;selected=candidate;improved=true;}
        }
        state.set(dof.key,{jointId:dof.jointId,motion:dof.motion,radians:selected});
        apply();
      }
      if(!improved)break;
    }
  }
  return {...measure(),iterations};
}
/** Rotate the forearms around their anatomical long axes to let the
 * knuckle lines follow the shaft, without changing the actual low elbow
 * positions. This is the missing physical constraint in a staff grasp. */
function calibrateStaffForearms(model:StudioHumanModel,fk:AnatomicalFK,
  state:Map<string,JointTarget>,primary:HandSide):void{
  const secondary:HandSide=primary==="left"?"right":"left";
  const graph=model.human.spike.graph;
  const apply=()=>fk.apply([...state.values()]);
  apply();
  const initial=palmFrame(model,primary).palm;
  const opposite=palmFrame(model,secondary).palm;
  const shaft=initial.sub(opposite).normalize();
  for(const hand of [primary,secondary]){
    const joint=scopedJoint(graph,"elbow_"+hand,hand);
    const freedom=fk.frames.get(joint.id)!.freedoms.get("rotation")!;
    const desired=hand===primary?1:-1;
    let best=-Infinity,bestAngle=0;
    for(let i=-12;i<=12;i++){
      const angle=THREE.MathUtils.clamp(i*.11,freedom.min,freedom.max);
      state.set(key(joint.id,"rotation"),{
        jointId:joint.id,motion:"rotation",radians:angle});
      apply();
      const alignment=palmFrame(model,hand).axis.dot(shaft)*desired;
      const score=alignment-.025*Math.abs(angle);
      if(score>best){best=score;bestAngle=angle;}
    }
    state.set(key(joint.id,"rotation"),{
      jointId:joint.id,motion:"rotation",radians:bestAngle});
    apply();
  }
}
export function solveTwoHandIK(model:StudioHumanModel,fk:AnatomicalFK,
  base:readonly JointTarget[],primary:HandSide,
  kind:TwoHandWeapon="longsword"):TwoHandIKResult{
  const secondary:HandSide=primary==="left"?"right":"left";
  const graph=model.human.spike.graph;
  const state=poseMap(base);
  for(const hand of [primary,secondary]){
    const spread=calibrateGripSpreads(graph,model.human.spike.bones,fk.frames,hand);
    for(const c of swordGripTargets(graph,hand,spread))
      state.set(key(c.jointId,c.motion),c);
  }
  stageReadyPose(graph,fk,state,kind,primary);
  fk.apply([...state.values()]);
  // A long-handled, two-hand reference greatsword is deliberately used
  // instead of a short one-hand hilt. The pinned source FK cannot move both
  // wrists onto a compact 11 cm hilt without raising crossed elbows to the
  // face; a measured extended hilt is the anatomically safer choice.
  calibrateStaffForearms(model,fk,state,primary);
  const lead=palmFrame(model,primary),follower=palmFrame(model,secondary);
  const gap=THREE.MathUtils.clamp(
    lead.palm.distanceTo(follower.palm),kind==="staff"?.30:.25,
    kind==="staff"?.85:.75);
  const axis=axisDirection(follower.palm,lead.palm);
  const target=lead.palm.clone().addScaledVector(axis,-gap);
  const secondaryResult=refineOffhand(model,fk,state,kind,primary,target,axis);
  const actualLead=palmFrame(model,primary),actualOff=palmFrame(model,secondary);
  const actualAxis=axisDirection(actualOff.palm,actualLead.palm);
  const secondaryError=actualOff.palm.distanceTo(
    actualLead.palm.clone().addScaledVector(actualAxis,-gap));
  const dot=THREE.MathUtils.clamp(-actualOff.axis.dot(actualAxis),-1,1);
  const guard=anatomicalGuard(model,kind,primary);
  const reached=guard.ok&&secondaryError<=.035&&dot>.35;
  if(!reached)fk.apply(base);
  const commands=reached?[...state.values()]:[...base];
  return Object.freeze({reachable:reached,commands:Object.freeze(commands),
    primaryErrorMeters:0,secondaryErrorMeters:secondaryError,
    primaryAxisDot:1,secondaryAxisDot:dot,
    iterations:secondaryResult.iterations,
    reason:reached?"ok":!guard.ok?"unsafe-stance":"secondary-unreachable",
    headClearanceMeters:guard.headClearance,
    elbowMaxHeightMeters:guard.elbowMax,
    headHeightMeters:guard.headY,
    maximumPalmHeightMeters:guard.maximumPalmY,
    separationMeters:gap});
}

export function createTwoHandDescriptor(model:StudioHumanModel,
  kind:TwoHandWeapon,primary:HandSide,separation:number):TwoHandGripV1{
  const secondary:HandSide=primary==="left"?"right":"left";
  const graph=model.human.spike.graph;
  const socket=(hand:HandSide,purpose:"primary_grip"|"secondary_grip")=>{
    const palm=scopedJoint(graph,"palm_"+hand,hand);
    const hits=graph.sockets.filter(s=>s.purpose===purpose&&
      s.parentJointId===palm.id);
    if(hits.length!==1)throw new Error("Missing/ambiguous "+purpose+" socket "+hand);
    return hits[0]!.id;
  };
  const width=palmFrame(model,primary).width;
  const radius=THREE.MathUtils.clamp(width/5.2,.005,.018);
  const minGap=kind==="staff"?.25:.20;
  const maxGap=kind==="staff"?.90:.80;
  if(!Number.isFinite(separation)||separation<minGap||separation>maxGap)
    throw new Error("Invalid "+kind+" separation");
  return Object.freeze({schemaVersion:1,kind,primary,secondary,
    primarySocket:socket(primary,"primary_grip"),
    secondarySocket:socket(secondary,"secondary_grip"),
    separationMeters:separation,radiusMeters:radius});
}
function referenceWeapon(kind:TwoHandWeapon,radius:number,spacing:number,
  width:number):THREE.Group {
  const group=new THREE.Group();
  const steel=new THREE.MeshStandardMaterial({color:0xc5d2df,metalness:.83,roughness:.29});
  const dark=new THREE.MeshStandardMaterial({color:0x292329,metalness:.18,roughness:.72});
  const brass=new THREE.MeshStandardMaterial({color:0xbc9755,metalness:.63,roughness:.32});
  const wood=new THREE.MeshStandardMaterial({color:0x6e492d,metalness:0,roughness:.81});
  const add=(geo:THREE.BufferGeometry,material:THREE.Material,y:number,x=0,z=0)=>{
    const mesh=new THREE.Mesh(geo,material);
    mesh.position.set(x,y,z);mesh.castShadow=true;group.add(mesh);return mesh;
  };
  const gripHalf=spacing*.5+Math.max(width*.55,.03);
  const handle=gripHalf*2;
  if(kind==="longsword"){
    add(new THREE.CylinderGeometry(radius,radius,handle,12),dark,0);
    for(let y=-gripHalf+.02;y<gripHalf-.01;y+=radius*2.6)
      add(new THREE.TorusGeometry(radius*1.02,.002,5,14),brass,y);
    add(new THREE.SphereGeometry(radius*1.8,12,8),brass,-gripHalf-.014);
    add(new THREE.BoxGeometry(.16,.018,.026),brass,gripHalf+.016);
    for(const x of [-.083,.083])
      add(new THREE.SphereGeometry(.013,8,8),brass,gripHalf+.016,x);
    const bladeLength=THREE.MathUtils.clamp(width*9,.42,.88);
    add(new THREE.BoxGeometry(.052,bladeLength,.010),steel,
      gripHalf+.039+bladeLength*.5);
    const tip=add(new THREE.ConeGeometry(.031,.075,4),steel,
      gripHalf+.04+bladeLength+.035);
    tip.rotation.y=Math.PI/4;
  }else{
    const length=THREE.MathUtils.clamp(width*17,.7,1.45);
    add(new THREE.CylinderGeometry(radius*1.15,radius*1.15,length,12),
      wood,(length/2-gripHalf)*.15);
    for(const y of [-gripHalf,gripHalf]){
      add(new THREE.CylinderGeometry(radius*1.3,radius*1.3,.02,12),brass,y);
    }
    for(const y of [-length*.44,length*.48])
      add(new THREE.CylinderGeometry(radius*1.23,radius*1.23,.03,12),brass,y);
  }
  return group;
}
/** Owns presentation geometry only. A calibrated primary semantic socket
 * provides the attachment authority, while offhand FK reaches its contact
 * point. The staff/sword do not emit combat or animation events. */
export class StudioTwoHandPreview {
  readonly descriptor:TwoHandGripV1;
  readonly object:THREE.Group;
  private readonly offset:THREE.Matrix4;
  constructor(private readonly model:StudioHumanModel,kind:TwoHandWeapon,
    primary:HandSide,solved:TwoHandIKResult){
    if(!solved.reachable)throw new Error("Unable to reach both weapon grips");
    model.human.spike.character.root.updateWorldMatrix(true,true);
    this.descriptor=createTwoHandDescriptor(model,kind,primary,solved.separationMeters);
    const frame=palmFrame(model,primary);
    this.object=referenceWeapon(kind,this.descriptor.radiusMeters,
      this.descriptor.separationMeters,frame.width);
    // Longsword/staff local +Y follows calibrated primary knuckle axis.
    // Primary and offhand contact locations are +gap/2 and -gap/2.
    const offhand=palmFrame(model,this.descriptor.secondary);
    const y=frame.palm.clone().sub(offhand.palm).normalize();
    // Primary-to-secondary grip points are separated in the REAL handle
    // direction. The sword preserves C5.1's orthogonal hilt orientation.
    const x=frame.forward.clone().negate()
      .addScaledVector(y,frame.forward.dot(y)).normalize();
    const z=x.clone().cross(y).normalize();
    x.crossVectors(y,z).normalize();
    const rotation=new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(x,y,z));
    const origin=frame.palm.clone().addScaledVector(y,-solved.separationMeters/2)
      .addScaledVector(frame.normal,.003);
    const desired=new THREE.Matrix4().compose(origin,rotation,new THREE.Vector3(1,1,1));
    this.offset=model.human.spike.character
      .socketWorld(this.descriptor.primarySocket).invert().multiply(desired);
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
