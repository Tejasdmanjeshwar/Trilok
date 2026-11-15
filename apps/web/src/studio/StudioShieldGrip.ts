import * as THREE from "three";
import type {AnatomicalGraphV1} from "@trilok/character-core";
import type {AnatomicalFK,AnatomicalMotion,JointTarget} from "../characters/geometry/AnatomicalFK";
import type {StudioHumanModel} from "./StudioHumanModel";
import {fitConstrainedIK} from "./ConstrainedIK";
import {StudioBodyCollision} from "./StudioBodyCollision";
import {fitHandleCenter} from "./StudioWeaponGrip";

export type ShieldHand="left"|"right";
export type ShieldStance="guard"|"attack-ready"|"parry";
export type SwordShieldEquipment="sword-shield-left"|"sword-shield-right";
export const isSwordShieldEquipment=(mode:string):mode is SwordShieldEquipment=>
  mode==="sword-shield-left"||mode==="sword-shield-right";
export const shieldHand=(sword:ShieldHand):ShieldHand=>sword==="right"?"left":"right";

/** Metadata only: all lengths are meters, contact points are source-derived.
 * Asset-relative frames do not belong to the combat/recipe domains. */
export interface ShieldAttachmentV1 {
  readonly schemaVersion:1;
  readonly kind:"forearm-shield";
  readonly id:string;
  readonly hand:ShieldHand;
  readonly socketId:string;
  readonly gripSocketId:string;
  readonly lengthMeters:number;
  readonly widthMeters:number;
  readonly thicknessMeters:number;
  readonly gripRadiusMeters:number;
  readonly gripLengthMeters:number;
  readonly strapPositions:readonly [number,number];
}
export function validateShieldAttachment(value:ShieldAttachmentV1,graph:AnatomicalGraphV1):void {
  if(value.schemaVersion!==1||value.kind!=="forearm-shield"||
    !/^shield\/arm\[(left|right),\d+\]$/.test(value.id)||
    !["left","right"].includes(value.hand)||
    ![value.lengthMeters,value.widthMeters,value.thicknessMeters,
      value.gripRadiusMeters,value.gripLengthMeters,...value.strapPositions].every(Number.isFinite)||
    value.lengthMeters<.10||value.lengthMeters>.85||
    value.widthMeters<.06||value.widthMeters>.60||
    value.thicknessMeters<=0||value.thicknessMeters>.04||
    value.gripRadiusMeters<.003||value.gripRadiusMeters>.04||
    value.gripLengthMeters<.03||value.gripLengthMeters>.26||
    value.strapPositions.length!==2||value.strapPositions[0]<.1||
    value.strapPositions[1]>.9||value.strapPositions[0]>=value.strapPositions[1])
    throw new Error("Invalid shield attachment descriptor");
  const socket=graph.sockets.find(s=>s.id===value.socketId);
  const grip=graph.sockets.find(s=>s.id===value.gripSocketId);
  const owner=(id:string)=>graph.joints.find(j=>j.id===id);
  if(!socket||!grip||!["primary_grip","shield"].includes(socket.purpose)||
    grip.purpose!=="primary_grip"||
    owner(socket.parentJointId)?.role!=="palm_"+value.hand||
    owner(grip.parentJointId)?.role!=="palm_"+value.hand||
    !socket.parentJointId.includes("arm["+value.hand+",")||
    !grip.parentJointId.includes("arm["+value.hand+","))
    throw new Error("Shield socket does not belong to its gripping hand");
}

