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
  private readonly graph: AnatomicalGraphV1;
  private readonly bones: ReadonlyMap<string, THREE.Bone>;

  constructor(graph: AnatomicalGraphV1, bones: ReadonlyMap<string, THREE.Bone>) {
    this.graph = graph;
    this.bones = bones;
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
    const palmNormals = new Map<string, THREE.Vector3>();
    for (const side of ["left", "right"] as const) {
      const wrist = byRole("wrist_" + side);
      const index = at(fingerId(graph, side, "index", 0));
      const middle = at(fingerId(graph, side, "middle", 0));
      const little = at(fingerId(graph, side, "little", 0));
      let palmNormal = forward.clone();
      if (wrist && index && middle && little) {
        // The indexed knuckle span and wrist-to-knuckle vector form the
        // measured palm plane. Face its normal toward the template's
        // documented +Z anterior direction, not a mirrored Euler sign.
        const lateral = index.clone().sub(little);
        const distal = middle.clone().sub(wrist);
        const candidate = lateral.cross(distal);
        if (candidate.lengthSq() > 1e-10) {
          candidate.normalize();
          if (candidate.dot(forward) < 0) candidate.negate();
          palmNormal = candidate;
        }
      }
      palmNormals.set(side, palmNormal);
    }

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
        const parent = at(joint.parentId);
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
          const indexBase = at(fingerId(graph, handSide, "index", 0));
          const towardIndex = indexBase ? indexBase.clone().sub(current) :
            new THREE.Vector3(handSide === "left" ? 1 : -1, 0, 0);
          add("opposition",
            safeUnit(direction.clone().cross(towardIndex), sideAxis(handSide)),
            0, 1.0);
        }
        if (digit.index === 0 && digit.digit !== "thumb") {
          add("abduction", safeUnit(palmar.clone().cross(direction), yaw), -.22, .22);
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
        add("flexion", pitch, 0, .65);
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
      const motions = commands.get(joint.id);
      if (!motions) continue;
      for (const motion of order) {
        const angle = motions.get(motion);
        if (angle === undefined || angle === 0) continue;
        bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(
          frame.freedoms.get(motion)!.axis, angle));
      }
    }
    this.bones.get(this.graph.joints[0]!.id)!.updateWorldMatrix(true, true);
  }
}
