import * as THREE from "three";
import type {AnatomicalGraphV1} from "@trilok/character-core";
import type {JointTarget,AnatomicalFK} from "../characters/geometry/AnatomicalFK";
import type {StudioHumanModel} from "./StudioHumanModel";

export type SwordHand = "none" | "left" | "right";
export interface WeaponGripV1 {
  readonly schemaVersion:1;
  readonly id:string;
  readonly weaponKind:"sword";
  readonly hand:"left"|"right";
  readonly socketId:string;
  readonly handleRadiusMeters:number;
  readonly handleLengthMeters:number;
}
export function validateWeaponGrip(grip:WeaponGripV1,graph:AnatomicalGraphV1):void {
  if(grip.schemaVersion!==1||grip.weaponKind!=="sword"||
    (grip.hand!=="left"&&grip.hand!=="right")||
    !/^sword\/[a-z]+$/.test(grip.id)||
    !Number.isFinite(grip.handleRadiusMeters)||grip.handleRadiusMeters<=0||
    grip.handleRadiusMeters>.04||
    !Number.isFinite(grip.handleLengthMeters)||grip.handleLengthMeters<.04||
    grip.handleLengthMeters>.22)throw new Error("Invalid sword grip descriptor");
  const socket=graph.sockets.find(s=>s.id===grip.socketId);
  const palm=graph.joints.find(j=>j.id===socket?.parentJointId);
  if(!socket||socket.purpose!=="primary_grip"||
    palm?.role!=="palm_"+grip.hand||
    !socket.id.includes("arm["+grip.hand+","))throw new Error("Grip socket does not belong to hand");
  for(const digit of ["thumb","index","middle","ring","little"]){
    if(!graph.joints.some(j=>j.role==="finger_"+digit+"_0"&&
      j.id.includes("arm["+grip.hand+",")))throw new Error("Missing grip finger "+digit);
  }
}
/** Immutable command overlay on the existing source-calibrated FK; no combat state. */
export interface GripSpreads {
  readonly index:number;
  readonly little:number;
}
/** Determine inward splay from source rest anatomy and actual calibrated
 * abduction frames rather than assuming mirrored Euler signs. */
export function calibrateGripSpreads(graph:AnatomicalGraphV1,
  bones:ReadonlyMap<string,THREE.Bone>,
  frames:AnatomicalFK["frames"],hand:"left"|"right"):GripSpreads {
  const at=(role:string):THREE.Bone=>{
    const joint=graph.joints.find(j=>j.role===role&&
      j.id.includes("arm["+hand+",0]"));
    const bone=joint&&bones.get(joint.id);
    if(!bone)throw new Error("Missing finger spread landmark: "+role);
    return bone;
  };
  const middle=at("finger_middle_1").getWorldPosition(new THREE.Vector3());
  const spread=(digit:"index"|"little")=>{
    const a=at("finger_"+digit+"_0");
    const b=at("finger_"+digit+"_1");
    const p=a.getWorldPosition(new THREE.Vector3());
    const tip=b.getWorldPosition(new THREE.Vector3());
    const frame=frames.get(graph.joints.find(j=>j.role==="finger_"+digit+"_0"&&
      j.id.includes("arm["+hand+",0]"))!.id);
    const freedom=frame?.freedoms.get("abduction");
    if(!freedom)throw new Error("Missing source finger abduction");
    const axis=freedom.axis.clone().applyQuaternion(
      a.getWorldQuaternion(new THREE.Quaternion()));
    const toward=middle.clone().sub(tip);
    const response=axis.cross(tip.clone().sub(p));
    return response.dot(toward)>=0?.20:-.20;
  };
  return {index:spread("index"),little:spread("little")};
}
/** Data-only anatomical contact choices. Rigid cylindrical handles and a
 * three-finger Mediterranean string hook require different digit commands.
 * Each uses the same source MakeHuman finger joints and calibrated FK; this
 * profile layer owns neither arm IK nor attachment/rendering resources. */
