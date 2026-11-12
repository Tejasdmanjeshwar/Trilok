import * as THREE from "three";
import type { C2Human } from "../runtime/createC2Human";

export type C2StressPose =
  | "neutral" | "t_pose" | "shoulder_raise" | "arms_overhead"
  | "elbow_flex" | "forearm_twist" | "crouch" | "neck_look" | "asymmetry";
export const C2_STRESS_POSES:readonly C2StressPose[]=[
  "neutral","t_pose","shoulder_raise","arms_overhead","elbow_flex",
  "forearm_twist","crouch","neck_look","asymmetry",
];
/** Pose probes only; no gameplay move or authoritative combat clock is modified. */
export function applyC2StressPose(human:C2Human,pose:C2StressPose):void {
  if(!C2_STRESS_POSES.includes(pose))throw new Error("Unknown C2 stress pose");
  for(const joint of human.restGraph.joints){
    const bone=human.bones.get(joint.id)!;
    bone.position.set(...joint.bindTranslation);
    bone.quaternion.set(...joint.bindQuaternion);
  }
  const rotate=(role:string,x:number,y:number,z:number):void=>{
    const joint=human.restGraph.joints.find(j=>j.role===role);
    if(!joint)throw new Error("Missing C2 pose bone "+role);
    human.bones.get(joint.id)!.rotation.set(x,y,z);
  };
  switch(pose) {
    case "neutral":break;
    case "t_pose":rotate("shoulder_left",0,0,-.95);rotate("shoulder_right",0,0,.95);break;
    case "shoulder_raise":rotate("shoulder_left",0,0,-1.4);break;
    case "arms_overhead":rotate("shoulder_left",0,0,-2.2);rotate("shoulder_right",0,0,2.2);break;
    case "elbow_flex":rotate("elbow_left",.15,0,-1.6);rotate("elbow_right",.15,0,1.6);break;
    case "forearm_twist":rotate("wrist_left",0,Math.PI,0);rotate("wrist_right",0,-Math.PI,0);break;
    case "crouch":
      rotate("hip_left",-.8,0,.08);rotate("hip_right",-.8,0,-.08);
      rotate("knee_left",1.3,0,0);rotate("knee_right",1.3,0,0);
      rotate("ankle_left",-.48,0,0);rotate("ankle_right",-.48,0,0);
      break;
    case "neck_look":rotate("neck",-.42,.32,0);break;
    case "asymmetry":rotate("chest",.12,-.25,.16);rotate("shoulder_left",0,0,-.65);break;
  }
  human.character.root.updateWorldMatrix(true,true);
  human.mesh.skeleton.update();
}
export interface PoseSample {
  readonly samples:number;
  readonly maxDisplacementMeters:number;
  readonly invalidSamples:number;
}
/** CPU pose sampling for finite transform/skin regression (not visual approval). */
export function inspectC2Pose(human:C2Human,step=43):PoseSample {
  const buffer=human.mesh.geometry.getAttribute("position");
  const source=new THREE.Vector3(),posed=new THREE.Vector3();
  let samples=0,max=0,invalid=0;
  for(let i=0;i<buffer.count;i+=step){
    source.fromBufferAttribute(buffer,i);
    human.mesh.getVertexPosition(i,posed);
    if(![posed.x,posed.y,posed.z].every(Number.isFinite))invalid++;
    max=Math.max(max,posed.distanceTo(source));samples++;
  }
  if(invalid||!Number.isFinite(max)||max>3.5)
    throw new Error("Invalid C2 pose deformation");
  return {samples,maxDisplacementMeters:max,invalidSamples:invalid};
}
