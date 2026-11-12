import * as THREE from "three";
import type { HumanLocalMorphologyV1 } from "@trilok/character-core";
import type { AnatomicalHuman } from "./AnatomicalTemplate";

/** Derives all C3.2 spatial landmarks from the real, neutral C2 skeleton.
 * This is a smooth bounded volumetric approximation, not a pose-space sculpt.
 * No global/world scale and no hardcoded absolute human height coordinates. */
const smooth = (t: number): number => {
  const n = THREE.MathUtils.clamp(t, 0, 1);
  return n * n * (3 - 2 * n);
};
const band = (v: number, center: number, radius: number): number =>
  Math.max(0, 1 - smooth(Math.abs(v - center) / radius));
type Side = "left" | "right";
interface Limb {
  readonly shoulder: THREE.Vector3;
  readonly end: THREE.Vector3;
  readonly shift: THREE.Vector3;
  readonly skinIndices: ReadonlySet<number>;
}
export interface HumanLocalTransform {
  vertex(position: THREE.Vector3, index: number): THREE.Vector3;
  joint(position: THREE.Vector3, index: number): THREE.Vector3;
}

export function makeHumanLocalTransform(
  human: AnatomicalHuman,
  shape: HumanLocalMorphologyV1,
): HumanLocalTransform {
  const { spike, mesh } = human;
  const root = spike.character.root;
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const joints = spike.graph.joints;
  const allBones = spike.skeleton.bones;
  const rest = allBones.map(b =>
    b.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInverse));
  const byRole = (role: string): THREE.Vector3 => {
    const i = joints.findIndex(j => j.role === role);
    if (i < 0) throw new Error("Missing C3.2 anatomical landmark " + role);
    return rest[i]!.clone();
  };
  const waist = byRole("spine_lower");
  const chest = byRole("chest");
  const leftShoulder = byRole("shoulder_left");
  const rightShoulder = byRole("shoulder_right");
  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipY = (byRole("hip_left").y + byRole("hip_right").y) / 2;
  const torsoHeight = Math.abs(shoulderY - hipY);
  if (torsoHeight < .25) throw new Error("C3.2 torso landmark separation too small");
  const widthAt = (y: number) =>
    (shape.shoulders - 1) * band(y, shoulderY, torsoHeight * .43) +
    (shape.chest - 1) * band(y, chest.y, torsoHeight * .30) +
    (shape.waist - 1) * band(y, waist.y, torsoHeight * .28) +
    (shape.hips - 1) * band(y, hipY, torsoHeight * .34);
  const depthAt = (y: number) =>
    (shape.chest - 1) * band(y, chest.y, torsoHeight * .32) +
    (shape.waist - 1) * band(y, waist.y, torsoHeight * .29) +
    (shape.hips - 1) * band(y, hipY, torsoHeight * .36);
  const torso = (p: THREE.Vector3) => new THREE.Vector3(
    p.x * (1 + widthAt(p.y)),
    p.y,
    p.z * (1 + depthAt(p.y) * .72),
  );
  const indices = mesh.geometry.getAttribute("skinIndex");
  const weights = mesh.geometry.getAttribute("skinWeight");
  if (indices.itemSize !== 4 || weights.itemSize !== 4)
    throw new Error("C3.2 expects four normalized skin influences");
  const limb = (side: Side, type: "arm" | "leg"): Limb => {
    const start = byRole((type === "arm" ? "shoulder_" : "hip_") + side);
    const end = byRole((type === "arm" ? "wrist_" : "ankle_") + side);
    if (start.distanceTo(end) < .25)
      throw new Error("C3.2 limb calibration too short: " + side + "/" + type);
    const roles = type === "arm"
      ? ["shoulder_", "elbow_", "wrist_", "palm_"]
      : ["hip_", "knee_", "ankle_", "foot_"];
    const owners = new Set<number>();
    joints.forEach((joint, i) => {
      if (roles.some(role => joint.role === role + side) ||
        (type === "arm" && joint.role.startsWith("finger_") &&
          joint.id.includes("arm[" + side + ",")) ||
        (type === "leg" && joint.role === "toe_" + side))
        owners.add(i);
    });
    for (let i = joints.length; i < allBones.length; i++) {
      const name = allBones[i]!.name;
      if (type === "arm" && name.endsWith(side.toUpperCase()) &&
        (name.includes("FOREARM") || name.includes("SHOULDER")))
        owners.add(i);
    }
    return {shoulder:start, end, shift:torso(start).sub(start),
      skinIndices:owners};
  };
  const limbs = [
    limb("left", "arm"), limb("right", "arm"),
    limb("left", "leg"), limb("right", "leg"),
  ] as const;
  const body = (p: THREE.Vector3): THREE.Vector3 =>
    new THREE.Vector3(p.x * shape.breadth, p.y * shape.stature,
      p.z * shape.breadth);
  const limbGeometry = (p: THREE.Vector3, part: Limb, radius: number) => {
    const axis = part.end.clone().sub(part.shoulder);
    const t = THREE.MathUtils.clamp(
      p.clone().sub(part.shoulder).dot(axis) / axis.lengthSq(), 0, 1);
    const center = part.shoulder.clone().addScaledVector(axis, t);
    const radial = p.clone().sub(center);
    // Fade the girth to zero at shoulder/hip and at wrist/ankle, avoiding
    // multiplying connected hand/foot geometry by limb widths.
    const blend = smooth(t / .22) * smooth((1 - t) / .20);
    return radial.multiplyScalar((radius - 1) * blend);
  };
  const deformVertex = (p: THREE.Vector3, index: number) => {
    const local = torso(p);
    const torsoShift = local.sub(p);
    const blended = torsoShift.clone();
    let total = 0;
    const contributions = limbs.map((part, limbIndex) => {
      let w = 0;
      for (let k = 0; k < 4; k++) {
        if (part.skinIndices.has(indices.getComponent(index, k)))
          w += weights.getComponent(index, k);
      }
      w = Math.max(0, Math.min(1, w));
      total += w;
      return {part, w, limbIndex};
    });
    // Each source vertex belongs to at most one normal bilateral limb, except
    // smooth torso/limb transitions. The C2 skin weights provide that blending.
    const base = Math.max(0, 1 - Math.min(1, total));
    blended.multiplyScalar(base);
    for (const {part,w,limbIndex} of contributions) {
      if (w <= 0) continue;
      blended.addScaledVector(part.shift, w);
      const girth = limbIndex < 2 ? shape.arms : shape.legs;
      blended.addScaledVector(limbGeometry(p, part, girth), w);
    }
    return body(p.clone().add(blended));
  };
  const jointIndices = new Map(allBones.map((bone, index) => [bone, index]));
  const boneOwnership = (bone: THREE.Bone): Limb | undefined => {
    const n = bone.name;
    for (const part of limbs) {
      const i = jointIndices.get(bone);
      if (i !== undefined && part.skinIndices.has(i)) return part;
    }
    return undefined;
  };
  return {
    vertex(position, index) { return deformVertex(position, index); },
    joint(position, index) {
      const part = boneOwnership(allBones[index]!);
      return body(position.clone().add(part ? part.shift : torso(position).sub(position)));
    },
  };
}

