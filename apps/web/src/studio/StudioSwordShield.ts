import * as THREE from "three";
import type {AnatomicalGraphV1} from "@trilok/character-core";
import {AnatomicalFK,type AnatomicalMotion,type JointTarget} from
  "../characters/geometry/AnatomicalFK";
import type {StudioHumanModel} from "./StudioHumanModel";
import {swordGripTargets,calibrateGripSpreads} from "./StudioWeaponGrip";
import {twoHandGripContactWorld,type HandSide} from "./StudioTwoHandGrip";
import {StudioBodyCollision} from "./StudioBodyCollision";
import {fitConstrainedIK} from "./ConstrainedIK";

/** Presentation-only independent equipment. "right" names the SWORD hand. */
export type SwordShieldEquipment="sword-shield-right"|"sword-shield-left";
export type ShieldStance="guard"|"attack"|"parry";
export const SHIELD_STANCES=Object.freeze({
  guard:"Guard",attack:"Attack ready",parry:"Parry",
} as const);
export const isSwordShieldEquipment=(mode:string):mode is SwordShieldEquipment=>
  mode==="sword-shield-right"||mode==="sword-shield-left";
export const oppositeHand=(hand:HandSide):HandSide=>hand==="left"?"right":"left";

export interface IndependentContactV1 {
  readonly socketId:string;
  readonly hand:HandSide;
  readonly contactKind:"sword"|"shield";
}
export interface ShieldDescriptorV1 {
  readonly schemaVersion:1;
  readonly id:"round-kite-v1";
  readonly kind:"shield";
  readonly source:"trilok-procedural";
  readonly contact:IndependentContactV1;
  /** All dimensions are meters, never editor scale multipliers. */
  readonly widthMeters:number;
  readonly heightMeters:number;
  readonly thicknessMeters:number;
  readonly forearmRadiusMeters:number;
  readonly gripOffsetMeters:readonly [number,number,number];
  readonly strapOffsetsMeters:readonly [number,number];
}
export interface IndependentGripResult {
  readonly reachable:boolean;
  readonly reason:"ok"|"unreachable"|"body-intersection"|"arm-intersection";
  readonly commands:readonly JointTarget[];
  readonly iterations:number;
  readonly swordHand:HandSide;
  readonly shieldHand:HandSide;
  readonly swordContactErrorMeters:number;
  readonly shieldContactErrorMeters:number;
  readonly minimumClearanceMeters:number;
  readonly forearmContactGapMeters:number;
  readonly shieldWorld:THREE.Matrix4;
  readonly descriptor:ShieldDescriptorV1;
}
const world=(bone:THREE.Bone)=>bone.getWorldPosition(new THREE.Vector3());
function scopedBone(model:StudioHumanModel,role:string,side:HandSide):THREE.Bone{
  const joint=model.human.spike.graph.joints.find(j=>j.role===role+"_"+side&&
    j.id.includes("arm["+side+",0]"));
  const bone=joint&&model.human.spike.bones.get(joint.id);
  if(!bone)throw new Error("Missing independent equipment bone: "+role+" "+side);
  return bone;
}
function jointId(graph:AnatomicalGraphV1,role:string,side:HandSide):string{
  const matches=graph.joints.filter(j=>j.role===role+"_"+side&&
    j.id.includes("arm["+side+",0]"));
  if(matches.length!==1)throw new Error("Ambiguous equipped limb "+role+" "+side);
  return matches[0]!.id;
}
function basis(model:StudioHumanModel){
  const root=model.human.spike.character.root;
  root.updateWorldMatrix(true,true);
  const rotation=root.getWorldQuaternion(new THREE.Quaternion());
  return {
    rotation,
    front:new THREE.Vector3(0,0,1).applyQuaternion(rotation),
    right:new THREE.Vector3(1,0,0).applyQuaternion(rotation),
    up:new THREE.Vector3(0,1,0).applyQuaternion(rotation),
  };
}
function palmNormal(model:StudioHumanModel,hand:HandSide):THREE.Vector3{
  const wrist=world(scopedBone(model,"wrist",hand));
  const index=worldFinger(model,hand,"index");
  const little=worldFinger(model,hand,"little");
  const middle=worldFinger(model,hand,"middle");
  const forward=middle.sub(wrist).normalize();
  const axis=index.sub(little).normalize();
  return forward.cross(axis).normalize();
}
function worldFinger(model:StudioHumanModel,hand:HandSide,digit:string):THREE.Vector3{
  const joint=model.human.spike.graph.joints.find(j=>
    j.role==="finger_"+digit+"_0"&&j.id.includes("arm["+hand+",0]"));
  const bone=joint&&model.human.spike.bones.get(joint.id);
  if(!bone)throw new Error("Missing MakeHuman finger "+digit);
  return world(bone);
}
/** Measures posed CC0 MakeHuman forearm skin, not a hand-size guessed capsule.
 * Source bone influences choose the actual forearm surface; the plate's inner
 * face is placed outside that skin and remains attached to its source socket. */