export type HandContactProfile="sword-handle"|"bow-handle"|"string-mediterranean";
type DigitAngles=readonly [number,number,number];
type HandGripProfile=Readonly<{
  digits:Readonly<Record<"index"|"middle"|"ring"|"little",DigitAngles>>;
  thumb:readonly [number,number,number];
}>;
export const HAND_CONTACT_PROFILES:Readonly<Record<HandContactProfile,HandGripProfile>>=
  Object.freeze({
    "sword-handle":Object.freeze({
      digits:{index:[1.06,1.32,.65] as const,middle:[1.13,1.36,.72] as const,
        ring:[1.12,1.32,.70] as const,little:[1.03,1.23,.65] as const},
      thumb:[.75,.48,.72] as const,
    }),
    "bow-handle":Object.freeze({
      // Pressure through the thenar eminence and a relaxed four-finger wrap;
      // deliberately not identical to the hilt's tightly closed fist.
      digits:{index:[.79,1.02,.55] as const,middle:[.98,1.22,.67] as const,
        ring:[1.01,1.19,.62] as const,little:[.92,1.08,.59] as const},
      thumb:[.59,.36,.56] as const,
    }),
    "string-mediterranean":Object.freeze({
      // Index above nock, middle/ring below: flex distal joints to hook
      // rather than enclosing a cylinder; the thumb stays alongside the palm.
      digits:{index:[.70,1.16,.84] as const,middle:[.83,1.25,.87] as const,
        ring:[.76,1.17,.78] as const,little:[.15,.16,.10] as const},
      thumb:[.15,.18,.16] as const,
    }),
  });
export function handContactTargets(graph:AnatomicalGraphV1,
  hand:Exclude<SwordHand,"none">,profile:HandContactProfile,
  spreads?:GripSpreads):readonly JointTarget[]{
  const config=HAND_CONTACT_PROFILES[profile];
  const commands:JointTarget[]=[];
  const add=(digit:string,index:number,motion:JointTarget["motion"],radians:number)=>{
    const joint=graph.joints.find(j=>j.role==="finger_"+digit+"_"+index&&
      j.id.includes("arm["+hand+",0]"));
    if(!joint)throw new Error("Contact finger not found: "+digit);
    commands.push({jointId:joint.id,motion,radians});
  };
  for(const digit of ["index","middle","ring","little"] as const){
    const angles=config.digits[digit];
    angles.forEach((angle,index)=>add(digit,index,"flexion",angle));
  }
  if(spreads){
    for(const digit of ["index","little"] as const){
      const angle=spreads[digit];
      if(!Number.isFinite(angle)||Math.abs(angle)>.22)
        throw new Error("Unsupported source grip splay");
      add(digit,0,"abduction",angle);
    }
  }
  add("thumb",0,"opposition",config.thumb[0]);
  add("thumb",0,"flexion",config.thumb[1]);
  add("thumb",1,"flexion",config.thumb[2]);
  return Object.freeze(commands);
}
/** Existing C5.1 contract remains exactly the same; sword/staff/shield keep
 * the previously approved poses and can opt into new profiles explicitly. */
export function swordGripTargets(graph:AnatomicalGraphV1,
  hand:Exclude<SwordHand,"none">,spreads?:GripSpreads):readonly JointTarget[]{
  return handContactTargets(graph,hand,"sword-handle",spreads);
}

const vec=(object:THREE.Object3D)=>object.getWorldPosition(new THREE.Vector3());
function boneFor(model:StudioHumanModel,role:string,hand:"left"|"right"):THREE.Bone {
  const joint=model.human.spike.graph.joints.find(j=>j.role===role&&
    (role.startsWith("finger_")?j.id.includes("arm["+hand+",0]"):true));
  const bone=joint&&model.human.spike.bones.get(joint.id);
  if(!bone)throw new Error("Missing calibrated "+role+" joint");
  return bone;
}
function swordMesh(handleRadius:number,handleLength:number):THREE.Group{
  const group=new THREE.Group();
  const steel=new THREE.MeshStandardMaterial({color:0xc7d6df,metalness:.86,roughness:.27});
  const edge=new THREE.MeshStandardMaterial({color:0xeaf3f7,metalness:.84,roughness:.22});
  const dark=new THREE.MeshStandardMaterial({color:0x28252b,metalness:.33,roughness:.7});
  const brass=new THREE.MeshStandardMaterial({color:0xc59a53,metalness:.67,roughness:.3});
  const make=(geometry:THREE.BufferGeometry,material:THREE.Material,
    x:number,y:number,z:number)=>{
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.set(x,y,z);mesh.castShadow=true;group.add(mesh);return mesh;
  };
  // The visual parts are independently replaceable. +Y runs from pommel to tip.
  make(new THREE.CylinderGeometry(handleRadius,handleRadius*1.08,handleLength,12),dark,
    0,0,0);
  for(const y of [-.5,.5]){
    make(new THREE.CylinderGeometry(handleRadius*1.19,handleRadius*1.19,.009,12),
      brass,0,y*handleLength,0);
  }
  make(new THREE.SphereGeometry(handleRadius*1.7,12,8),brass,
    0,-handleLength*.62,0);
  const guardY=handleLength*.57;
  make(new THREE.BoxGeometry(.145,.018,.024),brass,0,guardY,0);
  for(const x of [-.076,.076]){
    make(new THREE.SphereGeometry(.014,10,8),brass,x,guardY,0);
  }
  const bladeBase=guardY+.014,bladeLength=.62;
  make(new THREE.BoxGeometry(.05,bladeLength,.009),steel,
    0,bladeBase+bladeLength*.5,0);
  make(new THREE.BoxGeometry(.008,bladeLength*.84,.012),edge,
    0,bladeBase+bladeLength*.48,.004);
  const tip=make(new THREE.ConeGeometry(.033,.085,4),steel,
    0,bladeBase+bladeLength+.04,0);
  tip.rotation.y=Math.PI/4;
  return group;
}
/** Bounded, repeatable handle placement against actual posed source skin.
 * The score evaluates all five digits; a bone-angle/fist proxy alone can
 * appear closed while penetrating the reference cylinder. Only runs when
 * selecting/rebuilding the preview, never in render or authoritative combat. */
