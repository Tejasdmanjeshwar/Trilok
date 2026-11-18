import {validateAnimationClip, type AnimationClipV1, type AnatomicalGraphV1} from "@trilok/character-core";
import idle from "../../../../assets/animations/reference-v1/human-idle.clip.json";
import step from "../../../../assets/animations/reference-v1/human-walk.clip.json";
import gesture from "../../../../assets/animations/reference-v1/human-run.clip.json";
import calibratedIdle from "../../../../assets/animations/candidate-c62-v1/human-idle.clip.json";
import calibratedWalk from "../../../../assets/animations/candidate-c62-v1/human-walk.clip.json";
import calibratedRun from "../../../../assets/animations/candidate-c62-v1/human-run.clip.json";
import calibratedSprint from "../../../../assets/animations/candidate-c62-v1/human-sprint.clip.json";

/** Reviewed source-backed choices. The source mannequin is NOT loaded by Studio. */
export const STUDIO_REFERENCE_ANIMATIONS = [
  {id:"human-idle", label:"Idle · Quaternius UAL1"},
  {id:"human-walk", label:"Walk · Quaternius UAL1"},
  {id:"human-run", label:"Run · Quaternius UAL1"},
  // Experimental alternatives are selectable only for quality comparison.
  // They do not replace the legacy entries until the owner accepts them.
  {id:"human-idle-calibrated", label:"EXPERIMENTAL · Idle · calibrated"},
  {id:"human-walk-calibrated", label:"EXPERIMENTAL · Walk · calibrated"},
  {id:"human-run-calibrated", label:"EXPERIMENTAL · Jog · calibrated"},
  {id:"human-sprint-calibrated", label:"EXPERIMENTAL · Sprint · calibrated"},
] as const;

/** Versioned, offline-baked assets are bundled by Vite; never generated at
 * playback time. Validation rejects morphology/topology bind drift. */
const clips:Readonly<Record<string,unknown>>={
  "human-idle":idle,
  "human-walk":step,
  "human-run":gesture,
  "human-idle-calibrated":calibratedIdle,
  "human-walk-calibrated":calibratedWalk,
  "human-run-calibrated":calibratedRun,
  "human-sprint-calibrated":calibratedSprint,
};
export function loadBakedStudioAnimation(id:string,graph:AnatomicalGraphV1):AnimationClipV1 {
  if(!Object.hasOwn(clips,id))throw new Error("Unknown reference animation");
  const clip=clips[id];
  validateAnimationClip(clip,graph);
  // UI selection ID is distinct from the source motion ID, without mutating
  // the reproducibly baked candidate bytes. This keeps the preview state
  // and post-regeneration restoration bound to the selected experiment.
  return id.endsWith("-calibrated") ?
    {...clip,id} as AnimationClipV1 : clip;
}
