import type { AnatomicalGraphV1 } from "@trilok/character-core";
import type { AnatomicalFK, AnatomicalMotion, JointTarget } from "./AnatomicalFK";

/**
 * C2.5 v1: supported *diagnostic* articulation envelope, not C3 morph targets.
 * Role/side lookup is resolved against canonical C1 IDs at runtime. No new DOFs.
 * This is the single source of truth for the lab and headless pose acceptance.
 */
export const ANATOMICAL_POSE_MATRIX_VERSION = 1 as const;
export type PoseRegion = "shoulder" | "elbow" | "forearm" | "hand" |
  "spine" | "hip" | "knee" | "ankle" | "foot" | "head" | "jaw";
export type PoseView = "front" | "rear" | "side" | "head-front" | "head-side" |
  "shoulder-left" | "shoulder-right" | "axilla-left" | "axilla-right" |
  "elbow-left" | "elbow-right" | "hip-left" | "hip-right" |
  "knee-left" | "knee-right" | "ankle-left" | "ankle-right" |
  "hand-left" | "hand-right" | "thumb-web-left" | "thumb-web-right";
export interface PoseCommandV1 {
  readonly role: string;
  readonly side?: "left" | "right";
  readonly motion: AnatomicalMotion;
  readonly radians: number;
}
export interface AnatomicalPoseV1 {
  readonly version: typeof ANATOMICAL_POSE_MATRIX_VERSION;
  readonly id: string;
  readonly label: string;
  readonly regions: readonly PoseRegion[];
  readonly views: readonly PoseView[];
  readonly expected: string;
  readonly targets: readonly PoseCommandV1[];
  readonly invariants: readonly string[];
  readonly acceptance: string;
}
const invariantChecks = Object.freeze([
  "All CPU-skinned positions and joint matrices finite",
  "Source-vertex UV duplicates deform identically",
  "Four normalized source-corresponding GPU skin influences",
  "Target-order-independent deterministic FK and neutral recovery",
  "Unchanged C1 IDs, source topology and inverse bind matrices",
] as const);
const C = (role: string, motion: AnatomicalMotion, radians: number,
  side?: "left" | "right"): PoseCommandV1 =>
  ({ role, motion, radians, ...(side ? {side} : {}) });
const B = (role: string, motion: AnatomicalMotion, left: number,
  right = left): PoseCommandV1[] =>
  [C(role + "_left", motion, left), C(role + "_right", motion, right)];
const F = (digit: string, index: number, motion: AnatomicalMotion,
  left: number, right = left): PoseCommandV1[] =>
  [C("finger_" + digit + "_" + index, motion, left, "left"),
   C("finger_" + digit + "_" + index, motion, right, "right")];
function fist(closure: number): PoseCommandV1[] {
  return [
    ...["index", "middle", "ring", "little"].flatMap(digit => [
      ...F(digit, 0, "flexion", 1.15 * closure),
      ...F(digit, 1, "flexion", 1.19 * closure),
      ...F(digit, 2, "flexion", .55 * closure),
    ]),
    ...F("thumb", 0, "opposition", .55 * closure),
    ...F("thumb", 0, "flexion", .4 * closure),
    ...F("thumb", 1, "flexion", .55 * closure),
  ];
}
const P = (id: string, label: string, regions: readonly PoseRegion[],
  views: readonly PoseView[], expected: string,
  targets: readonly PoseCommandV1[]): AnatomicalPoseV1 => Object.freeze({
  version: ANATOMICAL_POSE_MATRIX_VERSION, id, label, regions, views,
  expected, targets, invariants: invariantChecks,
  acceptance: "Headless invariants must pass. Visually review " + regions.join(", ") +
    " in the listed camera views for continuous silhouette, no dislocated skin, " +
    "pinching, visible gaps, or implausible intersections; numeric edge-strain " +
    "outliers alone do not constitute failure.",
});

