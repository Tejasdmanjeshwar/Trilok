import * as THREE from "three";
import type { AnatomicalGraphV1 } from "@trilok/character-core";

/**
 * C2.3: rest-relative anatomical FK for a calibrated C1 skeleton.
 *
 * Axes are stored in each bone's REST-local coordinates (not Euler channels).
 * Calibration is performed after landmark retargeting and before any pose.
 * This layer never changes C1 semantic IDs, bind matrices or combat simulation.
 */
export type AnatomicalMotion = "flexion" | "abduction" | "rotation" | "opposition";
export interface JointTarget {
  readonly jointId: string;
  readonly motion: AnatomicalMotion;
  readonly radians: number;
}
export interface JointFreedom {
  /** Unit rotation axis in the bone's rest-local basis. */
  readonly axis: THREE.Vector3;
  readonly min: number;
  readonly max: number;
}
export interface JointFrame {
  readonly jointId: string;
  readonly role: string;
  readonly rest: THREE.Quaternion;
  readonly freedoms: ReadonlyMap<AnatomicalMotion, JointFreedom>;
}
const order: readonly AnatomicalMotion[] =
  ["flexion", "abduction", "opposition", "rotation"];
const up = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3(0, 0, 1);
const pitch = new THREE.Vector3(-1, 0, 0);
const kneePitch = new THREE.Vector3(1, 0, 0);
const yaw = new THREE.Vector3(0, 1, 0);
const sideAxis = (side: "left" | "right") =>
  new THREE.Vector3(0, 0, side === "left" ? -1 : 1);

