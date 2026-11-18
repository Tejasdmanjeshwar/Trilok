import { createAnatomyPreset } from "./presets";
import { canonicalRigIdentity, type AnimationClipV1 } from "./animation";
import type { AnatomicalGraphV1, Quat } from "./schema";

/** Procedural reference: CC0-free, authored entirely within Trilok. */
export function createReferenceBreathingClip(graph: AnatomicalGraphV1 =
  createAnatomyPreset({archetype:"human"})): AnimationClipV1 {
  const chest = graph.joints.filter(j => j.role === "chest");
  if (chest.length !== 1) throw new Error("Reference clip needs one canonical chest");
  const angle = 0.035;
  const q: Quat = [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
  const neutral: Quat = [0, 0, 0, 1];
  const rig = canonicalRigIdentity(graph);
  return {
    schemaVersion: 1,
    id: "reference-breath-v1",
    rig,
    durationSeconds: 2,
    source: {
      kind: "internal", creator: "trilok", revision: "c6.1",
      license: "Trilok-Proprietary",
    },
    rootMotion: "locked",
    layer: {mode: "base", jointMask: [chest[0]!.id]},
    retarget: {mode: "rest_delta", authoredBindPoseId: rig.bindPoseId},
    tracks: [{
      channel: "rotation", jointId: chest[0]!.id,
      timesSeconds: [0, 1, 2],
      values: [neutral, q, neutral],
    }],
    contacts: [],
  };
}
