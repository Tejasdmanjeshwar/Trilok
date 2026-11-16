import type {AnatomicalGraphV1} from "@trilok/character-core";
import type {AnatomicalFK,JointTarget} from "../characters/geometry/AnatomicalFK";

/**
 * Reusable upright torso / gaze coordination for aimed, guarded and
 * two-handed actions. Angles are avatar-local yaw, not world-space Euler
 * writes. The calibrated FK owns axis conversion, limits and skin correctives.
 *
 * The pelvis is deliberately left alone: it parents the legs in the current
 * source rig. Yawing it without grounded feet/leg compensation would make
 * both feet slide. The two spinal joints share the shooting-plane turn; neck
 * and head counter-turn to preserve a forward gaze. No root transforms.
 */
export function coordinateTorsoAndGaze(graph:AnatomicalGraphV1,
  fk:AnatomicalFK,base:readonly JointTarget[],
  torsoYawRadians:number,gazePreservation=1):readonly JointTarget[]{
  if(!Number.isFinite(torsoYawRadians)||!Number.isFinite(gazePreservation)||
    gazePreservation<0||gazePreservation>1)
    throw new Error("Invalid torso/gaze coordination");
  const shares=[
    ["spine_lower",.5],["chest",.5],
    ["neck",-.5*gazePreservation],["head",-.5*gazePreservation],
  ] as const;
  const commands=new Map(base.map(c=>[c.jointId+"/"+c.motion,c]));
  for(const [role,share] of shares){
    const joints=graph.joints.filter(j=>j.role===role);
    if(joints.length!==1)throw new Error("Missing unique upright torso role "+role);
    const jointId=joints[0]!.id;
    const range=fk.frames.get(jointId)?.freedoms.get("rotation");
    if(!range)throw new Error("Missing calibrated torso rotation "+role);
    const key=jointId+"/rotation";
    const current=commands.get(key)?.radians??0;
    const angle=Math.max(range.min,Math.min(range.max,
      current+torsoYawRadians*share));
    commands.set(key,{jointId,motion:"rotation",radians:angle});
  }
  return [...commands.values()];
}