/** Recompute source-averaged smooth normals, not split normals at UV seams. */
export function recomputeSourceNormals(human: AnatomicalHuman): void {
  const {geometry, sourceVertexIds, sourceVertexCount} = human.template;
  const positions = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const index = geometry.getIndex();
  if (!index || index.count % 3 !== 0) throw new Error("Invalid C3.2 indexed surface");
  const accumulated = new Float64Array(sourceVertexCount * 3);
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    const ax = positions.getX(a), ay = positions.getY(a), az = positions.getZ(a);
    const bx = positions.getX(b) - ax, by = positions.getY(b) - ay, bz = positions.getZ(b) - az;
    const cx = positions.getX(c) - ax, cy = positions.getY(c) - ay, cz = positions.getZ(c) - az;
    const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
    const magnitude = nx * nx + ny * ny + nz * nz;
    if (!Number.isFinite(magnitude) || magnitude < 1e-22)
      throw new Error("C3.2 generated a nonfinite or collapsed triangle " + (i / 3));
    for (const vertex of [a, b, c]) {
      const source = sourceVertexIds[vertex]! * 3;
      accumulated[source] = (accumulated[source] ?? 0) + nx;
      accumulated[source + 1] = (accumulated[source + 1] ?? 0) + ny;
      accumulated[source + 2] = (accumulated[source + 2] ?? 0) + nz;
    }
  }
  for (let i = 0; i < positions.count; i++) {
    const source = sourceVertexIds[i]! * 3;
    const nx = accumulated[source]!, ny = accumulated[source + 1]!, nz = accumulated[source + 2]!;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-15) throw new Error("C3.2 invalid vertex normal");
    normal.setXYZ(i, nx / len, ny / len, nz / len);
  }
  normal.needsUpdate = true;
}
