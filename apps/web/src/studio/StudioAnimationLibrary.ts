import {validateAnimationClip,type AnimationClipV1,type AnatomicalGraphV1} from "@trilok/character-core";
import idle from "../../../../assets/animations/studio-v1/human-idle.clip.json";
import walk from "../../../../assets/animations/studio-v1/human-walk.clip.json";
import jog from "../../../../assets/animations/studio-v1/human-run.clip.json";
import sprint from "../../../../assets/animations/studio-v1/human-sprint.clip.json";
import backward from "../../../../assets/animations/studio-v1/human-backward.clip.json";
import strafeLeft from "../../../../assets/animations/studio-v1/human-strafe-left.clip.json";
import strafeRight from "../../../../assets/animations/studio-v1/human-strafe-right.clip.json";

/** Approved source-backed motions, independent of Studio controls or playback. */
const library = [
  {id:"human-idle",label:"Idle",clip:idle},
  {id:"human-walk",label:"Walk",clip:walk},
  {id:"human-jog",label:"Jog",clip:jog},
  {id:"human-sprint",label:"Sprint",clip:sprint},
  {id:"human-backward",label:"Walk Backward",clip:backward},
  {id:"human-strafe-left",label:"Strafe Left",clip:strafeLeft},
  {id:"human-strafe-right",label:"Strafe Right",clip:strafeRight},
] as const;

export const STUDIO_ANIMATIONS = [
  ...library.map(({id,label})=>({id,label})),
  {id:"locomotion-preview",label:"Movement transitions"},
];

/** Immutable C6.2 assets are shared with the runtime mixer without rebaking. */
export function loadStudioLocomotionLibrary(graph:AnatomicalGraphV1){
  return {
    idle:loadBakedStudioAnimation("human-idle",graph),
    walk:loadBakedStudioAnimation("human-walk",graph),
    jog:loadBakedStudioAnimation("human-jog",graph),
    sprint:loadBakedStudioAnimation("human-sprint",graph),
    directional:{
      backward:loadBakedStudioAnimation("human-backward",graph),
      left:loadBakedStudioAnimation("human-strafe-left",graph),
      right:loadBakedStudioAnimation("human-strafe-right",graph),
    },
  };
}
const clips: Readonly<Record<string,unknown>> =
  Object.fromEntries(library.map(({id,clip})=>[id,clip]));

/** Legacy names are input-only migrations, never extra playback choices.
 * This also migrates a previously selected "human-run" to semantic "Jog". */
const previousIds: Readonly<Record<string,string>> = {
  "human-idle-calibrated":"human-idle",
  "human-walk-calibrated":"human-walk",
  "human-run-calibrated":"human-jog",
  "human-sprint-calibrated":"human-sprint",
  "human-run":"human-jog",
};
export function resolveStudioAnimationId(id:string):string {
  const resolved=previousIds[id]??id;
  if(resolved!=="locomotion-preview"&&!Object.hasOwn(clips,resolved))throw new Error("Unknown Studio animation");
  return resolved;
}

/** Asset bytes and calibration metadata are never rewritten at runtime.
 * Jog's historical baked identifier is normalized at this API boundary. */
export function loadBakedStudioAnimation(id:string,graph:AnatomicalGraphV1):AnimationClipV1 {
  const resolved=resolveStudioAnimationId(id);
  const clip=clips[resolved];
  validateAnimationClip(clip,graph);
  return clip.id===resolved?clip:{...clip,id:resolved};
}
