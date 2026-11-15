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
  readonly reason:"ok"|"primary-unreachable"|"secondary-unreachable";
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
/** Symmetric bounded local IK: both arm chains are allowed to rotate.
 * A fixed primary-arm target prevents the secondary wrist from achieving
 * both handle contact and orientation on the actual calibrated MakeHuman rig.
 * Instead optimize the two relative palm frames; only at the end does the
 * primary socket become the weapon-world authority. */
function fitBothArms(model:StudioHumanModel,fk:AnatomicalFK,
  state:Map<string,JointTarget>,primary:HandSide,gap:number):
  {error:number;dot:number;iterations:number}{
  const secondary:HandSide=primary==="left"?"right":"left";
  const dofs=[...freedomSet(model.human.spike.graph,fk,primary),
    ...freedomSet(model.human.spike.graph,fk,secondary)];
  const origin=new Map(dofs.map(d=>[d.key,state.get(d.key)?.radians??0]));
  const apply=()=>fk.apply([...state.values()]);
  const measure=()=>{
    const a=palmFrame(model,primary),b=palmFrame(model,secondary);
    const target=a.palm.clone().addScaledVector(a.axis,-gap);
    const error=b.palm.distanceTo(target);
    const dot=THREE.MathUtils.clamp(-a.axis.dot(b.axis),-1,1);
    // A shared handle must have BOTH positional and rotational agreement.
    // The source-knuckle axes on mirrored palms should point in opposite
    // directions, and the offhand should sit gap meters from the primary.
    let deviation=0;
    for(const d of dofs){
      const delta=(state.get(d.key)?.radians??0)-origin.get(d.key)!;
      deviation+=delta*delta;
    }
    const axisError=(1-dot)*.065;
    return {cost:error*error+axisError*axisError+.0000005*deviation,
      error,dot};
  };
  apply();
  let best=measure(),iterations=0;
  for(const step of [1,.65,.4,.22,.11,.055,.0275]){
    for(let sweep=0;sweep<4;sweep++){
      iterations++;
      let improved=false;
      for(const d of dofs){
        const current=state.get(d.key)?.radians??0;
        let chosen=current;
        for(const delta of [-step,step]){
          const value=THREE.MathUtils.clamp(current+delta,d.min,d.max);
          if(Math.abs(value-current)<1e-10)continue;
          state.set(d.key,{jointId:d.jointId,motion:d.motion,radians:value});
          apply();
          const next=measure();
          if(next.cost<best.cost-1e-12){
            best=next;chosen=value;improved=true;
          }
        }
        state.set(d.key,{jointId:d.jointId,motion:d.motion,radians:chosen});
        apply();
      }
      if(!improved)break;
    }
  }
  apply();
  const final=measure();
  return {error:final.error,dot:final.dot,iterations};
}
/** A reproducible source-valid two-hand guard stance. Starting from the
 * C1 A-pose is a poor IK seed: individual shoulder rotations initially move
 * the wrists away from the hilt and greedy CCD stalls at a local minimum.
 * These anatomical joint angles were selected by evaluating the pinned
 * MakeHuman arm envelope: mirrored palms can meet near upper chest while
 * staying within ALL native FK joint limits. The grip then drives offhand IK. */
function stageTwoHandArms(graph:AnatomicalGraphV1,fk:AnatomicalFK,
  state:Map<string,JointTarget>):void{
  for(const hand of ["left","right"] as const){
    for(const [role,motion,value] of [
      ["shoulder","abduction",2.20],
      ["shoulder","flexion",-.50],
      ["shoulder","rotation",0],
      ["elbow","flexion",1.50],
      ["elbow","rotation",0],
      ["wrist","flexion",0],
      ["wrist","abduction",0],
    ] as const){
      const joint=scopedJoint(graph,role+"_"+hand,hand);
      const frame=fk.frames.get(joint.id)?.freedoms.get(motion);
      if(!frame)throw new Error("Missing guard stance freedom");
      state.set(key(joint.id,motion),{
        jointId:joint.id,motion,
        radians:THREE.MathUtils.clamp(value,frame.min,frame.max)});
    }
  }
}
export function solveTwoHandIK(model:StudioHumanModel,fk:AnatomicalFK,
  base:readonly JointTarget[],primary:HandSide):TwoHandIKResult{
  const secondary:HandSide=primary==="left"?"right":"left";
  const graph=model.human.spike.graph;
  const state=poseMap(base);
  for(const hand of [primary,secondary]){
    const spread=calibrateGripSpreads(graph,model.human.spike.bones,fk.frames,hand);
    for(const c of swordGripTargets(graph,hand,spread))
      state.set(key(c.jointId,c.motion),c);
  }
  stageTwoHandArms(graph,fk,state);
  fk.apply([...state.values()]);
  const frame=palmFrame(model,primary);
  const gap=THREE.MathUtils.clamp(frame.width*1.55,.058,.16);
  // The primary palm itself defines the weapon's rigid world pose. Never
  // drag it toward a fabricated world-space chest target or move the root.
  const second=fitBothArms(model,fk,state,primary,gap);
  const first={error:0,dot:1,iterations:0};
  const primaryOkay=true;
  const secondaryOkay=second.error<=.025&&second.dot>.45;
  const reachable=primaryOkay&&secondaryOkay;
  if(!reachable)fk.apply(base);
  const commands=reachable?[...state.values()]:[...base];
  return Object.freeze({reachable,commands:Object.freeze(commands),
    primaryErrorMeters:first.error,secondaryErrorMeters:second.error,
    primaryAxisDot:first.dot,secondaryAxisDot:second.dot,
    iterations:first.iterations+second.iterations,
    reason:!primaryOkay?"primary-unreachable":!secondaryOkay?
      "secondary-unreachable":"ok",separationMeters:gap});
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
  if(!Number.isFinite(separation)||separation<.045||separation>.17)
    throw new Error("Invalid two-hand separation");
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
    const x=frame.forward.clone().negate(),y=frame.axis,z=x.clone().cross(y).normalize();
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
