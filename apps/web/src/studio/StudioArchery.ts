import * as THREE from "three";
import type {AnatomicalGraphV1} from "@trilok/character-core";
import {AnatomicalFK,type AnatomicalMotion,type JointTarget}
  from "../characters/geometry/AnatomicalFK";
import type {StudioHumanModel} from "./StudioHumanModel";
import {fitConstrainedIK} from "./ConstrainedIK";
import {StudioBodyCollision} from "./StudioBodyCollision";
import {calibrateGripSpreads,handContactTargets,fitHandleCenter}
  from "./StudioWeaponGrip";
import {fitBowHandContact} from "./StudioBowContact";
import type {SourceCylinderRegion} from "./StudioSourceContact";
import {contactArmFreedoms,composeContactPose,clampContactSeed,
  solveContactConstraints} from "./StudioContactIK";
import {twoHandGripContactWorld,type HandSide} from "./StudioTwoHandGrip";

/** Studio-only visual states. A release preview never dispatches a combat event. */
export type ArcheryState="rest"|"nock"|"partial"|"aim"|"release";
export type BowEquipment="bow-left"|"bow-right";
export const isBowEquipment=(value:string):value is BowEquipment=>
  value==="bow-left"||value==="bow-right";
export const oppositeHand=(side:HandSide):HandSide=>side==="left"?"right":"left";
export const ARCHERY_STATES:Readonly<Record<ArcheryState,string>>=Object.freeze({
  rest:"Bow held",nock:"Nocking arrow",partial:"Partial draw",
  aim:"Full draw / aim",release:"Release / follow-through",
});
export interface BowReferenceV1 {
  readonly schemaVersion:1;
  readonly id:string;
  readonly kind:"bow";
  readonly hand:HandSide;
  readonly socketId:string;
  readonly limbLengthMeters:number;
  readonly handleRadiusMeters:number;
  readonly handleLengthMeters:number;
  readonly arrowLengthMeters:number;
  readonly stringRestMeters:number;
  readonly maximumDrawMeters:number;
}
/** Local frame: grip is origin, +Y upper tip, +Z forward (arrow travel);
 * string anchor points are (0,+/- limbLength,-stringRest);
 * string center follows local (0,0,-stringRest-drawDistance).
 * Arrow is +Z from its nock; the model owns no physics or combat clock. */
export function validateBowReference(d:BowReferenceV1,graph:AnatomicalGraphV1):void{
  const socket=graph.sockets.find(s=>s.id===d.socketId);
  const parent=graph.joints.find(j=>j.id===socket?.parentJointId);
  if(d.schemaVersion!==1||d.kind!=="bow"||!/^bow\/(left|right)$/.test(d.id)||
    !["left","right"].includes(d.hand)||socket?.purpose!=="primary_grip"||
    parent?.role!=="palm_"+d.hand||
    !parent.id.includes("arm["+d.hand+",0]")||
    ![d.limbLengthMeters,d.handleRadiusMeters,d.handleLengthMeters,
      d.arrowLengthMeters,d.stringRestMeters,d.maximumDrawMeters]
      .every(Number.isFinite)||
    d.limbLengthMeters<.2||d.limbLengthMeters>1.1||
    d.handleRadiusMeters<.002||d.handleRadiusMeters>.035||
    d.handleLengthMeters<.03||d.handleLengthMeters>.25||
    d.arrowLengthMeters<.2||d.arrowLengthMeters>1.5||
    d.stringRestMeters<.02||d.stringRestMeters>.2||
    d.maximumDrawMeters<.05||d.maximumDrawMeters>.8)
    throw new Error("Invalid anatomical bow reference");
}
function bone(model:StudioHumanModel,role:string,side:HandSide):THREE.Bone{
  const j=model.human.spike.graph.joints.find(j=>j.role===role&&
    (role.startsWith("finger_")?j.id.includes("arm["+side+",0]"):true));
  const result=j&&model.human.spike.bones.get(j.id);
  if(!result)throw new Error("Missing source bow joint "+role);
  return result;
}
const at=(item:THREE.Object3D)=>item.getWorldPosition(new THREE.Vector3());
const scoped=(model:StudioHumanModel,role:string,side:HandSide)=>
  model.human.spike.graph.joints.find(j=>j.role===role+"_"+side&&
    j.id.includes("arm["+side+",0]")) ??
  model.human.spike.graph.joints.find(j=>j.role===role+"_"+side);