export function measureSkinnedForearm(model:StudioHumanModel,hand:HandSide,
  front:THREE.Vector3):{radius:number;sampleCount:number}{
  const {mesh,spike}=model.human;
  mesh.updateWorldMatrix(true,false);
  const elbow=world(scopedBone(model,"elbow",hand));
  const wrist=world(scopedBone(model,"wrist",hand));
  const segment=wrist.clone().sub(elbow),length=segment.length();
  if(length<.05)throw new Error("Incomplete source forearm");
  const axis=segment.clone().normalize();
  const outward=front.clone().addScaledVector(axis,-front.dot(axis)).normalize();
  const index=mesh.geometry.getAttribute("skinIndex");
  const weight=mesh.geometry.getAttribute("skinWeight");
  const id=spike.skeleton.bones.indexOf(scopedBone(model,"elbow",hand));
  const helper=spike.forearmSkinBones.get(hand);
  const helperIndex=helper?spike.skeleton.bones.indexOf(helper):-1;
  let maximum=0,count=0;
  const point=new THREE.Vector3(),relative=new THREE.Vector3();
  for(let i=0;i<index.count;i+=2){
    let influence=0;
    for(let k=0;k<4;k++){
      const b=index.getComponent(i,k);
      if(b===id||b===helperIndex)influence+=weight.getComponent(i,k);
    }
    if(influence<.45)continue;
    mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);
    relative.copy(point).sub(elbow);
    const progress=relative.dot(axis)/length;
    if(progress<.24||progress>.78)continue;
    const radial=relative.addScaledVector(axis,-relative.dot(axis));
    maximum=Math.max(maximum,radial.dot(outward));
    count++;
  }
  if(count<18||!Number.isFinite(maximum))
    throw new Error("Insufficient posed source forearm skin");
  return Object.freeze({radius:THREE.MathUtils.clamp(maximum,.009,.09),
    sampleCount:count});
}
/** Resolve a unique mirrored socket with exact limb ownership. No first-match
 * or shared hardcoded forearm offsets: extra arms can add their own contacts. */
