import {validateAnimationClip,type AnimationClipV1,type AnatomicalGraphV1} from "@trilok/character-core";
import idle from "../../../../assets/animations/studio-v1/human-idle.clip.json";
import walk from "../../../../assets/animations/studio-v1/human-walk.clip.json";
import jog from "../../../../assets/animations/studio-v1/human-run.clip.json";
import sprint from "../../../../assets/animations/studio-v1/human-sprint.clip.json";
import backward from "../../../../assets/animations/studio-v1/human-backward.clip.json";
import strafeLeft from "../../../../assets/animations/studio-v1/human-strafe-left.clip.json";
import strafeRight from "../../../../assets/animations/studio-v1/human-strafe-right.clip.json";
import kevinCatalog from "../../../../assets/animations/sources/kevin-basic-motions-v1.json";
export const EXPERIMENTAL_KEVIN_C63_REVIEW=typeof location!=="undefined" &&
  new URLSearchParams(location.search).has("c63-kevin-review");
const c63ReviewClips=new Map<string,AnimationClipV1>();
/** Called by an opt-in, separately bundled Studio chunk; ordinary gameplay
 * and normal Studio do not import any unapproved directional clip. */
export function registerKevinC63Review(entries:readonly {id:string;label:string;clip:AnimationClipV1}[]):void{
  if(!EXPERIMENTAL_KEVIN_C63_REVIEW||c63ReviewClips.size||entries.length!==24||
    new Set(entries.map(e=>e.id)).size!==24)
    throw new Error("Invalid C6.3 review registration");
  const selected=new Set(kevinCatalog.c63ReviewClips.map(e=>e.id));
  for(const entry of entries)if(!selected.has(entry.id)||entry.clip.id!==entry.id)
    throw new Error("Unexpected Kevin review source "+entry.id);
  for(const entry of entries)c63ReviewClips.set(entry.id,entry.clip);
  STUDIO_ANIMATIONS.splice(STUDIO_ANIMATIONS.length-1,0,
    ...entries.map(({id,label})=>({id,label})));
}


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

// Canonical game-integrated JSON resources are bundled at build time.
const kevinBakes = import.meta.glob<{default:AnimationClipV1}>(
  "../../../../assets/animations/studio-v1/kevin/*.clip.json",{eager:true});
const kevinLibrary = kevinCatalog.clips.flatMap(({id,label})=>{
  const path="../../../../assets/animations/studio-v1/kevin/"+id+".clip.json";
  const clip=kevinBakes[path]?.default;
  return clip?[{id,label,clip}]:[];
});

/** KayKit directional motion failed owner review. Keep it accessible only in an\n * explicitly opted-in PR diagnostic, not the accepted animation menu. */
export const EXPERIMENTAL_KAYKIT_REVIEW = typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("c63-kaykit-review");
export const STUDIO_ANIMATIONS = [
  ...library.slice(0,EXPERIMENTAL_KAYKIT_REVIEW?library.length:4)
    .map(({id,label})=>({id,label})),
  ...kevinLibrary.map(({id,label})=>({id,label})),
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
  Object.fromEntries([...library,...kevinLibrary].map(({id,clip})=>[id,clip]));

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
  if(resolved!=="locomotion-preview"&&!Object.hasOwn(clips,resolved)&&
    !c63ReviewClips.has(resolved))
    throw new Error("Unknown or unaccepted Studio animation");
  return resolved;
}

/** Asset bytes and calibration metadata are never rewritten at runtime.
 * Jog's historical baked identifier is normalized at this API boundary. */
export function loadBakedStudioAnimation(id:string,graph:AnatomicalGraphV1):AnimationClipV1 {
  const resolved=resolveStudioAnimationId(id);
  const clip=c63ReviewClips.get(resolved)??clips[resolved];
  validateAnimationClip(clip,graph);
  return clip.id===resolved?clip:{...clip,id:resolved};
}