/** Legacy C2.3/C2.4 pose IDs are stable for Playwright and user workflows. */
export const ANATOMICAL_POSE_MATRIX: readonly AnatomicalPoseV1[] = Object.freeze([
  P("neutral", "Neutral anatomical rest", ["spine", "hand", "hip"], ["front", "rear", "side"],
    "All articulated bones return to imported CC0 bind rest.", []),
  P("tpose", "T-pose", ["shoulder"], ["front", "rear"],
    "Both arms abduct outward without moving skin off the clavicles.",
    B("shoulder", "abduction", .8)),
  P("overhead", "Arms overhead", ["shoulder"], ["front", "rear", "axilla-left", "axilla-right"],
    "Both humeri elevate; shoulder girdle and axilla remain attached.",
    B("shoulder", "abduction", 2.35)),
  P("shoulder", "Bilateral shoulder raise", ["shoulder"], ["front", "axilla-left", "axilla-right"],
    "Clavicles lift and upper arms abduct with intact underarm folds.",
    [...B("clavicle", "abduction", .22), ...B("shoulder", "abduction", 1.5)]),
  P("shoulder-forward", "Forward shoulder flexion", ["shoulder"], ["side", "shoulder-left"],
    "Both arms move forward with continuous deltoid and chest attachment.",
    B("shoulder", "flexion", 1.5)),
  P("shoulder-combined", "Shoulder, elbow and wrist", ["shoulder", "elbow", "forearm", "hand"],
    ["front", "axilla-left", "axilla-right", "hand-right"],
    "Clavicles, humeri, pronating forearms and wrists compose without detachment.",
    [...B("clavicle", "abduction", .22), ...B("shoulder", "abduction", 1.35),
     ...B("shoulder", "flexion", .75), ...B("elbow", "flexion", 1.5),
     ...B("elbow", "rotation", .7, -.7), ...B("wrist", "flexion", .3)]),
  P("shoulder-torso", "Raised arms and torso twist", ["shoulder", "spine"],
    ["front", "rear", "axilla-left"], "Upper-arm skin stays connected under trunk axial rotation.",
    [...B("shoulder", "abduction", 1.5), C("spine_lower", "rotation", .3),
     C("chest", "rotation", .35)]),
  P("elbow", "Elbow flexion", ["elbow"], ["elbow-left", "elbow-right", "side"],
    "Both elbows fold in the calibrated direction without detached elbow skin.",
    B("elbow", "flexion", 1.7)),
  P("elbow-stress", "Elbow bend and pronation", ["elbow", "forearm"],
    ["elbow-left", "elbow-right", "hand-left"],
    "Wrist and hand follow the distal forearm while proximal skin twists less.",
    [...B("shoulder", "flexion", .6), ...B("elbow", "flexion", 1.9),
     ...B("elbow", "rotation", .9, -.9)]),
  P("hip-stress", "Hip and groin fold", ["hip", "spine"], ["front", "side", "hip-left", "hip-right"],
    "Both hips flex and abduct; groin surface remains continuous.",
    [...B("hip", "flexion", 1.5), ...B("hip", "abduction", .45),
     C("spine_lower", "rotation", .25)]),
  P("knee-stress", "Deep knee fold", ["hip", "knee"], ["side", "knee-left", "knee-right"],
    "Both knees bend in front of shins while thigh and calf skin remain attached.",
    [...B("hip", "flexion", .7), ...B("knee", "flexion", 1.9)]),
  P("ankle-stress", "Ankle flexion", ["ankle"], ["ankle-left", "ankle-right", "side"],
    "Both feet dorsiflex relative to the shins.",
    B("ankle", "flexion", .45)),
  P("neck-jaw", "Neck, head and jaw", ["head", "jaw"],
    ["head-front", "head-side"], "Jaw opens below a turning neck and inclined cranium.",
    [C("neck", "rotation", .55), C("head", "flexion", .3), C("jaw", "flexion", .5)]),
  P("crouch", "Crouch", ["hip", "knee", "ankle"], ["front", "side", "hip-left", "knee-left"],
    "Hips and knees fold with compensating dorsiflexion and stable topology.",
    [...B("hip", "flexion", 1), ...B("knee", "flexion", 1.45),
     ...B("ankle", "flexion", -.4)]),
  P("abduction", "Hip abduction", ["hip"], ["front", "hip-left", "hip-right"],
    "Both legs move laterally while the groin remains connected.",
    B("hip", "abduction", .6)),
  P("torso", "Axial trunk rotation", ["spine"], ["front", "rear", "side"],
    "Lumbar and thoracic joints rotate independently with a smooth torso silhouette.",
    [C("spine_lower", "rotation", .42), C("chest", "rotation", .4)]),
  P("neck", "Neck turn", ["head"], ["head-front", "head-side"],
    "Neck rotates without dislocating the skull.", [C("neck", "rotation", .65)]),
  P("forearm", "Pronation", ["forearm", "hand"], ["front", "elbow-left", "hand-right"],
    "Distal hands rotate around both elbow-wrist axes without palm detachment.",
    B("elbow", "rotation", 1.15, -1.15)),
  P("wrist", "Wrist flexion", ["hand"], ["hand-left", "hand-right"],
    "Both palms follow their wrists under flexion.", B("wrist", "flexion", .65)),
  P("fist", "Bilateral fist closure", ["hand"], ["hand-left", "hand-right"],
    "All digits flex volarly and thumbs sweep across their palms.", fist(1)),
  P("index", "Bilateral index curl", ["hand"], ["hand-left", "hand-right"],
    "Index MCP, PIP and DIP flex volarly without pulling neighboring fingers.",
    [...F("index", 0, "flexion", 1.1), ...F("index", 1, "flexion", 1.35),
     ...F("index", 2, "flexion", .7)]),
  P("thumb", "Thumb opposition", ["hand"], ["thumb-web-left", "thumb-web-right"],
    "Both thumbs move across their palms rather than dorsally.",
    [...F("thumb", 0, "opposition", .72), ...F("thumb", 0, "flexion", .6),
     ...F("thumb", 1, "flexion", .8)]),
  P("thumb-wrist", "Thumb with deviated wrist", ["hand"], ["thumb-web-left", "thumb-web-right"],
    "Thumb webs stay attached through combined wrist bend and opposition.",
    [...B("wrist", "flexion", .62), ...B("wrist", "abduction", .2, -.2),
     ...F("thumb", 0, "opposition", .75), ...F("thumb", 0, "flexion", .55),
     ...F("thumb", 1, "flexion", .7)]),
  P("hand-stress", "Elbow, wrist and thumb-web stress", ["elbow", "forearm", "hand"],
    ["hand-left", "hand-right", "thumb-web-left", "thumb-web-right"],
    "Both hands maintain wrist/palm/finger continuity while elbows bend and twist.",
    [...B("elbow", "flexion", 1), ...B("elbow", "rotation", .7, -.7),
     ...B("wrist", "flexion", .62), ...B("wrist", "abduction", .2, -.2),
     ...F("thumb", 0, "opposition", .75), ...F("thumb", 0, "flexion", .55),
     ...F("thumb", 1, "flexion", .7), ...F("index", 0, "flexion", 1.2),
     ...F("index", 1, "flexion", 1.1), ...F("index", 2, "flexion", .6)]),
  P("sword", "Grip proxy", ["shoulder", "elbow", "hand"], ["front", "side", "hand-left"],
    "A two-handed grip proxy preserves shoulder-to-finger attachment, not weapon IK.",
    [...B("shoulder", "flexion", .5), ...B("elbow", "flexion", 1), ...fist(.65)]),
  P("jaw", "Jaw opening", ["jaw"], ["head-front", "head-side"],
    "The mandibular tip descends while the cranium remains stationary.",
    [C("jaw", "flexion", .4)]),
  P("bow", "Bow-draw approximation", ["shoulder", "elbow", "forearm"], ["front", "side", "rear"],
    "Asymmetric shoulders and elbows approximate a draw; no bow mechanics are implied.",
    [...B("shoulder", "flexion", 1.2, 1), C("elbow_right", "rotation", -.65),
     C("elbow_left", "flexion", 1)]),

  // C2.5-expanded matrix: isolated supported DOFs and compounded asymmetries.
  P("clavicle-only", "Isolated clavicle lift", ["shoulder"], ["front", "axilla-left", "axilla-right"],
    "Clavicle skin and upper-arm attachment remain connected under isolated lift.",
    B("clavicle", "abduction", .4)),
  P("shoulder-unilateral", "Left arm elevation", ["shoulder"], ["front", "rear", "axilla-left"],
    "Only the left arm raises; the right shoulder stays in rest.", [C("shoulder_left", "abduction", 1.8)]),
  P("shoulder-extension", "Shoulder backward extension", ["shoulder"], ["side", "shoulder-left"],
    "Shoulders extend backward within existing negative flexion limits.",
    B("shoulder", "flexion", -.75)),
  P("shoulder-rotation", "Humeral axial rotation", ["shoulder"], ["shoulder-left", "shoulder-right"],
    "Both humeri rotate axially without detaching the shoulder cap.",
    B("shoulder", "rotation", .9, -.9)),
  P("shoulder-asymmetric", "Asymmetric arms", ["shoulder", "elbow"], ["front", "rear"],
    "Left shoulder raises while right flexes forward with bent elbow.",
    [C("shoulder_left", "abduction", 1.8), C("shoulder_right", "flexion", 1.3),
     C("elbow_right", "flexion", 1.5)]),
  P("elbow-unilateral", "Left elbow isolation", ["elbow"], ["elbow-left", "elbow-right"],
    "Left elbow bends while right arm remains at rest.", [C("elbow_left", "flexion", 2.1)]),
  P("forearm-supination", "Reverse forearm axial rotation", ["forearm", "hand"],
    ["elbow-left", "hand-left", "hand-right"],
    "Hands rotate around the opposite forearm axis without wrist skin drift.",
    B("elbow", "rotation", -1.1, 1.1)),
  P("wrist-extension", "Wrist extension", ["hand"], ["hand-left", "hand-right"],
    "Both palms extend without dislocating wrist or metacarpal skin.",
    B("wrist", "flexion", -.65)),
  P("wrist-deviation", "Wrist ulnar/radial deviation", ["hand"], ["hand-left", "hand-right"],
    "Both wrists deviate within calibrated hinge ranges.",
    B("wrist", "abduction", .34, -.34)),
  P("digit-spread", "Finger abduction", ["hand"], ["hand-left", "hand-right"],
    "Proximal non-thumb digits spread with attached knuckles.",
    [...F("index", 0, "abduction", .18, -.18),
     ...F("little", 0, "abduction", -.18, .18)]),
  P("hip-extension", "Hip backward extension", ["hip"], ["side", "hip-left"],
    "Both thighs extend posteriorly with intact pelvis/groin attachment.",
    B("hip", "flexion", -.45)),
  P("hip-rotation", "Hip axial rotation", ["hip"], ["front", "hip-left", "hip-right"],
    "Both legs rotate about their proximal hip axes.",
    B("hip", "rotation", .55, -.55)),
  P("hip-asymmetric", "One-leg raise", ["hip", "knee"], ["front", "side", "hip-left"],
    "Left hip flexes and abducts while right leg remains straight.",
    [C("hip_left", "flexion", 1.5), C("hip_left", "abduction", .4),
     C("knee_left", "flexion", .7)]),
  P("knee-unilateral", "Isolated right knee bend", ["knee"], ["side", "knee-right"],
    "Right knee bends with no unintended motion on the left.",
    [C("knee_right", "flexion", 2.1)]),
  P("ankle-plantar", "Ankle plantarflexion", ["ankle"], ["side", "ankle-left", "ankle-right"],
    "Both feet point with continuous shin-to-foot attachment.",
    B("ankle", "flexion", -.55)),
  P("toe-curl", "Toe flexion", ["foot"], ["side", "ankle-left", "ankle-right"],
    "Both distal toe hinges flex; no unsupported independent midfoot joint motion.",
    B("toe", "flexion", .55)),
  P("toe-extend", "Toe extension", ["foot"], ["side", "ankle-left", "ankle-right"],
    "Both distal toe hinges extend within the existing FK bounds.",
    B("toe", "flexion", -.4)),
  P("hip-knee-ankle-fold", "Deep unilateral leg fold", ["hip", "knee", "ankle"],
    ["side", "hip-left", "knee-left", "ankle-left"],
    "Combined left hip, knee and ankle flexion preserves the continuous lower limb.",
    [C("hip_left", "flexion", 1.7), C("knee_left", "flexion", 2.1),
     C("ankle_left", "flexion", -.48)]),
  P("deep-crouch", "Deep bilateral crouch", ["hip", "knee", "ankle"],
    ["front", "side", "hip-left", "knee-right"],
    "Deep hip/knee fold and ankle compensation preserve the pelvic and leg silhouette.",
    [...B("hip", "flexion", 1.6), ...B("knee", "flexion", 2.15),
     ...B("ankle", "flexion", -.5)]),
  P("head-turn", "Head axial turn", ["head"], ["head-front", "head-side"],
    "Head rotates relative to the neck without a discontinuity.",
    [C("head", "rotation", .6)]),
  P("head-nod", "Head flexion", ["head"], ["head-front", "head-side"],
    "Skull pitches on the calibrated head frame.",
    [C("head", "flexion", .5)]),
  P("neck-flex", "Neck flexion", ["head"], ["head-front", "head-side"],
    "Neck pitches independently of jaw opening.", [C("neck", "flexion", -.4)]),
  P("spine-flex", "Torso forward bend", ["spine", "hip"], ["side", "front"],
    "Lumbar and thoracic flexion preserve the abdomen and back silhouette.",
    [C("spine_lower", "flexion", .35), C("chest", "flexion", .35)]),
  P("spine-side", "Torso lateral bend", ["spine"], ["front", "rear"],
    "Both spinal levels laterally bend while preserving skin continuity.",
    [C("spine_lower", "abduction", .24), C("chest", "abduction", .22)]),
  P("whole-asymmetric", "Asymmetric full-body reach", ["spine", "shoulder", "hip", "knee", "hand"],
    ["front", "rear", "side", "hand-left"],
    "Arm reach, torso twist and staggered leg bend preserve opposite-side anatomy.",
    [C("spine_lower", "rotation", .35), C("chest", "rotation", -.25),
     C("shoulder_left", "abduction", 1.4), C("shoulder_right", "flexion", 1.3),
     C("elbow_right", "flexion", 1.5), C("wrist_right", "flexion", .25),
     C("hip_left", "flexion", 1.2), C("knee_left", "flexion", 1.6),
     C("ankle_left", "flexion", -.3), ...F("index", 0, "flexion", .8)]),
  P("crouch-reach", "Crouch with arms raised", ["hip", "knee", "ankle", "shoulder", "hand"],
    ["front", "rear", "side", "axilla-left", "hip-left"],
    "Crouched trunk and raised arms combine without skin or skeleton detachment.",
    [...B("hip", "flexion", 1.2), ...B("knee", "flexion", 1.7),
     ...B("ankle", "flexion", -.35), ...B("clavicle", "abduction", .18),
     ...B("shoulder", "abduction", 1.5), ...B("elbow", "flexion", .7),
     ...B("wrist", "flexion", .2)]),
  P("whole-extreme", "Combined supported joint extremes", ["shoulder", "elbow", "forearm",
    "hand", "spine", "hip", "knee", "ankle", "foot", "head", "jaw"],
    ["front", "rear", "side", "axilla-left", "hip-right", "knee-left", "head-side"],
    "Bounded combined stress reveals but does not excuse localized LBS artifacts.",
    [...B("clavicle", "abduction", .35), ...B("shoulder", "abduction", 2.05),
     ...B("shoulder", "flexion", .6), ...B("elbow", "flexion", 2.0),
     ...B("elbow", "rotation", .95, -.95), ...B("wrist", "flexion", .6),
     ...B("hip", "flexion", 1.65), ...B("hip", "abduction", .35),
     ...B("knee", "flexion", 2.05), ...B("ankle", "flexion", -.45),
     ...B("toe", "flexion", .45), C("chest", "rotation", .35),
     C("spine_lower", "rotation", .3), C("neck", "rotation", .5),
     C("head", "flexion", .3), C("jaw", "flexion", .45),
     ...F("index", 0, "flexion", 1.1), ...F("thumb", 0, "opposition", .65)]),
]);