const k=(item:JointTarget)=>item.jointId+"/"+item.motion;
const merge=(base:readonly JointTarget[],overrides:readonly JointTarget[]):JointTarget[]=>{
  const state=new Map(base.map(c=>[k(c),c]));
  for(const command of overrides)state.set(k(command),command);
  return [...state.values()];
};
function digitCommands(model:StudioHumanModel,fk:AnatomicalFK,side:HandSide,
  drawing:boolean):readonly JointTarget[]{
  const h=model.human.spike;
  const spreads=calibrateGripSpreads(h.graph,h.bones,fk.frames,side);
  return handContactTargets(h.graph,side,
    drawing?"string-two-finger":"bow-handle",spreads);
}
/** The string hook is the crease between the source index and middle fingers,
 * not the C5.2 cylindrical-grip palm proxy. These are real posed MakeHuman
 * finger bones: the solver cannot claim contact by shifting a visual target. */
export function drawingFingerContactWorld(model:StudioHumanModel,
  side:HandSide):THREE.Vector3{
  const index=at(bone(model,"finger_index_1",side));
  const middle=at(bone(model,"finger_middle_1",side));
  return index.add(middle).multiplyScalar(.5);
}

type Freedom={jointId:string;motion:AnatomicalMotion;min:number;max:number};
const ARM_CHANNELS:readonly (readonly [string,readonly AnatomicalMotion[]])[]=[
  ["clavicle",["abduction","flexion"]],
  ["shoulder",["abduction","flexion","rotation"]],
  ["elbow",["flexion","rotation"]],
  ["wrist",["flexion","abduction"]],
];
function fitArm(model:StudioHumanModel,fk:AnatomicalFK,base:readonly JointTarget[],
  side:HandSide,target:THREE.Vector3,drawHand:boolean,scale:number){
  const axes:Freedom[]=[];
  for(const [role,motions] of ARM_CHANNELS){
    const joint=scoped(model,role,side);
    if(!joint)throw new Error("Missing constrained bow arm role "+role);
    for(const motion of motions){
      const f=fk.frames.get(joint.id)?.freedoms.get(motion);
      if(!f)throw new Error("Uncalibrated bow arm freedom");
      axes.push({jointId:joint.id,motion,min:f.min,max:f.max});
    }
  }
  const sign=side==="right"?1:-1;
  // A draw arm approaching the face from the contralateral shoulder needs
  // alternative, anatomically legal elbow folds. Reuse the same bounded DLS
  // solver, selecting the lowest measured source-contact residual.
  const seedAngles=drawHand?[
    [0,0,.48,.29,.86*sign,1.40,0,-.06,0],
    [0,0,.16,.88,-.80*sign,1.58,0,-.12,0],
    [0,0,-.12,.62,-1.45*sign,1.95,0,-.20,0],
    [0,0,.62,.48,-1.10*sign,1.24,0,.16,0],
  ]:[
    [0,0,.55,.40,.85*sign,.65,0,-.08,0],
  ];
  const stage=(values:readonly number[])=>merge(base,axes.map((a,i)=>({
    jointId:a.jointId,motion:a.motion,radians:values[i]!,
  })));
  const elbow=bone(model,"elbow_"+side,side);
  const wrist=bone(model,"wrist_"+side,side);
  const head=bone(model,"head",side);
  const collision=new StudioBodyCollision(model);
  const rootQuaternion=model.human.spike.character.root
    .getWorldQuaternion(new THREE.Quaternion());
  const worldUp=new THREE.Vector3(0,1,0).applyQuaternion(rootQuaternion);
  const sourceGripAxis=()=>{
    const wristPoint=at(bone(model,"wrist_"+side,side));
    const middlePoint=at(bone(model,"finger_middle_0",side));
    const direction=middlePoint.sub(wristPoint).normalize();
    const across=at(bone(model,"finger_index_0",side))
      .sub(at(bone(model,"finger_little_0",side)));
    return across.addScaledVector(direction,-across.dot(direction)).normalize();
  };
  let best:{commands:JointTarget[];error:number;clearance:number;
    iterations:number;score:number}|undefined;
  let attempts=0;
  for(const seed of seedAngles){
    attempts++;
    const initial=axes.map((a,i)=>THREE.MathUtils.clamp(
      seed[i]!,a.min,a.max));
    const evaluate=(values:readonly number[])=>{
      fk.apply(stage(values));
      const contact=twoHandGripContactWorld(model,side);
      const elbowWorld=at(elbow),wristWorld=at(wrist),headWorld=at(head);
      const body=collision.clearance(elbowWorld.clone().lerp(wristWorld,.5));
      return [
        contact.x-target.x,contact.y-target.y,contact.z-target.z,
        Math.max(0,.026*scale-body)*1.2,
        Math.max(0,.11*scale-contact.distanceTo(headWorld)),
        // The physically held bow should be approximately upright.
        // Calibrate the source knuckle axis by legal shoulder/elbow/wrist FK,
        // never visually rotate the weapon independently of the hand socket.
        ...(drawHand?[]:[...sourceGripAxis().clone().cross(worldUp).toArray()]
          .map(x=>x*.08*scale)),
        ...values.map((angle,i)=>(angle-initial[i]!)*.003),
      ];
    };
    const fit=fitConstrainedIK(initial,axes,evaluate,24);
    const commands=stage(fit.values);
    fk.apply(commands);
    const error=twoHandGripContactWorld(model,side).distanceTo(target);
    const clearance=collision.clearance(at(elbow).lerp(at(wrist),.5));
    const inclination=drawHand?0:
      sourceGripAxis().clone().cross(worldUp).length();
    const score=error+Math.max(0,.01*scale-clearance)*2+
      inclination*.08*scale;
    if(!best||score<best.score){
      best={commands,error,clearance,iterations:fit.iterations,score};
    }
    if(error<.012*scale&&clearance>.01*scale)break;
  }
  if(!best)throw new Error("No calibrated archery arm candidates");
  fk.apply(best.commands);
  return {...best,attempts};
}
function bowFrame(model:StudioHumanModel,hand:HandSide,
  radius:number,length:number):THREE.Matrix4{
  const wrist=at(bone(model,"wrist_"+hand,hand));
  const index=at(bone(model,"finger_index_0",hand));
  const little=at(bone(model,"finger_little_0",hand));
  const middle=at(bone(model,"finger_middle_0",hand));
  const forward=middle.sub(wrist).normalize();
  const knuckles=index.clone().sub(little);
  const y=knuckles.addScaledVector(forward,-knuckles.dot(forward)).normalize();
  const facing=new THREE.Vector3(0,0,1).applyQuaternion(
    model.human.spike.character.root.getWorldQuaternion(new THREE.Quaternion()));
  const z=facing.addScaledVector(y,-facing.dot(y)).normalize();
  const x=y.clone().cross(z).normalize();
  z.crossVectors(x,y).normalize();
  if(y.lengthSq()<.9||x.lengthSq()<.9||z.lengthSq()<.9)
    throw new Error("Degenerate calibrated bow-hand frame");
  // +Y follows the actual source knuckle line, never an invented socket Euler.
  const center=fitHandleCenter(model,hand,twoHandGripContactWorld(model,hand),
    x,y,z,radius,length);
  return new THREE.Matrix4().makeBasis(x,y,z).setPosition(center);
}
export interface ArcheryPoseResult {
  readonly reachable:boolean;
  readonly reason:"ok"|"bow-unreachable"|"draw-unreachable"|"body-intersection";
  readonly hand:HandSide;
  readonly state:ArcheryState;
  readonly commands:readonly JointTarget[];
  readonly iterations:number;
  readonly solverAttempts:number;
  readonly bowHandErrorMeters:number;
  readonly bowSkinContact:readonly SourceCylinderRegion[];
  readonly drawHandErrorMeters:number;
  readonly bodyClearanceMeters:number;
  readonly drawMeters:number;
  readonly actualDrawFraction:number;
  readonly bowWorld:THREE.Matrix4;
  readonly nockWorld:THREE.Vector3;
  readonly drawContactWorld:THREE.Vector3;
  readonly arrowDirectionWorld:THREE.Vector3;
  readonly descriptor:BowReferenceV1;
}
export function archeryDrawFraction(state:ArcheryState,value:number):number{
  if(!Number.isFinite(value)||value<0||value>1)throw new Error("Invalid archery draw");
  return state==="rest"||state==="release"?0:
    state==="nock"?.08:state==="partial"?value*.65:value;
}
export function solveArcheryPose(model:StudioHumanModel,fk:AnatomicalFK,
  base:readonly JointTarget[],hand:HandSide,state:ArcheryState,
  draw=1):ArcheryPoseResult{
  if(!Object.hasOwn(ARCHERY_STATES,state)||!["left","right"].includes(hand))
    throw new Error("Unknown archery pose");
  const root=model.human.spike.character.root;
  root.updateWorldMatrix(true,true);
  const rootMatrix=root.matrixWorld.clone();
  fk.apply(base);
  const head=at(bone(model,"head",hand));
  const ankle=at(bone(model,"ankle_left","left"));
  const scale=THREE.MathUtils.clamp((head.y-ankle.y+.13)/1.75,.4,1.2);
  const chest=at(bone(model,"chest",hand));
  const orientation=root.getWorldQuaternion(new THREE.Quaternion());
  const right=new THREE.Vector3(1,0,0).applyQuaternion(orientation);
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(orientation);
  const up=new THREE.Vector3(0,1,0).applyQuaternion(orientation);
  const fingers=merge(base,[
    ...digitCommands(model,fk,hand,false),
    ...digitCommands(model,fk,oppositeHand(hand),true),
  ]);
  fk.apply(fingers);
  const bowTarget=chest.clone().addScaledVector(right,(hand==="right"?1:-1)*.12*scale)
    .addScaledVector(forward,.56*scale).addScaledVector(up,.06*scale);
  const held=fitArm(model,fk,fingers,hand,bowTarget,false,scale);
  let staged:readonly JointTarget[]=held.commands;
  const width=at(bone(model,"finger_index_0",hand)).distanceTo(
    at(bone(model,"finger_little_0",hand)));
  const drawSide=oppositeHand(hand);
  const socket=model.human.spike.graph.sockets.find(s=>s.purpose==="primary_grip"&&
    s.parentJointId===scoped(model,"palm",hand)?.id);
  if(!socket)throw new Error("Missing source bow-hand grip socket");
  const descriptor:BowReferenceV1=Object.freeze({
    schemaVersion:1,id:"bow/"+hand,kind:"bow",hand,socketId:socket.id,
    limbLengthMeters:.64*scale,
    handleRadiusMeters:THREE.MathUtils.clamp(width/8,.003,.014),
    handleLengthMeters:THREE.MathUtils.clamp(width*1.45,.038,.18),
    arrowLengthMeters:.70*scale,stringRestMeters:.07*scale,
    maximumDrawMeters:.28*scale,
  });
  validateBowReference(descriptor,model.human.spike.graph);
  const initialWorld=bowFrame(model,hand,descriptor.handleRadiusMeters,
    descriptor.handleLengthMeters);
  const handFit=fitBowHandContact(model,fk,staged,hand,initialWorld,
    descriptor.handleRadiusMeters,descriptor.handleLengthMeters);
  staged=handFit.commands;
  fk.apply(staged);
  const world=handFit.bowWorld;
  const fraction=archeryDrawFraction(state,draw);
  // Pull travels along the bow's own forward axis. Bound its world target
  // by occupied torso space before any arm IK, never by moving the avatar.
  const collisions=new StudioBodyCollision(model);
  const localNock=new THREE.Vector3(0,0,-descriptor.stringRestMeters-
    descriptor.maximumDrawMeters*fraction);
  let target=localNock.clone().applyMatrix4(world);
  if(fraction>0){
    const local=world.clone().invert();
    for(let i=0;i<10&&collisions.clearance(target)<.025*scale;i++){
      localNock.z+=.018*scale;
      target=localNock.clone().applyMatrix4(world);
    }
  }
  let completed:readonly JointTarget[]=staged;
  let drawError=0,drawClearance=Infinity,drawIterations=0,drawAttempts=0;
  let contact=target.clone();
  let solvedWorld=world.clone();
  const bowOffset=model.human.spike.character.socketWorld(socket.id)
    .invert().multiply(world);
  if(state!=="rest"&&state!=="release"){
    // One shared optimization moves BOTH arm chains against one moving bow
    // frame. The primary handle stays socket-anchored; its motion changes the
    // actual secondary string goal. Independent arm solutions could never
    // close the historical 166mm discrepancy at the physical string.
    const freedoms=[
      ...contactArmFreedoms(model.human.spike.graph,fk,hand),
      ...contactArmFreedoms(model.human.spike.graph,fk,drawSide),
    ];
    const stagedMap=new Map(staged.map(v=>[v.jointId+"/"+v.motion,v.radians]));
    const initial=freedoms.map(f=>stagedMap.get(f.jointId+"/"+f.motion)??0);
    const signed=drawSide==="right"?1:-1;
    const drawSeeds=[
      [0,0,.48,.29,.86*signed,1.40,0,-.06,0],
      [0,0,.16,.88,-.80*signed,1.58,0,-.12,0],
      [0,0,-.12,.62,-1.45*signed,1.95,0,-.20,0],
      [0,0,.62,.48,-1.10*signed,1.24,0,.16,0],
    ];
    const elbow=bone(model,"elbow_"+drawSide,drawSide);
    const wrist=bone(model,"wrist_"+drawSide,drawSide);
    const dynamicBow=()=>model.human.spike.character.socketWorld(socket.id)
      .multiply(bowOffset);
    let best:{commands:readonly JointTarget[];world:THREE.Matrix4;
      contact:THREE.Vector3;error:number;clearance:number;cost:number;
      iterations:number}|undefined;
    for(const angles of drawSeeds){
      const seed=clampContactSeed([
        ...initial.slice(0,9),...angles],freedoms);
      const commands=(values:readonly number[])=>
        composeContactPose(staged,freedoms,values);
      const evaluate=(values:readonly number[])=>{
        fk.apply(commands(values));
        const actualBow=dynamicBow();
        const goal=localNock.clone().applyMatrix4(actualBow);
        const finger=drawingFingerContactWorld(model,drawSide);
        const bowGrip=twoHandGripContactWorld(model,hand);
        const elbowMid=at(elbow).lerp(at(wrist),.5);
        return [
          // The arrow/string and the source finger hook share one goal.
          finger.x-goal.x,finger.y-goal.y,finger.z-goal.z,
          // Keep the holding arm close to the authored reachable stance.
          (bowGrip.x-bowTarget.x)*.7,(bowGrip.y-bowTarget.y)*.7,
          (bowGrip.z-bowTarget.z)*.7,
          Math.max(0,.018*scale-collisions.clearance(elbowMid))*1.5,
          Math.max(0,.012*scale-collisions.clearance(finger))*1.5,
          ...values.map((v,i)=>(v-seed[i]!)*.002),
        ];
      };
      const fit=solveContactConstraints(seed,freedoms,evaluate,32);
      const candidate=commands(fit.values);
      fk.apply(candidate);
      const actualBow=dynamicBow();
      const finger=drawingFingerContactWorld(model,drawSide);
      const goal=localNock.clone().applyMatrix4(actualBow);
      const error=finger.distanceTo(goal);
      const clearance=Math.min(
        collisions.clearance(at(elbow).lerp(at(wrist),.5)),
        collisions.clearance(finger));
      const bowDisplacement=twoHandGripContactWorld(model,hand)
        .distanceTo(bowTarget);
      const cost=error+Math.max(0,.01*scale-clearance)*2+
        Math.max(0,bowDisplacement-.06*scale)*.5;
      drawAttempts++;
      drawIterations=Math.max(drawIterations,fit.iterations);
      if(!best||cost<best.cost)best={
        commands:candidate,world:actualBow,contact:finger,
        error,clearance,cost,iterations:fit.iterations,
      };
      if(error<.008*scale&&clearance>0)break;
    }
    if(!best)throw new Error("Missing legal coupled archery candidate");
    completed=best.commands;
    fk.apply(completed);
    solvedWorld=dynamicBow();
    target=localNock.clone().applyMatrix4(solvedWorld);
    contact=drawingFingerContactWorld(model,drawSide);
    drawError=contact.distanceTo(target);
    drawClearance=best.clearance;
    drawIterations=best.iterations;
  }
  const unsafe=collisions.clearance(contact)<-.015*scale;
  const bowError=twoHandGripContactWorld(model,hand).distanceTo(bowTarget);
  const reachable=handFit.accepted&&bowError<.10*scale&&held.clearance>-.027*scale&&
    ((state==="rest"||state==="release")||
      drawError<.03*scale&&drawClearance>-.025*scale)&&!unsafe;
  // Restoring the original source pose on failure avoids broken IK, facial
  // clipping, and a weapon hovering on a disconnected hand.
  if(!reachable)fk.apply(base);
  if(!root.matrixWorld.equals(rootMatrix))
    throw new Error("Archery IK must not move character root");
  const nock=(state==="rest"||state==="release"?
    new THREE.Vector3(0,0,-descriptor.stringRestMeters).applyMatrix4(solvedWorld):
    target.clone());
  const z=new THREE.Vector3(0,0,1).transformDirection(solvedWorld);
  const resolved=solvedWorld.clone().invert();
  const contactLocal=contact.clone().applyMatrix4(resolved);
  return Object.freeze({
    reachable,reason:!handFit.accepted||bowError>=.10*scale?"bow-unreachable":
      state!=="rest"&&state!=="release"&&drawError>=.03*scale?"draw-unreachable":
      unsafe||held.clearance<=-.027*scale||
      state!=="rest"&&state!=="release"&&drawClearance<=-.025*scale?"body-intersection":"ok",
    hand,state,commands:Object.freeze(reachable?completed:base.slice()),
    iterations:held.iterations+drawIterations,solverAttempts:held.attempts+drawAttempts,
    bowHandErrorMeters:bowError,bowSkinContact:handFit.samples,drawHandErrorMeters:drawError,
    bodyClearanceMeters:Math.min(held.clearance,drawClearance,
      collisions.clearance(nock)),drawMeters:Math.max(0,
      -contactLocal.z-descriptor.stringRestMeters),
    actualDrawFraction:Math.max(0,Math.min(1,
      (-contactLocal.z-descriptor.stringRestMeters)/descriptor.maximumDrawMeters)),
    bowWorld:solvedWorld,nockWorld:nock,drawContactWorld:contact,
    arrowDirectionWorld:z,descriptor,
  });
}
/** Independent final inspection against the posed source-skinned fingers.
 * The bounded IK residual uses anatomical joint landmarks for performance;
 * only this final diagnostic evaluates actual MakeHuman source skin. The
 * string is the two real segments in the bow descriptor (not a free target).
 * An empty candidate set is invalid rather than silently reporting contact. */