const roleBone=(model:StudioHumanModel,role:string,side:ShieldHand):THREE.Bone=>{
  const joint=model.human.spike.graph.joints.find(j=>j.role===role&&
    (!role.startsWith("finger_")||j.id.includes("arm["+side+",0]")));
  const bone=joint&&model.human.spike.bones.get(joint.id);
  if(!bone)throw new Error("Missing source shield landmark "+role);
  return bone;
};
const at=(bone:THREE.Bone)=>bone.getWorldPosition(new THREE.Vector3());
const axisFrame=(model:StudioHumanModel,hand:ShieldHand)=>{
  const wrist=at(roleBone(model,"wrist_"+hand,hand));
  const elbow=at(roleBone(model,"elbow_"+hand,hand));
  const index=at(roleBone(model,"finger_index_0",hand));
  const little=at(roleBone(model,"finger_little_0",hand));
  const palm=at(roleBone(model,"palm_"+hand,hand));
  const up=wrist.clone().sub(elbow).normalize();
  const root=model.human.spike.character.root;
  const outward=new THREE.Vector3(0,0,1)
    .applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
  outward.addScaledVector(up,-outward.dot(up));
  if(outward.lengthSq()<.05)outward.set(hand==="left"?-1:1,0,0);
  outward.normalize();
  const across=up.clone().cross(outward).normalize();
  const forward=outward.clone().cross(across).normalize();
  const knuckles=index.clone().sub(little);
  const handle=knuckles.clone().addScaledVector(forward,-knuckles.dot(forward)).normalize();
  return {elbow,wrist,palm,up:forward,across,normal:outward,
    handleAxis:handle,forearmLength:elbow.distanceTo(wrist),
    handWidth:index.distanceTo(little)};
};

interface SkinSample {readonly point:THREE.Vector3;readonly influence:number;}
/** CPU skinning against the CURRENT MakeHuman mesh; source vertex IDs suppress UV
 * duplicates. Recalculated only on equip/pose/regeneration, never per frame. */
function sampleSkin(model:StudioHumanModel,hand:ShieldHand,kind:"forearm"|"hand"):
  readonly SkinSample[]{
  const {spike,mesh,template}=model.human;
  spike.character.root.updateWorldMatrix(true,true);
  mesh.updateWorldMatrix(true,false);
  const owners=new Set<number>();
  for(const joint of spike.graph.joints){
    const arm=joint.id.includes("arm["+hand+",0]");
    const owns=kind==="forearm"?
      ["elbow_"+hand,"wrist_"+hand].includes(joint.role):
      joint.role==="palm_"+hand||arm&&joint.role.startsWith("finger_");
    if(owns){
      const bone=spike.bones.get(joint.id);
      const id=bone?spike.skeleton.bones.indexOf(bone):-1;
      if(id>=0)owners.add(id);
    }
  }
  if(!owners.size)throw new Error("Missing shield source skin weights");
  const indices=mesh.geometry.getAttribute("skinIndex");
  const weights=mesh.geometry.getAttribute("skinWeight");
  const visited=new Set<number>();
  const results:SkinSample[]=[];
  for(let i=0;i<indices.count;i++){
    const source=template.sourceVertexIds[i]??i;
    if(visited.has(source))continue;
    visited.add(source);
    let influence=0;
    for(let k=0;k<4;k++)if(owners.has(indices.getComponent(i,k)))
      influence+=weights.getComponent(i,k);
    if(influence<.52)continue;
    results.push({point:mesh.getVertexPosition(i,new THREE.Vector3())
      .applyMatrix4(mesh.matrixWorld),influence});
  }
  if(results.length<30)throw new Error("Incomplete source skin for shield fitting");
  return results;
}
export interface ShieldPoseResult {
  readonly reachable:boolean;
  readonly commands:readonly JointTarget[];
  readonly iterations:number;
  readonly wristErrorMeters:number;
  readonly minimumBodyClearanceMeters:number;
}
/** Independent offhand optimization with the SAME calibrated FK freedom
 * limits and bounded DLS solver used by two-hand weapons. No world-root motion,
 * gameplay event, or second rig. The torso envelope comes from actual skin. */