export function fitHandleCenter(model:StudioHumanModel,hand:"left"|"right",
  center:THREE.Vector3,lateral:THREE.Vector3,along:THREE.Vector3,
  normal:THREE.Vector3,radius:number,length:number):THREE.Vector3 {
  const {mesh,spike}=model.human;
  spike.character.root.updateWorldMatrix(true,true);
  const indices=mesh.geometry.getAttribute("skinIndex");
  const weights=mesh.geometry.getAttribute("skinWeight");
  const samples:number[][][]=[];
  const position=new THREE.Vector3();
  const relative=new THREE.Vector3();
  for(const digit of ["thumb","index","middle","ring","little"]){
    const fingerBones=new Set(spike.graph.joints.filter(j=>
      j.role.startsWith("finger_"+digit+"_")&&
      j.id.includes("arm["+hand+",0]")).map(j=>
      spike.skeleton.bones.indexOf(spike.bones.get(j.id)!)));
    const points:number[][]=[];
    for(let i=0;i<indices.count;i+=2){
      let influence=0;
      for(let k=0;k<4;k++)
        if(fingerBones.has(indices.getComponent(i,k)))
          influence+=weights.getComponent(i,k);
      if(influence<.6)continue;
      mesh.getVertexPosition(i,position).applyMatrix4(mesh.matrixWorld);
      relative.copy(position).sub(center);
      points.push([relative.dot(lateral),relative.dot(along),
        relative.dot(normal)]);
    }
    if(points.length<20)throw new Error("Incomplete source grip surface "+digit);
    samples.push(points);
  }
  const score=(x:number,y:number,z:number):number=>{
    let cost=.2*(x*x+y*y+z*z)/(.01*.01);
    for(const finger of samples){
      let closest=Infinity,deepest=0,near=0;
      for(const sample of finger){
        if(Math.abs(sample[1]!-y)>length*.5+.012)continue;
        near++;
        const radial=Math.hypot(sample[0]!-x,sample[2]!-z);
        closest=Math.min(closest,Math.abs(radial-radius));
        deepest=Math.max(deepest,radius-radial);
      }
      if(near===0)return Infinity;
      const clipping=Math.max(0,deepest-.0015);
      cost+=(closest/.004)**2+3*(clipping/.003)**2;
    }
    return cost;
  };
  let best=[0,0,0] as [number,number,number];
  let bestCost=score(0,0,0);
  // Two fixed-resolution searches, bounded regardless of source vertex count.
  for(const step of [.008,.003]){
    const origin=[...best];
    const extent=step===.008?4:2;
    for(let ix=-extent;ix<=extent;ix++)
      for(let iy=-2;iy<=2;iy++)
        for(let iz=-extent;iz<=extent;iz++){
          const x=step===.008?ix*step:origin[0]!+ix*step;
          const y=step===.008?iy*step:origin[1]!+iy*step;
          const z=step===.008?iz*step:origin[2]!+iz*step;
          if(Math.abs(x)>.04||Math.abs(y)>.025||Math.abs(z)>.04)continue;
          const cost=score(x,y,z);
          if(cost<bestCost-1e-9){
            best=[x,y,z];bestCost=cost;
          }
        }
  }
  return center.clone().addScaledVector(lateral,best[0])
    .addScaledVector(along,best[1]).addScaledVector(normal,best[2]);
}

