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

/** Probe local edge stretch in the undeformed anatomical source space.
 * Numerical screening does NOT replace screenshot/deformation inspection.
 */
function inspectRegionEdgeStretch(human:C2Human,
  inRegion:(x:number,y:number,z:number)=>boolean):{
  readonly edges:number;readonly p95Stretch:number;readonly maxStretch:number;
} {
  const positions=human.mesh.geometry.getAttribute("position");
  const indices=human.mesh.geometry.getIndex();
  if(!indices)throw new Error("Indexed anatomical topology required");
  const a=new THREE.Vector3(),b=new THREE.Vector3();
  const pa=new THREE.Vector3(),pb=new THREE.Vector3();
  const observed:number[]=[];
  for(let i=0;i<indices.count;i+=3) {
    const triangle=[
      indices.getX(i),indices.getX(i+1),indices.getX(i+2),
    ];
    for(let e=0;e<3;e++) {
      const ia=triangle[e]!,ib=triangle[(e+1)%3]!;
      a.fromBufferAttribute(positions,ia);
      b.fromBufferAttribute(positions,ib);
      if(!inRegion((a.x+b.x)*.5,(a.y+b.y)*.5,(a.z+b.z)*.5))continue;
      const length=a.distanceTo(b);
      if(length<.0004)continue;
      human.mesh.getVertexPosition(ia,pa);
      human.mesh.getVertexPosition(ib,pb);
      const stretch=pa.distanceTo(pb)/length;
      if(!Number.isFinite(stretch))throw new Error("Nonfinite anatomical edge stretch");
      observed.push(stretch);
    }
  }
  if(!observed.length)throw new Error("Missing anatomical deformation samples");
  observed.sort((a,b)=>a-b);
  return {edges:observed.length,p95Stretch:observed[Math.floor((observed.length-1)*.95)]!,
    maxStretch:observed[observed.length-1]!};
}
/** Crouch hip seam and groin distortion check. */
export function inspectC2HipEdgeStretch(human:C2Human):{
  readonly edges:number;readonly p95Stretch:number;readonly maxStretch:number;
} {
  return inspectRegionEdgeStretch(human,(x,y)=>y>=.73&&y<=1.12&&Math.abs(x)<=.43);
}
/** Detect source A-pose finger/hand vertices stretching into dangling spikes. */
export function inspectC2HandEdgeStretch(human:C2Human):{
  readonly edges:number;readonly p95Stretch:number;readonly maxStretch:number;
} {
  return inspectRegionEdgeStretch(human,(x,y)=>Math.abs(x)>=.33&&
    y>=.60&&y<=1.20);
}
