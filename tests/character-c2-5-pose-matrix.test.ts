import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { parseAnatomicalOBJ, bindTemplateToSemanticRig } from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import { AnatomicalFK } from
  "../apps/web/src/characters/geometry/AnatomicalFK";
import { ANATOMICAL_POSE_MATRIX, ANATOMICAL_POSE_MATRIX_VERSION,
  resolveAnatomicalPose, type AnatomicalPoseV1 } from
  "../apps/web/src/characters/geometry/AnatomicalPoseMatrix";
import { validateSkinningSpike } from
  "../apps/web/src/characters/geometry/SkinningSpike";
import type { SourceRig, SourceWeights } from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

const source = (file: string) => readFileSync(
  new URL("../apps/web/public/anatomy/" + file, import.meta.url), "utf8");
function makeSession() {
  const template = parseAnatomicalOBJ(source("makehuman-base.obj"),
    { includeGroups: ["body"] });
  const sourceRig = JSON.parse(source("makehuman-default.mhskel")) as SourceRig;
  const weights = JSON.parse(source("makehuman-default_weights.mhw")) as SourceWeights;
  const human = bindTemplateToSemanticRig(template, { rig: sourceRig, weights });
  const fk = new AnatomicalFK(human.spike.graph, human.spike.bones, {
    jawTipWorldRest: human.jawTipWorldRest,
    forearmSkinBones: human.spike.forearmSkinBones,
    shoulderSkinBones: human.spike.shoulderSkinBones,
  });
  return { human, fk };
}
const sample = (human: ReturnType<typeof makeSession>["human"]) => {
  const ids = new Set<number>();
  const count = human.mesh.geometry.getAttribute("position").count;
  for (let i = 0; i < count; i += 23) ids.add(i);
  ids.add(count - 1);
  const first = new Map<number, number>();
  const seamPairs: [number, number][] = [];
  human.template.sourceVertexIds.forEach((sourceId, renderId) => {
    const previous = first.get(sourceId);
    if (previous === undefined) first.set(sourceId, renderId);
    else if (seamPairs.length < 192) {
      seamPairs.push([previous, renderId]);
      ids.add(previous); ids.add(renderId);
    }
  });
  return { ids: [...ids].sort((a, b) => a - b), seamPairs };
};
function positions(human: ReturnType<typeof makeSession>["human"],
  indices: readonly number[]): number[] {
  const p = new THREE.Vector3();
  return indices.flatMap(index => human.mesh.getVertexPosition(index, p).toArray());
}
function checksum(values: readonly number[]): string {
  // Deterministic, order-sensitive fingerprint; equality is intra-instance only.
  return values.map(v => v.toFixed(7)).join(",");
}