export interface StringSkinGap {
  readonly digit:"index"|"middle"|"ring";
  readonly skinVertices:number;
  readonly nearestGapMeters:number;
}
export function measureStringFingerSkin(model:StudioHumanModel,
  hand:HandSide,result:ArcheryPoseResult):readonly StringSkinGap[]{
  const {mesh,spike,template}=model.human;
  spike.character.root.updateWorldMatrix(true,true);
  mesh.updateWorldMatrix(true,false);
  const pos=mesh.geometry.getAttribute("skinIndex");
  const weights=mesh.geometry.getAttribute("skinWeight");
  const scale=result.descriptor.limbLengthMeters/.64;
  const start=result.nockWorld;
  const tips=[-1,1].map(sign=>
    new THREE.Vector3(0,sign*result.descriptor.limbLengthMeters,
      -result.descriptor.stringRestMeters).applyMatrix4(result.bowWorld));
  const lines=tips.map(tip=>new THREE.Line3(start,tip));
  const indices=new Map((["index","middle","ring"] as const).map(digit=>[
    digit,new Set(spike.graph.joints.filter(j=>j.role.startsWith("finger_"+digit+"_")&&
      j.id.includes("arm["+hand+",0]")).map(j=>
      spike.skeleton.bones.indexOf(spike.bones.get(j.id)!))),
  ]));
  const found=new Map<"index"|"middle"|"ring",
    {count:number;gap:number}>();
  for(const digit of indices.keys())found.set(digit,{count:0,gap:Infinity});
  const unique=new Set<number>();
  const world=new THREE.Vector3(),near=new THREE.Vector3();
  for(let i=0;i<pos.count;i++){
    const source=template.sourceVertexIds[i]??i;
    if(unique.has(source))continue;
    unique.add(source);
    const eligible=(["index","middle","ring"] as const).filter(digit=>{
      let influence=0;
      for(let k=0;k<4;k++)
        if(indices.get(digit)!.has(pos.getComponent(i,k)))
          influence+=weights.getComponent(i,k);
      return influence>=.6;
    });
    if(!eligible.length)continue;
    mesh.getVertexPosition(i,world).applyMatrix4(mesh.matrixWorld);
    if(world.distanceTo(start)>.10*scale)continue;
    let nearest=Infinity;
    for(const line of lines){
      line.closestPointToPoint(world,true,near);
      nearest=Math.min(nearest,world.distanceTo(near));
    }
    const gap=Math.max(0,nearest-.0018*scale);
    for(const digit of eligible){
      const record=found.get(digit)!;
      record.count++;
      record.gap=Math.min(record.gap,gap);
    }
  }
  return Object.freeze((["index","middle","ring"] as const).map(digit=>{
    const sample=found.get(digit)!;
    return Object.freeze({digit,skinVertices:sample.count,
      nearestGapMeters:sample.gap});
  }));
}
function segment(a:THREE.Vector3,b:THREE.Vector3,r:number,mat:THREE.Material){
  const d=b.clone().sub(a);
  const obj=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),8),mat);
  obj.position.copy(a).add(b).multiplyScalar(.5);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  obj.castShadow=true;
  return obj;
}
/** One disposable, replaceable reference asset. The entire hierarchy is in
 * bow local coordinates; neither render nor UI callbacks launch a projectile. */