export function shieldSocket(model:StudioHumanModel,hand:HandSide):string{
  const palm=jointId(model.human.spike.graph,"palm",hand);
  const matches=model.human.spike.graph.sockets.filter(s=>
    s.parentJointId===palm&&s.purpose==="shield");
  if(matches.length!==1)throw new Error("Shield socket missing on "+hand);
  return matches[0]!.id;
}
export function validateShieldDescriptor(descriptor:ShieldDescriptorV1,
  graph:AnatomicalGraphV1):void{
  if(descriptor.schemaVersion!==1||descriptor.id!=="round-kite-v1"||
      descriptor.kind!=="shield"||descriptor.source!=="trilok-procedural"||
      descriptor.contact.contactKind!=="shield"||
      ![descriptor.widthMeters,descriptor.heightMeters,descriptor.thicknessMeters,
        descriptor.forearmRadiusMeters,...descriptor.gripOffsetMeters,
        ...descriptor.strapOffsetsMeters].every(Number.isFinite)||
      descriptor.widthMeters<.07||descriptor.widthMeters>.8||
      descriptor.heightMeters<.12||descriptor.heightMeters>1.1||
      descriptor.thicknessMeters<=0||descriptor.thicknessMeters>.06||
      descriptor.forearmRadiusMeters<=0||descriptor.forearmRadiusMeters>.10)
    throw new Error("Invalid shield reference descriptor");
  const s=graph.sockets.find(x=>x.id===descriptor.contact.socketId);
  const palm=graph.joints.find(j=>j.id===s?.parentJointId);
  if(!s||s.purpose!=="shield"||palm?.role!=="palm_"+descriptor.contact.hand||
      !palm.id.includes("arm["+descriptor.contact.hand+",0]"))
    throw new Error("Shield contact socket belongs to the wrong limb");
}
function poseCommands(model:StudioHumanModel,fk:AnatomicalFK,
  base:readonly JointTarget[],swordHand:HandSide,stance:ShieldStance):
  Map<string,JointTarget>{
  const graph=model.human.spike.graph;
  const values=new Map(base.map(c=>[c.jointId+"/"+c.motion,c]));
  for(const hand of [swordHand,oppositeHand(swordHand)]){
    const sword=hand===swordHand;
    const splay=calibrateGripSpreads(graph,model.human.spike.bones,fk.frames,hand);
    for(const c of swordGripTargets(graph,hand,splay))
      values.set(c.jointId+"/"+c.motion,c);
    const seed=sword?
      (stance==="attack"?[.32,.53,.95,1.05]:[.33,.29,.94,1.12]):
      (stance==="parry"?[.45,.49,.93,1.20]:[.34,.32,.98,1.14]);
    const configs:readonly [string,AnatomicalMotion,number][]=[
      ["clavicle","abduction",0],["clavicle","flexion",0],
      ["shoulder","abduction",seed[0]!],["shoulder","flexion",seed[1]!],
      ["shoulder","rotation",(hand==="right"?1:-1)*seed[2]!],
      ["elbow","flexion",seed[3]!],["elbow","rotation",0],
      ["wrist","flexion",0],["wrist","abduction",0],
    ];
    for(const [role,motion,angle] of configs){
      const id=jointId(graph,role,hand);
      const freedom=fk.frames.get(id)?.freedoms.get(motion);
      if(!freedom)throw new Error("Missing calibrated independent arm DOF");
      const radians=THREE.MathUtils.clamp(angle,freedom.min,freedom.max);
      values.set(id+"/"+motion,{jointId:id,motion,radians});
    }
  }
  return values;
}
function armDOFs(model:StudioHumanModel,fk:AnatomicalFK,hand:HandSide){
  const pairs:readonly [string,readonly AnatomicalMotion[]][]=[
    ["clavicle",["abduction","flexion"]],
    ["shoulder",["flexion","abduction","rotation"]],
    ["elbow",["flexion","rotation"]],
    ["wrist",["flexion","abduction"]],
  ];
  return pairs.flatMap(([role,motions])=>{
    const id=jointId(model.human.spike.graph,role,hand);
    return motions.map(motion=>{
      const freedom=fk.frames.get(id)?.freedoms.get(motion);
      if(!freedom)throw new Error("Missing source FK freedom");
      return {jointId:id,motion,key:id+"/"+motion,min:freedom.min,max:freedom.max};
    });
  });
}
function shieldGeometry(d:ShieldDescriptorV1,
  elbow:THREE.Vector3,wrist:THREE.Vector3,grip:THREE.Vector3,
  worldMatrix:THREE.Matrix4):THREE.Group{
  const group=new THREE.Group();
  const inv=worldMatrix.clone().invert();
  const local=(point:THREE.Vector3)=>point.clone().applyMatrix4(inv);
  const e=local(elbow),w=local(wrist),g=local(grip);
  const bronze=new THREE.MeshStandardMaterial({color:0xad8754,metalness:.7,roughness:.36});
  const wood=new THREE.MeshStandardMaterial({color:0x49392f,metalness:0,roughness:.77});
  const steel=new THREE.MeshStandardMaterial({color:0xcbd2d5,metalness:.78,roughness:.28});
  const leather=new THREE.MeshStandardMaterial({color:0x292020,metalness:0,roughness:.91,
    side:THREE.DoubleSide});
  const width=d.widthMeters,height=d.heightMeters,depth=d.thicknessMeters;
  const shape=new THREE.Shape();
  shape.moveTo(-width*.46,height*.38);
  shape.quadraticCurveTo(-width*.55,height*.12,-width*.47,-height*.13);
  shape.quadraticCurveTo(-width*.38,-height*.34,0,-height*.53);
  shape.quadraticCurveTo(width*.38,-height*.34,width*.47,-height*.13);
  shape.quadraticCurveTo(width*.55,height*.12,width*.46,height*.38);
  shape.quadraticCurveTo(0,height*.55,-width*.46,height*.38);
  const plate=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{
    depth,bevelEnabled:true,bevelSize:depth*.35,bevelThickness:depth*.2,
    bevelSegments:2,curveSegments:5}),wood);
  plate.position.z=-depth*.5;
  plate.castShadow=true;group.add(plate);
  // Rim follows the actual shield contour rather than a floating torus.
  const rimPts=shape.getPoints(42).map(p=>new THREE.Vector3(p.x,p.y,depth*.7));
  const rim=new THREE.Mesh(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(rimPts,true),64,depth*.48,6,true),bronze);
  rim.castShadow=true;group.add(rim);
  const boss=new THREE.Mesh(new THREE.SphereGeometry(width*.16,16,12),steel);
  boss.scale.set(1,1,.28);boss.position.z=depth*1.2;boss.castShadow=true;group.add(boss);
  for(const y of d.strapOffsetsMeters){
    const strap=new THREE.Mesh(new THREE.BoxGeometry(width*.5,depth*1.3,depth*.9),leather);
    strap.position.set(THREE.MathUtils.clamp((e.x+w.x)*.25,-width*.1,width*.1),y,
      -d.forearmRadiusMeters-depth*.9);
    group.add(strap);
    for(const x of [-width*.23,width*.23]){
      const rivet=new THREE.Mesh(new THREE.SphereGeometry(depth*.8,8,6),bronze);
      rivet.position.set(x,y,-depth*.15);group.add(rivet);
    }
  }
  // The bar is fitted to the actual posed MakeHuman grip; the two rear straps
  // share the same rigid shield frame and rest against the sampled forearm.
  const bar=new THREE.Mesh(new THREE.CylinderGeometry(
    depth*.85,depth*.85,width*.35,10),leather);
  bar.rotation.z=Math.PI/2;bar.position.set(g.x,g.y,
    Math.min(-depth*.8,g.z));group.add(bar);
  const gripBand=new THREE.Mesh(new THREE.BoxGeometry(width*.35,depth*.7,depth*.7),bronze);
  gripBand.position.set(g.x,g.y,Math.min(-depth*.8,g.z)-depth*.8);group.add(gripBand);
  return group;
}
export class StudioShieldPreview {
  readonly object:THREE.Group;
  readonly descriptor:ShieldDescriptorV1;
  private readonly offset:THREE.Matrix4;
  constructor(private readonly model:StudioHumanModel,solved:IndependentGripResult){
    if(!solved.reachable)throw new Error("Unreachable source shield grip");
    this.descriptor=solved.descriptor;
    validateShieldDescriptor(this.descriptor,model.human.spike.graph);
    const hand=solved.shieldHand;
    this.object=shieldGeometry(this.descriptor,
      world(scopedBone(model,"elbow",hand)),
      world(scopedBone(model,"wrist",hand)),
      twoHandGripContactWorld(model,hand),solved.shieldWorld);
    this.offset=model.human.spike.character
      .socketWorld(this.descriptor.contact.socketId).invert().multiply(solved.shieldWorld);
    this.update();
  }
  update():void{
    this.object.matrixAutoUpdate=false;
    this.object.matrix.multiplyMatrices(
      this.model.human.spike.character.socketWorld(this.descriptor.contact.socketId),
      this.offset);
    this.object.matrixWorldNeedsUpdate=true;
  }
  dispose():void{
    this.object.removeFromParent();
    const mats=new Set<THREE.Material>();
    this.object.traverse(obj=>{
      if(obj instanceof THREE.Mesh){
        obj.geometry.dispose();
        for(const material of Array.isArray(obj.material)?obj.material:[obj.material])
          mats.add(material);
      }
    });
    for(const material of mats)material.dispose();
    this.object.clear();
  }
}

