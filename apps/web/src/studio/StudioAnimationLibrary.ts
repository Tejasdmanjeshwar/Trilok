import {validateAnimationClip,type AnimationClipV1,type AnatomicalGraphV1} from "@trilok/character-core";
import idle from "../../../../assets/animations/studio-v1/human-idle.clip.json";
import walk from "../../../../assets/animations/studio-v1/human-walk.clip.json";
import jog from "../../../../assets/animations/studio-v1/human-run.clip.json";
import sprint from "../../../../assets/animations/studio-v1/human-sprint.clip.json";
import backward from "../../../../assets/animations/studio-v1/human-backward.clip.json";
import strafeLeft from "../../../../assets/animations/studio-v1/human-strafe-left.clip.json";
import strafeRight from "../../../../assets/animations/studio-v1/human-strafe-right.clip.json";
import neutralIdle from "../../../../assets/animations/studio-v1/human-100style-neutral-idle.clip.json";
import neutralWalk from "../../../../assets/animations/studio-v1/human-100style-neutral-walk.clip.json";
import neutralRun from "../../../../assets/animations/studio-v1/human-100style-neutral-run.clip.json";

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

/** KayKit directional motion failed owner review. Keep it accessible only in an\n * explicitly opted-in PR diagnostic, not the accepted animation menu. */
export const EXPERIMENTAL_KAYKIT_REVIEW = typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("c63-kaykit-review");
/** C6.3 Neutral motions are unaccepted. Explicit owner-only opt-in keeps the
 * approved four UAL1 choices and default locomotion mixer unchanged. */
export const EXPERIMENTAL_100STYLE_REVIEW = typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("c63-100style-review");
const neutralReview = [
  {id:"human-100style-neutral-idle",label:"100STYLE Idle · review",clip:neutralIdle},
  {id:"human-100style-neutral-walk",label:"100STYLE Walk · review",clip:neutralWalk},
  {id:"human-100style-neutral-run",label:"100STYLE Run · review",clip:neutralRun},
] as const;

export const STUDIO_ANIMATIONS = [
  ...library.slice(0,EXPERIMENTAL_KAYKIT_REVIEW?library.length:4)
    .map(({id,label})=>({id,label})),
  ...(EXPERIMENTAL_100STYLE_REVIEW?neutralReview.map(({id,label})=>({id,label})):[]),
  {id:"locomotion-preview",label:"Movement transitions"},
];

/** Immutable C6.2 assets are shared with the runtime mixer without rebaking. */
export function loadStudioLocomotionLibrary(graph:AnatomicalGraphV1,
  includeUnacceptedKayKit=false){
  return {
    idle:loadBakedStudioAnimation("human-idle",graph),
    walk:loadBakedStudioAnimation("human-walk",graph),
    jog:loadBakedStudioAnimation("human-jog",graph),
    sprint:loadBakedStudioAnimation("human-sprint",graph),
    directional:includeUnacceptedKayKit?{
      backward:loadBakedStudioAnimation("human-backward",graph),
      left:loadBakedStudioAnimation("human-strafe-left",graph),
      right:loadBakedStudioAnimation("human-strafe-right",graph),
    }:undefined,
  };
}
const clips: Readonly<Record<string,unknown>> =
  Object.fromEntries([...library,...neutralReview].map(({id,clip})=>[id,clip]));

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
  if(resolved!=="locomotion-preview"&&(!Object.hasOwn(clips,resolved)||
    (resolved.startsWith("human-100style-neutral-")&&!EXPERIMENTAL_100STYLE_REVIEW)))
    throw new Error("Unknown or unaccepted Studio animation");
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