export function solveShieldPose(model:StudioHumanModel,fk:AnatomicalFK,
  base:readonly JointTarget[],hand:ShieldHand,stance:ShieldStance):ShieldPoseResult{
  const graph=model.human.spike.graph;
  const collisions=new StudioBodyCollision(model);
  const state=new Map(base.map(c=>[c.jointId+"/"+c.motion,c]));
  const freedomNames:readonly (readonly [string,readonly AnatomicalMotion[]])[]=[
    ["clavicle",["abduction","flexion"]],
    ["shoulder",["abduction","flexion","rotation"]],
    ["elbow",["flexion","rotation"]],
    ["wrist",["flexion","abduction"]],
  ];
  const axes:{jointId:string;motion:AnatomicalMotion;min:number;max:number}[]=[];
  const poseValues:Readonly<Record<ShieldStance,
    {abduct:number;raise:number;roll:number;bend:number;twist:number}>>={
    guard:{abduct:.74,raise:.30,roll:.55,bend:1.12,twist:.05},
    "attack-ready":{abduct:.60,raise:.17,roll:.65,bend:.92,twist:.04},
    parry:{abduct:.82,raise:.48,roll:.53,bend:1.36,twist:.10},
  };
  const p=poseValues[stance];
  if(!p)throw new Error("Unsupported shield preview stance");
  const signed=hand==="right"?1:-1;
  const seedValues=[0,0,p.abduct,p.raise,p.roll*signed,p.bend,
    p.twist*signed,-.10,0];
  const initial:number[]=[];
  let index=0;
  for(const [part,motions] of freedomNames){
    const j=graph.joints.find(j=>j.role===part+"_"+hand);
    if(!j)throw new Error("Missing shield arm joint "+part);
    for(const motion of motions){
      const limit=fk.frames.get(j.id)?.freedoms.get(motion);
      if(!limit)throw new Error("Missing shield anatomical freedom "+part+"/"+motion);
      axes.push({jointId:j.id,motion,min:limit.min,max:limit.max});
      initial.push(THREE.MathUtils.clamp(seedValues[index++]!,limit.min,limit.max));
    }
  }
  const combine=(values:readonly number[]):JointTarget[]=>{
    const combined=new Map(state);
    axes.forEach((a,i)=>combined.set(a.jointId+"/"+a.motion,
      {jointId:a.jointId,motion:a.motion,radians:values[i]!}));
    return [...combined.values()];
  };
  const stage=combine(initial);
  fk.apply(stage);
  const root=model.human.spike.character.root;
  root.updateWorldMatrix(true,true);
  const chest=at(roleBone(model,"chest",hand));
  const elbow=at(roleBone(model,"elbow_"+hand,hand));
  const wrist=at(roleBone(model,"wrist_"+hand,hand));
  const measure=Math.max(.4,Math.min(1.3,elbow.distanceTo(wrist)/.26));
  const right=new THREE.Vector3(1,0,0)
    .applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
  const front=new THREE.Vector3(0,0,1)
    .applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
  const target=chest.clone().addScaledVector(right,signed*.31*measure)
    .addScaledVector(front,(stance==="parry"?.34:.26)*measure)
    .add(new THREE.Vector3(0,(stance==="parry"?.01:-.14)*measure,0));
  // Real occupied torso volume determines how far out an independently
  // controlled shield arm must travel, including unusually large bellies.
  for(let i=0;i<12&&collisions.clearance(target)<.065*measure;i++)
    target.addScaledVector(right,signed*.035*measure);
  const wristBone=roleBone(model,"wrist_"+hand,hand);
  const elbowBone=roleBone(model,"elbow_"+hand,hand);
  const residual=(values:readonly number[])=>{
    fk.apply(combine(values));
    const w=at(wristBone),e=at(elbowBone);
    const bodyW=collisions.clearance(w);
    const middle=e.clone().lerp(w,.50);
    const bodyMiddle=collisions.clearance(middle);
    return [
      w.x-target.x,w.y-target.y,w.z-target.z,
      Math.max(0,.032*measure-bodyW)*2,
      Math.max(0,.025*measure-bodyMiddle)*2,
      ...values.map((v,i)=>(v-initial[i]!)*.007),
    ];
  };
  const fit=fitConstrainedIK(initial,axes,residual,32);
  const commands=Object.freeze(combine(fit.values));
  fk.apply(commands);
  const w=at(wristBone),e=at(elbowBone);
  const clearance=Math.min(collisions.clearance(w),
    collisions.clearance(e.clone().lerp(w,.5)));
  const distance=w.distanceTo(target);
  const reachable=distance<.15*measure&&clearance>-.008*measure;
  return Object.freeze({reachable,commands,
    iterations:fit.iterations,wristErrorMeters:distance,
    minimumBodyClearanceMeters:clearance});
}
export interface ShieldContactReport {
  readonly gripGapMeters:number;
  readonly forearmStrapClearanceMeters:readonly [number,number];
  readonly plateSkinClearanceMeters:number;
  readonly torsoClearanceMeters:number;
  readonly sourceHandVertices:number;
  readonly sourceForearmVertices:number;
}
const material=(color:number,metalness:number,roughness:number)=>
  new THREE.MeshStandardMaterial({color,metalness,roughness,side:THREE.DoubleSide});
