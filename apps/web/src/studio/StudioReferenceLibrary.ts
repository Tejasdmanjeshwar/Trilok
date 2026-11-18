import {validateAnimationClip, type AnimationClipV1, type AnatomicalGraphV1} from "@trilok/character-core";
import idle from "../../../../assets/animations/reference-v1/relaxed-idle.clip.json";
import step from "../../../../assets/animations/reference-v1/controlled-step.clip.json";
import gesture from "../../../../assets/animations/reference-v1/ready-gesture.clip.json";

/** Versioned, offline-baked assets are bundled by Vite; never generated at
 * playback time. Validation rejects morphology/topology bind drift. */
const clips:Readonly<Record<string,unknown>>={
  "relaxed-idle":idle,
  "controlled-step":step,
  "ready-gesture":gesture,
};
export function loadBakedStudioAnimation(id:string,graph:AnatomicalGraphV1):AnimationClipV1 {
  if(!Object.hasOwn(clips,id))throw new Error("Unknown reference animation");
  const clip=clips[id];
  validateAnimationClip(clip,graph);
  return clip;
}