function safeUnit(value: THREE.Vector3, fallback: THREE.Vector3): THREE.Vector3 {
  return value.lengthSq() > 1e-10 ? value.normalize() : fallback.clone();
}
function sideOf(role: string): "left" | "right" | undefined {
  return role.endsWith("_left") ? "left" :
    role.endsWith("_right") ? "right" : undefined;
}
function fingerSide(id: string): "left" | "right" | undefined {
  const match = /arm\[(left|right),/.exec(id);
  return match?.[1] as "left" | "right" | undefined;
}
function fingerRole(role: string):
  { digit: string; index: number } | undefined {
  const match = /^finger_(thumb|index|middle|ring|little)_([0-2])$/.exec(role);
  return match ? { digit: match[1]!, index: Number(match[2]) } : undefined;
}
function fingerId(graph: AnatomicalGraphV1, side: "left" | "right",
  digit: string, index: number): string | undefined {
  return graph.joints.find(j => j.role === "finger_" + digit + "_" + index &&
    fingerSide(j.id) === side)?.id;
}

export class AnatomicalFK {
  readonly frames: ReadonlyMap<string, JointFrame>;
  /** Measured volar-facing normals of the two resting hands, in world space. */
  readonly palmarNormals: ReadonlyMap<"left" | "right", THREE.Vector3>;
  private readonly graph: AnatomicalGraphV1;
  private readonly bones: ReadonlyMap<string, THREE.Bone>;
  private readonly proximalForearmSkin: ReadonlyMap<string, THREE.Bone>;

  constructor(graph: AnatomicalGraphV1, bones: ReadonlyMap<string, THREE.Bone>,
    options: { readonly jawTipWorldRest?: THREE.Vector3;
      readonly forearmSkinBones?: ReadonlyMap<"left" | "right", THREE.Bone> } = {}) {
    this.graph = graph;
    this.bones = bones;
    const helpers = new Map<string, THREE.Bone>();
    for (const side of ["left", "right"] as const) {
      const helper = options.forearmSkinBones?.get(side);
      if (!helper) continue;
      const joint = graph.joints.find(j => j.role === "elbow_" + side);
      const elbow = joint ? bones.get(joint.id) : undefined;
      if (!elbow || helper.parent !== elbow.parent)
        throw new Error("Invalid skin-only forearm helper " + side);
      helpers.set(joint!.id, helper);
    }
    if (options.forearmSkinBones && helpers.size !== 2)
      throw new Error("Incomplete forearm skin helpers");
    this.proximalForearmSkin = helpers;
    const restPositions = new Map<string, THREE.Vector3>();
    const worldQuaternions = new Map<string, THREE.Quaternion>();
    for (const joint of graph.joints) {
      const bone = bones.get(joint.id);
      if (!bone) throw new Error("Missing FK bone " + joint.id);
      bone.updateWorldMatrix(true, false);
      restPositions.set(joint.id, bone.getWorldPosition(new THREE.Vector3()));
      worldQuaternions.set(joint.id, bone.getWorldQuaternion(new THREE.Quaternion()));
    }
    const at = (id: string | undefined): THREE.Vector3 | undefined =>
      id ? restPositions.get(id) : undefined;
    const byRole = (role: string): THREE.Vector3 | undefined =>
      at(graph.joints.find(j => j.role === role)?.id);
    const palmNormals = new Map<"left" | "right", THREE.Vector3>();
    for (const side of ["left", "right"] as const) {
      const wrist = byRole("wrist_" + side);
      const index = at(fingerId(graph, side, "index", 0));
      const middle = at(fingerId(graph, side, "middle", 0));
      const little = at(fingerId(graph, side, "little", 0));
      const thumbDistal = at(fingerId(graph, side, "thumb", 1));
      let palmar = forward.clone(); // C1 schematic fallback: no separated knuckles.
      if (wrist && index && middle && little && thumbDistal) {
        // CC0 MakeHuman rests with the palms tilted toward the body. Its
        // knuckle plane is almost perpendicular to world Z; choosing a sign
        // by dot(+Z) flips flexion unpredictably between mirrored hands.
        // The offset of the distal thumb landmark from the wrist/knuckle
        // plane identifies the *volar* half-space in the source anatomy.
        const lateral = index.clone().sub(little);
        const distal = middle.clone().sub(wrist);
        const normal = lateral.cross(distal);
        if (normal.lengthSq() > 1e-10) {
          normal.normalize();
          const volarOffset = thumbDistal.clone().sub(wrist).dot(normal);
          // A nearly coplanar thumb cannot disambiguate dorsal and palmar
          // surfaces. Fail rather than silently making an arbitrary choice.
          if (Math.abs(volarOffset) < 1e-5)
            throw new Error("Ambiguous palmar orientation for " + side + " hand");
          if (volarOffset < 0) normal.negate();
          palmar = normal;
        }
      }
      palmNormals.set(side, palmar);
    }
    this.palmarNormals = palmNormals;

    const frames = new Map<string, JointFrame>();
    for (const joint of graph.joints) {
      const bone = bones.get(joint.id)!;
      const role = joint.role;
      const side = sideOf(role);
      const inverseWorld = worldQuaternions.get(joint.id)!.clone().invert();
      const freedoms = new Map<AnatomicalMotion, JointFreedom>();
      const add = (motion: AnatomicalMotion, worldAxis: THREE.Vector3,
        min: number, max: number): void => {
        const local = worldAxis.clone().applyQuaternion(inverseWorld);
        if (!Number.isFinite(min) || !Number.isFinite(max) || min > max ||
            local.lengthSq() < 1e-10) throw new Error("Invalid FK frame " + joint.id);
        freedoms.set(motion, { axis: local.normalize(), min, max });
      };
      const digit = fingerRole(role);
      if (digit) {
        const handSide = fingerSide(joint.id);
        if (!handSide) throw new Error("Unscoped C1 finger " + joint.id);
        const current = at(joint.id)!;
        const childId = fingerId(graph, handSide, digit.digit, digit.index + 1);
        const child = at(childId);
        const parent = at(joint.parentId ?? undefined);
        // Last phalanx uses the preceding calibrated bone direction; never
        // falls back to an arbitrary X Euler rotation.
        const direction = safeUnit(
          (child ?? current).clone().sub(child ? current : (parent ?? current)),
          new THREE.Vector3(0, -1, 0));
        const palmar = palmNormals.get(handSide)!;
        const flexAxis = safeUnit(direction.clone().cross(palmar), pitch);
        add("flexion", flexAxis, digit.digit === "thumb" ? -0.06 : -0.10,
          digit.digit === "thumb" ? 1.10 : digit.index === 0 ? 1.42 : 1.65);
        if (digit.digit === "thumb" && digit.index === 0) {
          const opposingKnuckle = at(fingerId(graph, handSide, "ring", 0)) ??
            at(fingerId(graph, handSide, "middle", 0));
          const towardOtherDigits = opposingKnuckle ?
            opposingKnuckle.clone().sub(current) :
            new THREE.Vector3(handSide === "left" ? -1 : 1, 0, 0);
          // Opposition is the sweep toward the other digits across the palm,
          // not a rotation toward the adjacent index MCP. Project the target
          // into the thumb shaft's normal plane before forming its hinge.
          const across = towardOtherDigits.sub(direction.clone().multiplyScalar(
            towardOtherDigits.dot(direction)));
          add("opposition",
            safeUnit(direction.clone().cross(across), palmNormals.get(handSide)!),
            0, 1.25);
        }
        if (digit.index === 0 && digit.digit !== "thumb") {
          // Digital spread is rotation *within* the palm plane: its axis
          // must be the palm normal, not the finger flexion hinge.
          add("abduction", palmar, -.22, .22);
        }
      } else if (role.startsWith("clavicle_") && side) {
        add("abduction", sideAxis(side), -.12, .48);
        add("flexion", pitch, -.32, .36);
      } else if (role.startsWith("shoulder_") && side) {
        add("abduction", sideAxis(side), -.3, 2.55);
        add("flexion", pitch, -1.0, 2.05);
        const elbow = byRole("elbow_" + side);
        add("rotation", safeUnit((elbow ?? at(joint.id)!).clone().sub(at(joint.id)!),
          up), -1.35, 1.35);
      } else if (role.startsWith("elbow_") && side) {
        add("flexion", pitch, -.07, 2.45);
        const wrist = byRole("wrist_" + side);
        // Pronation/supination originates at the proximal forearm, not at
        // the wrist. The measured elbow->wrist axis follows shoulder motion.
        add("rotation", safeUnit((wrist ?? at(joint.id)!).clone().sub(at(joint.id)!),
          new THREE.Vector3(0, -1, 0)), -1.40, 1.40);
      } else if (role.startsWith("wrist_") && side) {
        add("flexion", pitch, -.80, .80);
        add("abduction", sideAxis(side), -.38, .38);
      } else if (role.startsWith("hip_") && side) {
        add("flexion", pitch, -.55, 2.15);
        add("abduction", sideAxis(side), -.20, .85);
        add("rotation", yaw, -.65, .65);
      } else if (role.startsWith("knee_")) {
        add("flexion", kneePitch, -.07, 2.55);
      } else if (role.startsWith("ankle_")) {
        add("flexion", pitch, -.62, .52);
      } else if (role.startsWith("toe_")) {
        add("flexion", pitch, -.45, .65);
      } else if (role === "spine_lower" || role === "chest") {
        add("rotation", yaw, -.55, .55);
        add("flexion", pitch, -.32, .42);
        add("abduction", new THREE.Vector3(0, 0, 1), -.28, .28);
      } else if (role === "neck" || role === "head") {
        add("rotation", yaw, -.75, .75);
        add("flexion", pitch, -.45, .55);
      } else if (role === "jaw") {
        const head = byRole("head");
        const neck = byRole("neck");
        const hinge = at(joint.id)!;
        // In the imported CC0 rig the mandibular tip lies anterior and below
        // the hinge; opening must lower that point away from the maxilla.
        // Derive the hinge in the measured sagittal plane rather than reusing
        // the generic head/spine pitch (-X), which *closes* the mouth.
        const cranialUp = head && neck ?
          safeUnit(head.clone().sub(neck), up) : up.clone();
        const towardChin = options.jawTipWorldRest ?
          options.jawTipWorldRest.clone().sub(hinge) :
          head ? hinge.clone().sub(head) : forward.clone();
        const anterior = towardChin.addScaledVector(cranialUp,
          -towardChin.dot(cranialUp));
        if (anterior.lengthSq() < 1e-10)
          throw new Error("Cannot calibrate sagittal jaw plane " + joint.id);
        const openingHinge = cranialUp.clone().cross(anterior.normalize());
        add("flexion", openingHinge, 0, .65);
      } else if (role === "pelvis") {
        add("rotation", yaw, -.55, .55);
      }
      frames.set(joint.id, {
        jointId: joint.id, role, rest: bone.quaternion.clone(), freedoms,
      });
    }
    this.frames = frames;
  }

  /** Prevalidate the whole command before changing any bones. Fixed DOF order
   * makes results independent of caller target order or Map insertion order. */
  apply(targets: readonly JointTarget[]): void {
    const commands = new Map<string, Map<AnatomicalMotion, number>>();
    for (const target of targets) {
      const frame = this.frames.get(target.jointId);
      const freedom = frame?.freedoms.get(target.motion);
      if (!freedom || !Number.isFinite(target.radians))
        throw new Error("Unsupported anatomical FK target " +
          target.jointId + "/" + target.motion);
      let motions = commands.get(target.jointId);
      if (!motions) { motions = new Map(); commands.set(target.jointId, motions); }
      if (motions.has(target.motion))
        throw new Error("Duplicate anatomical FK target " + target.jointId + "/" + target.motion);
      motions.set(target.motion,
        THREE.MathUtils.clamp(target.radians, freedom.min, freedom.max));
    }
    for (const joint of this.graph.joints) {
      const frame = this.frames.get(joint.id)!;
      const bone = this.bones.get(joint.id)!;
      bone.quaternion.copy(frame.rest);
      const helper = this.proximalForearmSkin.get(joint.id);
      if (helper) helper.quaternion.copy(frame.rest);
      const motions = commands.get(joint.id);
      if (!motions) continue;
      for (const motion of order) {
        const angle = motions.get(motion);
        if (angle === undefined || angle === 0) continue;
        const delta = new THREE.Quaternion().setFromAxisAngle(
          frame.freedoms.get(motion)!.axis, angle);
        bone.quaternion.multiply(delta);
        // The proximal forearm follows bend, but excludes pronation.
        // The semantic elbow + wrist remain fully rotated, preserving C2.3.
        if (helper && motion !== "rotation") helper.quaternion.multiply(delta);
      }
    }
    this.bones.get(this.graph.joints[0]!.id)!.updateWorldMatrix(true, true);
  }
}