/** Owns one procedurally generated sword; the calibrated socket frame is the
 * only attachment authority. Retargeting a pose never moves the character root. */
export class StudioSwordPreview {
  readonly descriptor:WeaponGripV1;
  readonly object:THREE.Group;
  private readonly socketOffset:THREE.Matrix4;
  constructor(private readonly model:StudioHumanModel,hand:"left"|"right"){
    const human=model.human;
    human.spike.character.root.updateWorldMatrix(true,true);
    const wrist=vec(boneFor(model,"wrist_"+hand,hand));
    const palm=vec(boneFor(model,"palm_"+hand,hand));
    const middle=vec(boneFor(model,"finger_middle_0",hand));
    const index=vec(boneFor(model,"finger_index_0",hand));
    const little=vec(boneFor(model,"finger_little_0",hand));
    // The handle crosses the closed fingers from little-finger to index.
    // The former wrist-to-middle +Y axis made the *blade* continue through
    // the fingers, so it appeared to grow out of the hand. Calibrate an
    // orthonormal handle frame from the actual posed source hand instead.
    const fingerForward=middle.clone().sub(wrist).normalize();
    const across=index.clone().sub(little).addScaledVector(fingerForward,
      -index.clone().sub(little).dot(fingerForward)).normalize();
    const handleX=fingerForward.clone().negate();
    const handleY=across; // +Y: pommel toward little, blade toward index.
    const handleZ=handleX.clone().cross(handleY).normalize();
    const width=index.distanceTo(little);
    if(!Number.isFinite(width)||width<.012||width>.20||
      fingerForward.lengthSq()<.9||across.lengthSq()<.9||handleZ.lengthSq()<.9)
      throw new Error("Unsupported hand dimensions for sword grip");
    const radius=THREE.MathUtils.clamp(width/4.4,.006,.017);
    // A single-hand hilt spans the knuckles with modest guard/pommel
    // clearance; it is not as long as the wrist-to-fingertip chain.
    const length=THREE.MathUtils.clamp(width*1.45,.06,.14);
    const socket=human.spike.graph.sockets.find(s=>s.purpose==="primary_grip"&&
      human.spike.graph.joints.some(j=>j.id===s.parentJointId&&j.role==="palm_"+hand&&
        j.id.includes("arm["+hand+",0]")));
    if(!socket)throw new Error("Missing source-hand primary grip socket");
    this.descriptor={schemaVersion:1,id:"sword/"+hand,weaponKind:"sword",
      hand,socketId:socket.id,handleRadiusMeters:radius,handleLengthMeters:length};
    validateWeaponGrip(this.descriptor,human.spike.graph);
    const scale=THREE.MathUtils.clamp(width/.062,.55,1.18);
    this.object=swordMesh(radius/scale,length/scale);
    const basis=new THREE.Matrix4().makeBasis(handleX,handleY,handleZ);
    const rotation=new THREE.Quaternion().setFromRotationMatrix(basis);
    const initial=palm.clone().addScaledVector(fingerForward,.012)
      .addScaledVector(handleZ,.006);
    const center=fitHandleCenter(model,hand,initial,handleX,handleY,handleZ,
      radius,length);
    const desired=new THREE.Matrix4().compose(
      center,rotation,new THREE.Vector3(scale,scale,scale));
    this.socketOffset=human.spike.character.socketWorld(socket.id).invert().multiply(desired);
    this.update();
  }
  update():void{
    this.object.matrixAutoUpdate=false;
    this.object.matrix.multiplyMatrices(
      this.model.human.spike.character.socketWorld(this.descriptor.socketId),
      this.socketOffset);
    this.object.matrixWorldNeedsUpdate=true;
  }
  dispose():void{
    this.object.removeFromParent();
    const materials=new Set<THREE.Material>();
    this.object.traverse(obj=>{
      if(obj instanceof THREE.Mesh){
        obj.geometry.dispose();
        const owned=Array.isArray(obj.material)?obj.material:[obj.material];
        for(const material of owned)materials.add(material);
      }
    });
    for(const material of materials)material.dispose();
    this.object.clear();
  }
}