/** Both arms use the SAME bounded, FK-aware solver and torso-skin collision
 * volume. Their goals and fingers are independent, not two points on one sword.
 * Pose stays outside authoritative combat. */
export function solveIndependentGrips(model:StudioHumanModel,fk:AnatomicalFK,
  base:readonly JointTarget[],swordHand:HandSide,stance:ShieldStance):IndependentGripResult{
  if(!Object.hasOwn(SHIELD_STANCES,stance))throw new Error("Unknown shield preview stance");
  const shieldHand=oppositeHand(swordHand);
  const graph=model.human.spike.graph;
  fk.apply([]);
  const collision=new StudioBodyCollision(model);
  const {rotation,front,right,up}=basis(model);
  const chest=world((()=>{
    const j=graph.joints.find(x=>x.role==="chest")!;
    return model.human.spike.bones.get(j.id)!;
  })());
  const head=world((()=>{
    const j=graph.joints.find(x=>x.role==="head")!;
    return model.human.spike.bones.get(j.id)!;
  })());
  const ankle=world((()=>{
    const j=graph.joints.find(x=>x.role==="ankle_left")!;
    return model.human.spike.bones.get(j.id)!;
  })());
  const scale=THREE.MathUtils.clamp((head.y-ankle.y+.13)/1.75,.4,1.2);
  const values=poseCommands(model,fk,base,swordHand,stance);
  const commands=()=>[...values.values()];
  fk.apply(commands());
  const targets=new Map<HandSide,THREE.Vector3>();
  for(const hand of [swordHand,shieldHand]){
    const sword=hand===swordHand,side=hand==="right"?1:-1;
    const x=sword?(stance==="attack"?.30:.32):.29;
    const y=sword?(stance==="attack"?-.04:-.20):(stance==="parry"?-.02:-.17);
    const z=sword?(stance==="attack"?.43:.30):(stance==="parry"?.48:.40);
    const target=chest.clone().addScaledVector(right,x*side*scale)
      .addScaledVector(up,y*scale).addScaledVector(front,z*scale);
    // Body occupancy is derived from source-skinned torso, not from macros.
    for(let i=0;i<24&&collision.clearance(target)<.045*scale;i++)
      target.addScaledVector(front,.012*scale);
    targets.set(hand,target);
  }
  let iterations=0;
  for(const hand of [shieldHand,swordHand]){
    const dofs=armDOFs(model,fk,hand);
    const start=dofs.map(d=>values.get(d.key)?.radians??0);
    const target=targets.get(hand)!;
    const shoulder=world(scopedBone(model,"shoulder",hand));
    const elbow=world(scopedBone(model,"elbow",hand));
    const pole=shoulder.clone().addScaledVector(right,(hand==="right"?1:-1)*.16*scale)
      .addScaledVector(up,-.20*scale).addScaledVector(front,.17*scale);
    const evaluate=(angles:readonly number[])=>{
      dofs.forEach((d,i)=>values.set(d.key,{
        jointId:d.jointId,motion:d.motion,radians:angles[i]!}));
      fk.apply(commands());
      const point=twoHandGripContactWorld(model,hand);
      const wrist=world(scopedBone(model,"wrist",hand));
      const elbowPoint=world(scopedBone(model,"elbow",hand));
      const palm=palmNormal(model,hand);
      const armClearance=[wrist,elbowPoint,point].map(p=>
        Math.max(0,.026*scale-collision.clearance(p)));
      // Position, readable palm facing, relaxed elbow pole, and real torso
      // clearance are all residuals in the existing damped IK engine.
      const delta=point.sub(target);
      return [delta.x*2,delta.y*2,delta.z*2,
        (1-Math.abs(palm.dot(front)))*.018,
        elbowPoint.x*.08-pole.x*.08,
        elbowPoint.y*.08-pole.y*.08,
        elbowPoint.z*.08-pole.z*.08,
        ...armClearance.map(x=>x*3),
        ...angles.map((a,i)=>(a-start[i]!)*.008)];
    };
    const fit=fitConstrainedIK(start,dofs.map(d=>({min:d.min,max:d.max})),
      evaluate,22);
    iterations+=fit.iterations;
    dofs.forEach((d,i)=>values.set(d.key,{
      jointId:d.jointId,motion:d.motion,radians:fit.values[i]!}));
    fk.apply(commands());
  }
  const swordError=twoHandGripContactWorld(model,swordHand)
    .distanceTo(targets.get(swordHand)!);
  const shieldError=twoHandGripContactWorld(model,shieldHand)
    .distanceTo(targets.get(shieldHand)!);
  const wrist=world(scopedBone(model,"wrist",shieldHand));
  const elbow=world(scopedBone(model,"elbow",shieldHand));
  const grip=twoHandGripContactWorld(model,shieldHand);
  const forearm=measureSkinnedForearm(model,shieldHand,front);
  const armLength=wrist.distanceTo(elbow);
  const thickness=THREE.MathUtils.clamp(armLength*.045,.005,.018);
  const center=wrist.clone().lerp(elbow,.47)
    .addScaledVector(front,forearm.radius+thickness*.8+.008*scale);
  const shieldWorld=new THREE.Matrix4().compose(center,rotation,new THREE.Vector3(1,1,1));
  const invert=shieldWorld.clone().invert();
  const gripLocal=grip.clone().applyMatrix4(invert);
  const width=THREE.MathUtils.clamp(armLength*.92,.095,.36);
  const height=THREE.MathUtils.clamp(armLength*1.53,.16,.65);
  const descriptor:ShieldDescriptorV1=Object.freeze({
    schemaVersion:1,id:"round-kite-v1",kind:"shield",source:"trilok-procedural",
    contact:Object.freeze({socketId:shieldSocket(model,shieldHand),
      hand:shieldHand,contactKind:"shield"}),
    widthMeters:width,heightMeters:height,thicknessMeters:thickness,
    forearmRadiusMeters:forearm.radius,
    gripOffsetMeters:Object.freeze(gripLocal.toArray() as [number,number,number]),
    strapOffsetsMeters:Object.freeze([-height*.20,height*.22] as [number,number]),
  });
  validateShieldDescriptor(descriptor,graph);
  const samples:THREE.Vector3[]=[
    center,
    center.clone().addScaledVector(right,width*.4),
    center.clone().addScaledVector(right,-width*.4),
    center.clone().addScaledVector(up,height*.33),
    center.clone().addScaledVector(up,-height*.4),
    grip,
    ...[swordHand,shieldHand].flatMap(hand=>[
      world(scopedBone(model,"elbow",hand)),
      world(scopedBone(model,"wrist",hand))]),
  ];
  const clearance=Math.min(...samples.map(p=>collision.clearance(p)));
  const handSeparation=twoHandGripContactWorld(model,swordHand)
    .distanceTo(twoHandGripContactWorld(model,shieldHand));
  const forearmContactGap=Math.max(0,
    center.distanceTo(wrist.clone().lerp(elbow,.47))-forearm.radius-thickness);
  const reached=swordError<.065*scale&&shieldError<.065*scale;
  const safe=clearance>-.006*scale;
  const separated=handSeparation>.075*scale;
  const reason=!reached?"unreachable":!safe?"body-intersection":
    !separated?"arm-intersection":"ok";
  if(reason!=="ok")fk.apply(base);
  return Object.freeze({
    reachable:reason==="ok",reason,commands:Object.freeze(reason==="ok"?commands():[...base]),
    iterations,swordHand,shieldHand,swordContactErrorMeters:swordError,
    shieldContactErrorMeters:shieldError,minimumClearanceMeters:clearance,
    forearmContactGapMeters:forearmContactGap,descriptor,shieldWorld,
  });
}