describe("C2.5 v1 supported real-asset anatomical pose matrix (CPU Three.js)", () => {
  it("covers every supported region and maintains strict versioned pose metadata", () => {
    expect(ANATOMICAL_POSE_MATRIX_VERSION).toBe(1);
    expect(ANATOMICAL_POSE_MATRIX.length).toBeGreaterThanOrEqual(45);
    const names = ANATOMICAL_POSE_MATRIX.map(p => p.id);
    expect(new Set(names).size).toBe(names.length);
    for (const name of ["neutral", "fist", "thumb", "index", "jaw",
      "overhead", "shoulder", "crouch", "hand-stress", "neck-jaw",
      "whole-extreme", "whole-asymmetric", "deep-crouch", "toe-curl"]) {
      expect(names).toContain(name);
    }
    const regions = new Set(ANATOMICAL_POSE_MATRIX.flatMap(p => p.regions));
    for (const region of ["shoulder", "elbow", "forearm", "hand",
      "spine", "hip", "knee", "ankle", "foot", "head", "jaw"])
      expect(regions.has(region as never)).toBe(true);
    for (const pose of ANATOMICAL_POSE_MATRIX) {
      expect(pose.version).toBe(1);
      expect(pose.label.length).toBeGreaterThan(0);
      expect(pose.expected.length).toBeGreaterThan(8);
      expect(pose.views.length).toBeGreaterThan(0);
      expect(pose.invariants.length).toBeGreaterThanOrEqual(4);
      expect(pose.acceptance).toContain("Visually");
    }
  });

  it("runs all defined imported poses without unsupported or clipped FK, preserving seams, rest and replay", () => {
    const { human, fk } = makeSession();
    try {
      validateSkinningSpike(human.spike);
      const { ids, seamPairs } = sample(human);
      expect(seamPairs.length).toBe(192);
      const baseline = positions(human, ids);
      const inverseBinds = human.spike.skeleton.boneInverses.map(m => m.toArray());
      const sourceIds = Array.from(human.template.sourceVertexIds);
      const topology = Array.from(human.mesh.geometry.getIndex()!.array);
      const sampleRest = human.mesh.geometry.getAttribute("position");
      const restFirst = sampleRest.getX(ids[0]!);
      let articulated = 0;
      for (const pose of ANATOMICAL_POSE_MATRIX) {
        const targets = resolveAnatomicalPose(pose, human.spike.graph, fk);
        fk.apply(targets);
        human.spike.character.root.updateWorldMatrix(true, true);
        const forward = positions(human, ids);
        expect(forward.every(Number.isFinite), pose.id + " generated nonfinite skin").toBe(true);
        const renderIdToOffset = new Map(ids.map((id, n) => [id, n * 3]));
        for (const [a, b] of seamPairs) {
          const ia = renderIdToOffset.get(a)!, ib = renderIdToOffset.get(b)!;
          for (let k = 0; k < 3; k++)
            expect(Math.abs(forward[ia + k]! - forward[ib + k]!),
              pose.id + " split original UV seam").toBeLessThan(2e-6);
        }
        // A physically bounded FK cannot fling the entire body beyond a few body heights.
        for (const coordinate of forward)
          expect(Math.abs(coordinate), pose.id + " wildly displaced vertex").toBeLessThan(8);
        if (pose.targets.length && forward.some((v, k) =>
          Math.abs(v - baseline[k]!) > 1e-4)) articulated++;
        fk.apply([...targets].reverse());
        expect(checksum(positions(human, ids)), pose.id + " command order")
          .toBe(checksum(forward));
        fk.apply([]);
        const recovered = positions(human, ids);
        for (let k = 0; k < recovered.length; k++)
          expect(Math.abs(recovered[k]! - baseline[k]!),
            pose.id + " neutral recovery").toBeLessThan(3e-6);
      }
      expect(articulated).toBe(ANATOMICAL_POSE_MATRIX.length - 1);
      expect(human.spike.skeleton.boneInverses.map(m => m.toArray())).toEqual(inverseBinds);
      expect(Array.from(human.template.sourceVertexIds)).toEqual(sourceIds);
      expect(Array.from(human.mesh.geometry.getIndex()!.array)).toEqual(topology);
      expect(sampleRest.getX(ids[0]!)).toBe(restFirst);
    } finally { human.dispose(); }
  });

  it("rejects an unsupported or out-of-range matrix target before any FK state changes", () => {
    const { human, fk } = makeSession();
    try {
      const before = human.spike.skeleton.bones.map(b => b.quaternion.toArray());
      const original = ANATOMICAL_POSE_MATRIX.find(p => p.id === "neutral")!;
      const broken = {
        ...original, targets: [{ role: "jaw", motion: "opposition" as const, radians: .4 }],
      } satisfies AnatomicalPoseV1;
      expect(() => resolveAnatomicalPose(broken, human.spike.graph, fk))
        .toThrow(/Unsupported anatomical motion/);
      const overLimit = {
        ...original, targets: [{ role: "jaw", motion: "flexion" as const, radians: 8 }],
      } satisfies AnatomicalPoseV1;
      expect(() => resolveAnatomicalPose(overLimit, human.spike.graph, fk))
        .toThrow(/Out-of-bounds/);
      const missing = {
        ...original, targets: [{ role: "unknown_joint", motion: "flexion" as const, radians: .4 }],
      } satisfies AnatomicalPoseV1;
      expect(() => resolveAnatomicalPose(missing, human.spike.graph, fk))
        .toThrow(/Ambiguous\/missing/);
      expect(human.spike.skeleton.bones.map(b => b.quaternion.toArray())).toEqual(before);
    } finally { human.dispose(); }
  });
});
