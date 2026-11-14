import * as THREE from "three";
import type {AnatomicalHuman} from "../characters/geometry/AnatomicalTemplate";
import type {StudioFocus} from "./StudioInspection";

export interface StudioTap {
  readonly x:number;
  readonly y:number;
  readonly time:number;
  readonly pointerType:string;
}

/** Reject orbit/pan gestures before interpreting a tap. */
export function isShortTap(start:StudioTap,end:StudioTap):boolean {
  return start.pointerType===end.pointerType &&
    end.time>=start.time && end.time-start.time<=400 &&
    Math.hypot(end.x-start.x,end.y-start.y)<=12;
}

/** Two deliberate taps at the same screen location, on mouse, pen or touch. */
export function isDoubleTap(first:StudioTap,second:StudioTap):boolean {
  return first.pointerType===second.pointerType &&
    second.time>first.time && second.time-first.time<=380 &&
    Math.hypot(second.x-first.x,second.y-first.y)<=26;
}

/** Preserve the current orbit target and zoom when switching angle presets.
 * The offset is relative to the baseline preset's target, never world origin. */
export function positionForFocusedAngle(
  preset:{readonly position:readonly number[];readonly target:readonly number[]},
  focus:THREE.Vector3,distance:number,
):THREE.Vector3{
  if(!Number.isFinite(distance)||distance<=0)
    throw new Error("Invalid camera distance");
  const direction=new THREE.Vector3(...preset.position)
    .sub(new THREE.Vector3(...preset.target)).normalize();
  if(direction.lengthSq()<1e-10)throw new Error("Invalid camera preset direction");
  return focus.clone().addScaledVector(direction,distance);
}

function focusForJoint(role:string,id:string):StudioFocus|undefined {
  const side=/\[(left|right),/.exec(id)?.[1] ??
    (role.endsWith("_left")?"left":role.endsWith("_right")?"right":undefined);
  if(role==="jaw"||role==="head")return "face";
  if(role==="neck")return "head";
  if(role==="chest"||role==="spine_lower")return "torso";
  if(role==="pelvis")return "hips";
  if(!side)return undefined;
  if(role.startsWith("clavicle_")||role.startsWith("shoulder_"))
    return side==="left"?"left-shoulder":"right-shoulder";
  if(role.startsWith("elbow_"))
    return side==="left"?"left-elbow":"right-elbow";
  if(role.startsWith("wrist_")||role.startsWith("palm_")||role.startsWith("finger_"))
    return side==="left"?"left-hand":"right-hand";
  if(role.startsWith("hip_"))
    return side==="left"?"left-thigh":"right-thigh";
  if(role.startsWith("knee_"))
    return side==="left"?"left-knee":"right-knee";
  if(role.startsWith("ankle_")||role.startsWith("foot_")||role.startsWith("toe_"))
    return side==="left"?"left-foot":"right-foot";
  return undefined;
}

/** Resolve the *clicked surface triangle* from the character's existing GPU skin
 * influences. This works with posed/morphed meshes and does not invent proxy
 * colliders or duplicate anatomical geometry. Helper bones map to their
 * authoritative semantic region. The actual ray-hit point supplies the pivot. */
export function focusAreaForSkinTriangle(
  human:Pick<AnatomicalHuman,"mesh"|"spike">,
  face:Pick<THREE.Face,"a"|"b"|"c">,
):StudioFocus|undefined {
  const skinIndex=human.mesh.geometry.getAttribute("skinIndex");
  const skinWeight=human.mesh.geometry.getAttribute("skinWeight");
  if(!skinIndex||!skinWeight)return undefined;
  const roles=new Map(human.spike.graph.joints.map(j=>[j.id,j.role]));
  const scores=new Map<StudioFocus,number>();
  for(const vertex of [face.a,face.b,face.c]){
    if(!Number.isInteger(vertex)||vertex<0||vertex>=skinIndex.count)return undefined;
    for(let n=0;n<4;n++){
      const weight=skinWeight.getComponent(vertex,n);
      if(weight<=0||!Number.isFinite(weight))continue;
      const index=skinIndex.getComponent(vertex,n);
      const bone=human.spike.skeleton.bones[index];
      if(!bone)continue;
      let area:StudioFocus|undefined;
      const role=roles.get(bone.name);
      if(role)area=focusForJoint(role,bone.name);
      else {
        const shoulder=/^C2_SKIN_SHOULDER_CONNECTOR_(LEFT|RIGHT)$/.exec(bone.name);
        const forearm=/^C2_SKIN_PROXIMAL_FOREARM_(LEFT|RIGHT)$/.exec(bone.name);
        if(shoulder)area=shoulder[1]==="LEFT"?"left-shoulder":"right-shoulder";
        else if(forearm)area=forearm[1]==="LEFT"?"left-elbow":"right-elbow";
      }
      if(area)scores.set(area,(scores.get(area)??0)+weight);
    }
  }
  let chosen:StudioFocus|undefined;
  let strongest=0;
  for(const [area,weight] of scores){
    if(weight>strongest){chosen=area;strongest=weight;}
  }
  return chosen;
}