const lineMesh=(from:THREE.Vector3,to:THREE.Vector3,radius:number,
  mat:THREE.Material):THREE.Mesh=>{
  const direction=to.clone().sub(from);
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,
    direction.length(),9),mat);
  mesh.position.copy(from).add(to).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  return mesh;
};
const ownedDispose=(group:THREE.Group):void=>{
  group.removeFromParent();
  const materials=new Set<THREE.Material>();
  group.traverse(node=>{
    if(node instanceof THREE.Mesh){
      node.geometry.dispose();
      for(const m of Array.isArray(node.material)?node.material:[node.material])
        materials.add(m);
    }
  });
  materials.forEach(m=>m.dispose());
  group.clear();
};
/** Actual forearm is INSIDE the rear strap loops, the hand grips a rear
 * handle, and the shield face is OUTSIDE the most anterior skinned hand vertex.
 * All frames follow one source palm socket, independent of the sword socket. */
export class StudioShieldPreview {
  readonly descriptor:ShieldAttachmentV1;
  readonly object:THREE.Group;
  readonly contact:ShieldContactReport;
  private readonly offset:THREE.Matrix4;
  constructor(private readonly model:StudioHumanModel,hand:ShieldHand){
    const {spike}=model.human;
    const frame=axisFrame(model,hand);
    const {forearmLength,handWidth}=frame;
    if(forearmLength<.025||handWidth<.012)
      throw new Error("Unsupported shield limb dimensions");
    const factor=THREE.MathUtils.clamp(forearmLength/.26,.40,1.45);
    const width=THREE.MathUtils.clamp(forearmLength*.89,.095,.43);
    const length=THREE.MathUtils.clamp(forearmLength*1.60,.15,.72);
    const radius=THREE.MathUtils.clamp(handWidth/4.4,.004,.019);
    const gripLength=THREE.MathUtils.clamp(handWidth*1.45,.04,.18);
    const palm=spike.graph.joints.find(j=>j.role==="palm_"+hand&&
      j.id.includes("arm["+hand+",0]"));
    const grip=spike.graph.sockets.find(s=>s.purpose==="primary_grip"&&
      s.parentJointId===palm?.id);
    // The legacy C1 prototype defines a right-side shield socket only.
    // Mirrored equipment uses a validated per-arm palm socket instead.
    const shield=spike.graph.sockets.find(s=>s.purpose==="shield"&&
      s.parentJointId===palm?.id)??grip;
    if(!grip||!shield)throw new Error("Missing mirrored shield grip socket");
    this.descriptor=Object.freeze({
      schemaVersion:1,id:"shield/arm["+hand+",0]",kind:"forearm-shield",
      hand,socketId:shield.id,gripSocketId:grip.id,
      lengthMeters:length,widthMeters:width,thicknessMeters:.012*factor,
      gripRadiusMeters:radius,gripLengthMeters:gripLength,
      strapPositions:Object.freeze([.29,.68] as [number,number]),
    });
    validateShieldAttachment(this.descriptor,spike.graph);
    const forearm=sampleSkin(model,hand,"forearm");
    const fingers=sampleSkin(model,hand,"hand");
    const center=frame.wrist.clone().addScaledVector(frame.up,-forearmLength*.18);
    const toLocal=(p:THREE.Vector3):THREE.Vector3=>{
      const v=p.clone().sub(center);
      return new THREE.Vector3(v.dot(frame.across),v.dot(frame.up),v.dot(frame.normal));
    };
    // Shield face is not a plane through the hand: fit its REAR boundary
    // beyond the morphed source fingers, wrist and forearm for every pose.
    let front=-Infinity;
    for(const s of [...forearm,...fingers]){
      const p=toLocal(s.point);
      if(Math.abs(p.x)<width*.52&&Math.abs(p.y)<length*.53)
        front=Math.max(front,p.z);
    }
    if(!Number.isFinite(front))throw new Error("Missing shield plate skin");
    const collision=new StudioBodyCollision(model);
    const face=center.clone().addScaledVector(frame.normal,front+.016*factor);
    const halfW=width*.45,halfH=length*.45;
    let torso=Infinity;
    for(let i=0;i<12;i++){
      torso=Math.min(...[-1,0,1].flatMap(x=>[-1,0,1].map(y=>
        collision.clearance(face.clone().addScaledVector(frame.across,halfW*x)
          .addScaledVector(frame.up,halfH*y)))));
      if(torso>.008*factor)break;
      face.addScaledVector(frame.normal,.018*factor);
    }
    if(torso<-.003*factor)
      throw new Error("Shield would intersect morphed torso");
    const basis=new THREE.Matrix4().makeBasis(frame.across,frame.up,frame.normal);
    const rotation=new THREE.Quaternion().setFromRotationMatrix(basis);
    const worldMatrix=new THREE.Matrix4().compose(face,rotation,
      new THREE.Vector3(1,1,1));
    const inverse=worldMatrix.clone().invert();
    const local=(point:THREE.Vector3)=>point.clone().applyMatrix4(inverse);
    const graspStart=frame.palm.clone()
      .addScaledVector(frame.normal,.005*factor);
    const gripCenter=fitHandleCenter(model,hand,graspStart,
      frame.up.clone().negate(),frame.handleAxis,frame.normal,
      radius,gripLength);
    const handlePosition=local(gripCenter);
    // Rear handle cannot be within the solid board, even when very large
    // hands push the face outwards. Standoffs always run behind the plate.
    if(handlePosition.z>-.007*factor)
      throw new Error("Shield handle penetrates its own plate");
    const gripDirection=frame.handleAxis.clone()
      .transformDirection(inverse).normalize();
    this.object=new THREE.Group();
    const wood=material(0x674434,.10,.75);
    const iron=material(0xb9bdbe,.80,.29);
    const bronze=material(0xb48b48,.65,.37);
    const leather=material(0x382a22,.08,.85);
    const shape=new THREE.Shape();
    shape.moveTo(-width*.43,length*.43);
    shape.quadraticCurveTo(0,length*.56,width*.43,length*.43);
    shape.lineTo(width*.47,-length*.10);
    shape.quadraticCurveTo(width*.30,-length*.41,0,-length*.52);
    shape.quadraticCurveTo(-width*.30,-length*.41,-width*.47,-length*.10);
    shape.closePath();
    const board=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{
      depth:this.descriptor.thicknessMeters,bevelEnabled:true,
      bevelThickness:.0025*factor,bevelSize:.004*factor,bevelSegments:2,
      curveSegments:12}),wood);
    board.position.z=-this.descriptor.thicknessMeters;
    board.castShadow=true;this.object.add(board);
    const outline=new THREE.Mesh(new THREE.TorusGeometry(1,.006*factor,5,44),bronze);
    outline.scale.set(width*.425,length*.47,1);
    outline.position.z=.004*factor;
    this.object.add(outline);
    const boss=new THREE.Mesh(new THREE.SphereGeometry(width*.13,16,10),iron);
    boss.scale.z=.34;
    boss.position.set(0,length*.10,.01*factor);
    this.object.add(boss);
    // The handle is behind the surface, aligned to the REAL knuckle line,
    // not a rod visible on the boss or passing through the shield face.
    const bar=lineMesh(handlePosition.clone().addScaledVector(gripDirection,-gripLength*.5),
      handlePosition.clone().addScaledVector(gripDirection,gripLength*.5),
      radius,leather);
    this.object.add(bar);
    for(const s of [-1,1]){
      const atEnd=handlePosition.clone().addScaledVector(gripDirection,s*gripLength*.38);
      this.object.add(lineMesh(atEnd,new THREE.Vector3(atEnd.x,atEnd.y,
        -this.descriptor.thicknessMeters-.002*factor),.005*factor,bronze));
    }
    const clearances:number[]=[];
    for(const t of this.descriptor.strapPositions){
      const bonePos=frame.elbow.clone().lerp(frame.wrist,t);
      let r=0;
      const along=frame.wrist.clone().sub(frame.elbow).normalize();
      for(const sample of forearm){
        const v=sample.point.clone().sub(bonePos);
        if(Math.abs(v.dot(along))>forearmLength*.10)continue;
        v.addScaledVector(along,-v.dot(along));
        r=Math.max(r,v.length());
      }
      if(r<.008)throw new Error("No skinned forearm under shield strap");
      const safe=r+.008*factor;
      clearances.push(safe-r);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(safe,.0045*factor,7,28),
        leather);
      ring.rotation.x=Math.PI/2;ring.position.copy(local(bonePos));
      this.object.add(ring);
      const anchor=local(bonePos);
      this.object.add(lineMesh(new THREE.Vector3(anchor.x,anchor.y,
        anchor.z+safe),new THREE.Vector3(anchor.x,anchor.y,
        -this.descriptor.thicknessMeters),.004*factor,bronze));
    }
    let plateGap=Infinity;
    for(const sample of [...forearm,...fingers]){
      const p=local(sample.point);
      if(Math.abs(p.x)<width*.43&&Math.abs(p.y)<length*.42)
        plateGap=Math.min(plateGap,-this.descriptor.thicknessMeters-p.z);
    }
    if(plateGap<-.002*factor)
      throw new Error("Shield face intersects source skin");
    // Measure actual posed digits against the real rear-handle cylinder.
    let gripGap=Infinity;
    for(const sample of fingers){
      const v=sample.point.clone().sub(gripCenter);
      const axial=v.dot(frame.handleAxis);
      if(Math.abs(axial)>gripLength*.55)continue;
      const radial=v.addScaledVector(frame.handleAxis,-axial).length();
      gripGap=Math.min(gripGap,Math.abs(radial-radius));
    }
    this.contact=Object.freeze({
      gripGapMeters:gripGap,
      forearmStrapClearanceMeters:Object.freeze(clearances as [number,number]),
      plateSkinClearanceMeters:plateGap,torsoClearanceMeters:torso,
      sourceHandVertices:fingers.length,sourceForearmVertices:forearm.length,
    });
    this.offset=spike.character.socketWorld(this.descriptor.socketId).invert()
      .multiply(worldMatrix);
    this.update();
  }
  update():void {
    this.object.matrixAutoUpdate=false;
    this.object.matrix.multiplyMatrices(
      this.model.human.spike.character.socketWorld(this.descriptor.socketId),this.offset);
    this.object.matrixWorldNeedsUpdate=true;
  }
  dispose():void{ownedDispose(this.object);}
}