const poseIds = new Set<string>();
for (const pose of ANATOMICAL_POSE_MATRIX) {
  if (poseIds.has(pose.id)) throw new Error("Duplicate C2.5 pose ID " + pose.id);
  poseIds.add(pose.id);
}
export function anatomicalPoseById(id: string): AnatomicalPoseV1 {
  const pose = ANATOMICAL_POSE_MATRIX.find(item => item.id === id);
  if (!pose) throw new Error("Unknown C2.5 anatomical pose " + id);
  return pose;
}

/** Fail closed on missing roles, unsupported DOFs, duplicate targets or out-of-range inputs. */
export function resolveAnatomicalPose(pose: AnatomicalPoseV1,
  graph: AnatomicalGraphV1, fk: AnatomicalFK): JointTarget[] {
  if (pose.version !== ANATOMICAL_POSE_MATRIX_VERSION)
    throw new Error("Unsupported anatomical pose schema version");
  const output: JointTarget[] = [];
  const seen = new Set<string>();
  for (const target of pose.targets) {
    const matches = graph.joints.filter(j => j.role === target.role &&
      (target.side === undefined || j.id.includes("arm[" + target.side + ",")));
    if (matches.length !== 1) throw new Error("Ambiguous/missing C1 pose role " +
      pose.id + "/" + target.role + "/" + (target.side ?? "center"));
    const joint = matches[0]!;
    const freedom = fk.frames.get(joint.id)?.freedoms.get(target.motion);
    if (!freedom) throw new Error("Unsupported anatomical motion " +
      pose.id + "/" + target.role + "/" + target.motion);
    if (!Number.isFinite(target.radians) ||
        target.radians < freedom.min - 1e-9 ||
        target.radians > freedom.max + 1e-9)
      throw new Error("Out-of-bounds anatomical motion " +
        pose.id + "/" + target.role + "/" + target.motion);
    const key = joint.id + "/" + target.motion;
    if (seen.has(key)) throw new Error("Duplicate C2.5 pose target " + pose.id + "/" + key);
    seen.add(key);
    output.push({ jointId: joint.id, motion: target.motion, radians: target.radians });
  }
  return output;
}