export class StudioBowPreview {
  readonly descriptor:BowReferenceV1;
  readonly object:THREE.Group=new THREE.Group();
  readonly nockLocal:THREE.Vector3;
  readonly tipLocal:THREE.Vector3;
  private readonly socketOffset:THREE.Matrix4;
  constructor(private readonly model:StudioHumanModel,readonly result:ArcheryPoseResult){
    if(!result.reachable)throw new Error("Unreachable source-skinned bow pose");
    this.descriptor=result.descriptor;
    const d=result.descriptor;
    this.object.name="StudioBowPreview";
    const wood=new THREE.MeshStandardMaterial({color:0x805336,roughness:.67});
    const grip=new THREE.MeshStandardMaterial({color:0x392820,roughness:.9});
    const gold=new THREE.MeshStandardMaterial({color:0xc5a46b,metalness:.6,roughness:.36});
    const string=new THREE.MeshStandardMaterial({color:0xe7d8b0,roughness:.95});
    const shaft=new THREE.MeshStandardMaterial({color:0xb38b55,roughness:.75});
    const steel=new THREE.MeshStandardMaterial({color:0xd4dbe0,metalness:.7,roughness:.28});
    const feather=new THREE.MeshStandardMaterial({color:0xe6e0c7,side:THREE.DoubleSide});
    const factor=d.limbLengthMeters/.64;
    const handle=new THREE.Mesh(new THREE.CylinderGeometry(
      d.handleRadiusMeters,d.handleRadiusMeters,d.handleLengthMeters,12),grip);
    handle.name="BowHandle";this.object.add(handle);
    const top=new THREE.Vector3(0,d.limbLengthMeters,-d.stringRestMeters);
    const bottom=new THREE.Vector3(0,-d.limbLengthMeters,-d.stringRestMeters);
    for(const sign of [-1,1]){
      const curve=new THREE.CatmullRomCurve3([
        new THREE.Vector3(0,sign*d.handleLengthMeters*.45,.012*factor),
        new THREE.Vector3(-.055*factor,sign*.21*factor,.09*factor),
        new THREE.Vector3(-.11*factor,sign*.44*factor,.075*factor),
        new THREE.Vector3(0,sign*d.limbLengthMeters,-d.stringRestMeters),
      ]);
      const limb=new THREE.Mesh(new THREE.TubeGeometry(curve,18,
        .013*factor,8,false),wood);
      limb.name=sign===1?"UpperBowLimb":"LowerBowLimb";
      this.object.add(limb);
      const cap=new THREE.Mesh(new THREE.SphereGeometry(.019*factor,10,8),gold);
      cap.position.copy(sign===1?top:bottom);
      this.object.add(cap);
    }
    const local=result.nockWorld.clone().applyMatrix4(result.bowWorld.clone().invert());
    // Clamp the string center to a stable axis at supported contact tolerance;
    // errors outside this range are handled as unreachable by the IK result.
    this.nockLocal=local;
    for(const tip of [top,bottom]){
      const stringMesh=segment(tip,local,.0018*factor,string);
      stringMesh.name="BowString";
      this.object.add(stringMesh);
    }
    this.tipLocal=local.clone().add(new THREE.Vector3(0,0,d.arrowLengthMeters));
    if(result.state!=="rest"&&result.state!=="release"){
      const nock=local.clone();
      const arrowTip=this.tipLocal;
      const arrow=segment(nock.clone().addScaledVector(
        new THREE.Vector3(0,0,1),.025*factor),
        arrowTip.clone().addScaledVector(new THREE.Vector3(0,0,1),-.045*factor),
        .006*factor,shaft);
      arrow.name="NockedArrowShaft";
      this.object.add(arrow);
      const tip=new THREE.Mesh(new THREE.ConeGeometry(.016*factor,.065*factor,6),steel);
      tip.rotation.x=Math.PI/2;tip.position.copy(arrowTip).addScaledVector(
        new THREE.Vector3(0,0,1),-.0325*factor);
      tip.name="NockedArrowTip";this.object.add(tip);
      const nockCap=new THREE.Mesh(new THREE.SphereGeometry(.008*factor,8,6),gold);
      nockCap.position.copy(nock);nockCap.name="ArrowNock";this.object.add(nockCap);
      for(let i=0;i<3;i++){
        const vane=new THREE.Mesh(new THREE.PlaneGeometry(.037*factor,.1*factor),feather);
        vane.rotation.set(Math.PI/2,0,i*Math.PI*2/3);
        vane.position.copy(nock).add(new THREE.Vector3(0,0,.105*factor));
        vane.name="ArrowFletching"+i;this.object.add(vane);
      }
    }
    this.socketOffset=model.human.spike.character.socketWorld(d.socketId)
      .invert().multiply(result.bowWorld);
    this.update();
  }
  update():void{
    this.object.matrixAutoUpdate=false;
    this.object.matrix.multiplyMatrices(this.model.human.spike.character
      .socketWorld(this.descriptor.socketId),this.socketOffset);
    this.object.matrixWorldNeedsUpdate=true;
  }
  dispose():void{
    this.object.removeFromParent();
    const geometries=new Set<THREE.BufferGeometry>();
    const materials=new Set<THREE.Material>();
    this.object.traverse(o=>{
      if(o instanceof THREE.Mesh){
        geometries.add(o.geometry);
        for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);
      }
    });
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
    this.object.clear();
  }
}
