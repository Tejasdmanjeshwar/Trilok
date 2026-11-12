import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  bindTemplateToSemanticRig, parseAnatomicalOBJ,
} from "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {
  sourceWeightRole, type SourceRig, type SourceWeights,
} from "../apps/web/src/characters/geometry/OfficialHumanRig";
import {
  AnatomicalFK, type JointTarget, type AnatomicalMotion,
} from "../apps/web/src/characters/geometry/AnatomicalFK";

type Side = "left" | "right";
const SIDES = ["left", "right"] as const;
const asset = (file: string): string => readFileSync(
  new URL("../apps/web/public/anatomy/" + file, import.meta.url), "utf8");
function realHand() {
  const template = parseAnatomicalOBJ(asset("makehuman-base.obj"),
    { includeGroups: ["body"] });
  const rig = JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
  const weights = JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
  const human = bindTemplateToSemanticRig(template, { rig, weights });
  const fk = new AnatomicalFK(human.spike.graph, human.spike.bones, {
    jawTipWorldRest: human.jawTipWorldRest,
    forearmSkinBones: human.spike.forearmSkinBones,
    shoulderSkinBones: human.spike.shoulderSkinBones,
  });
  return { human, fk, rig, weights };
}

function target(human: ReturnType<typeof realHand>["human"],
  side: Side, role: string, motion: AnatomicalMotion, radians: number): JointTarget {
  const joint = human.spike.graph.joints.find(j =>
    j.role === role && (role.startsWith("finger_") ?
      j.id.includes("arm[" + side + ",") : role.endsWith("_" + side)));
  if (!joint) throw new Error("Missing C1 " + side + " " + role);
  return { jointId: joint.id, motion, radians };
}
function handPose(human: ReturnType<typeof realHand>["human"],
  name: "thumb" | "fist" | "index" | "wrist-thumb" | "mixed"): JointTarget[] {
  const commands: JointTarget[] = [];
  for (const side of SIDES) {
    const push = (role: string, motion: AnatomicalMotion, radians: number): void => {
      commands.push(target(human, side, role, motion, radians));
    };
    if (name === "wrist-thumb" || name === "mixed") {
      push("wrist_" + side, "flexion", .62);
      push("wrist_" + side, "abduction", side === "left" ? .2 : -.2);
    }
    if (name === "mixed") {
      push("elbow_" + side, "flexion", 1.0);
      push("elbow_" + side, "rotation", side === "left" ? .7 : -.7);
    }
    if (name === "thumb" || name === "wrist-thumb" || name === "mixed") {
      push("finger_thumb_0", "opposition", .75);
      push("finger_thumb_0", "flexion", .55);
      push("finger_thumb_1", "flexion", .7);
    }
    if (name === "index" || name === "mixed") {
      push("finger_index_0", "flexion", 1.2);
      push("finger_index_1", "flexion", 1.1);
      push("finger_index_2", "flexion", .6);
    }
    if (name === "fist") {
      for (const digit of ["index", "middle", "ring", "little"]) {
        push("finger_" + digit + "_0", "flexion", 1.15);
        push("finger_" + digit + "_1", "flexion", 1.19);
        push("finger_" + digit + "_2", "flexion", .55);
      }
      push("finger_thumb_0", "opposition", .55);
      push("finger_thumb_0", "flexion", .4);
      push("finger_thumb_1", "flexion", .55);
    }
  }
  return commands;
}

/** Full CC0 owner table: no 4-weight pruning, no GPU interpolation policy. */
function sourceOwners(weights: SourceWeights): ReadonlyMap<number,
  readonly { name: string; value: number }[]> {
  const result = new Map<number, { name: string; value: number }[]>();
  for (const [name, entries] of Object.entries(weights.weights)) {
    for (const [id, value] of entries) {
      if (value <= 0) continue;
      const owners = result.get(id) ?? [];
      owners.push({ name, value });
      result.set(id, owners);
    }
  }
  return result;
}

function mappedIndex(name: string, human: ReturnType<typeof realHand>["human"]): number {
  const { spike } = human;
  const match = /\.(L|R)$/.exec(name);
  const side: Side = match?.[1] === "L" ? "right" : "left";
  if (/^lowerarm01\.[LR]$/.test(name))
    return spike.skeleton.bones.indexOf(spike.forearmSkinBones!.get(side)!);
  const role = sourceWeightRole(name);
  if (!role) throw new Error("Unexpected source hand influence " + name);
  const joint = spike.graph.joints.find(j =>
    role.startsWith("finger_") ?
      role === j.role + "_" + side &&
      j.id.includes("arm[" + side + ",") : j.role === role);
  if (!joint) throw new Error("No C1 role for " + name + " → " + role);
  const bone = spike.bones.get(joint.id)!;
  return spike.skeleton.bones.indexOf(bone);
}
function expectedUnlimited(sourceId: number, vertexIndex: number,
  weights: ReadonlyMap<number, readonly { name: string; value: number }[]>,
  human: ReturnType<typeof realHand>["human"]): THREE.Vector3 {
  const owners = weights.get(sourceId);
  if (!owners?.length) throw new Error("Unweighted original source " + sourceId);
  const rest = new THREE.Vector3().fromBufferAttribute(
    human.mesh.geometry.getAttribute("position"), vertexIndex);
  const value = new THREE.Vector3();
  let total = 0;
  for (const { name, value: weight } of owners) {
    const index = mappedIndex(name, human);
    const skinMatrix = human.spike.skeleton.bones[index]!.matrixWorld.clone()
      .multiply(human.spike.skeleton.boneInverses[index]!);
    value.addScaledVector(rest.clone().applyMatrix4(skinMatrix), weight);
    total += weight;
  }
  return value.divideScalar(total);
}
function sourceHandIds(weights: ReadonlyMap<number,
  readonly { name: string; value: number }[]>, side: Side): Set<number> {
  const suffix = side === "left" ? ".R" : ".L";
  return new Set([...weights].filter(([, owners]) =>
    owners.some(({ name }) =>
      /^(metacarpal[1-4]|finger[1-5]-[1-3])\./.test(name) &&
      name.endsWith(suffix))).map(([id]) => id));
}

describe("C2.4 CC0 real hand deform diagnostics", () => {
  it("quantifies four-weight hand error against original unpruned source data", () => {
    const { human, fk, weights } = realHand();
    try {
      const owners = sourceOwners(weights);
      const source = human.template.sourceVertexIds;
      const sample = new Map<Side, Map<number, number>>();
      for (const side of SIDES) {
        const ids = sourceHandIds(owners, side);
        const indices = new Map<number, number>();
        source.forEach((sourceId, i) => {
          if (ids.has(sourceId) && !indices.has(sourceId))
            indices.set(sourceId, i);
        });
        expect(indices.size).toBeGreaterThan(1200);
        sample.set(side, indices);
      }
      for (const pose of ["thumb", "fist", "index", "wrist-thumb", "mixed"] as const) {
        fk.apply(handPose(human, pose));
        human.spike.character.root.updateWorldMatrix(true, true);
        for (const side of SIDES) {
          const errors: { id: number; error: number; count: number }[] = [];
          for (const [sourceId, renderId] of sample.get(side)!) {
            const expected = expectedUnlimited(sourceId, renderId, owners, human);
            const actual = human.mesh.getVertexPosition(renderId, new THREE.Vector3());
            const error = actual.distanceTo(expected);
            expect(Number.isFinite(error)).toBe(true);
            errors.push({ id: sourceId, error, count: owners.get(sourceId)!.length });
          }
          errors.sort((a, b) => b.error - a.error);
          const worst = errors[0]!;
          const p95 = errors[Math.floor(errors.length * .05)]!;
          console.log("CC0-HAND", pose, side, "sample", errors.length,
            "worst_m", worst.error.toFixed(6), "p95_m", p95.error.toFixed(6),
            "source", worst.id, "owners", worst.count);
          // These are measured ceilings from the pinned CC0 source and
          // current C1 pose envelope, not assertions about quaternion code.
          // The prior top-four reduction displaced thumb-web skin by
          // 1.116mm; passive-palm compaction reduces it below 0.35mm.
          expect(worst.error, pose + " " + side + " worst source " + worst.id)
            .toBeLessThan(pose === "mixed" ? .0004 :
              pose === "wrist-thumb" ? .0002 : .00006);
        }
      }
    } finally { human.dispose(); }
  }, 60_000);
});


  it("preserves the exact articulated thumb-web source influence and detects old truncation", () => {
    const { human, fk, weights } = realHand();
    try {
      const owners = sourceOwners(weights);
      const { mesh, spike, template } = human;
      const skinIndex = mesh.geometry.getAttribute("skinIndex");
      const skinWeight = mesh.geometry.getAttribute("skinWeight");
      const points = [
        { side: "left" as Side, sourceId: 3683 },
        { side: "right" as Side, sourceId: 10351 },
      ];
      for (const { sourceId, side } of points) {
        const selected: number[] = [];
        template.sourceVertexIds.forEach((id, i) => {
          if (id === sourceId) selected.push(i);
        });
        expect(selected.length).toBeGreaterThan(0);
        const sourceWeights = owners.get(sourceId)!;
        expect(sourceWeights.length).toBe(5);
        const raw = new Map<number, number>();
        for (const { name, value } of sourceWeights) {
          const bone = mappedIndex(name, human);
          raw.set(bone, (raw.get(bone) ?? 0) + value);
        }
        const originalTopFour = [...raw]
          .sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
        const sum = originalTopFour.reduce((value, entry) => value + entry[1], 0);
        const oldIndices = [
          originalTopFour[0]![0], originalTopFour[1]![0],
          originalTopFour[2]![0], originalTopFour[3]![0],
        ];
        const oldWeights = originalTopFour.map((entry, index) =>
          index === 3 ? Math.max(0, 1 -
            originalTopFour.slice(0, 3).reduce((n, i) => n + i[1] / sum, 0)) :
            entry[1] / sum);
        const commands = handPose(human, "thumb");
        fk.apply(commands);
        spike.character.root.updateWorldMatrix(true, true);
        for (const renderId of selected) {
          const baseline = expectedUnlimited(sourceId, renderId, owners, human);
          const corrected = mesh.getVertexPosition(renderId, new THREE.Vector3());
          expect(corrected.distanceTo(baseline),
            "retained thumb web " + side + " source " + sourceId)
            .toBeLessThan(.000005);
          const savedIndices = [0,1,2,3].map(k => skinIndex.getComponent(renderId,k));
          const savedWeights = [0,1,2,3].map(k => skinWeight.getComponent(renderId,k));
          let truncatedError = 0;
          try {
            for (let k=0;k<4;k++) {
              skinIndex.setComponent(renderId,k,oldIndices[k]!);
              skinWeight.setComponent(renderId,k,oldWeights[k]!);
            }
            truncatedError = mesh.getVertexPosition(renderId,
              new THREE.Vector3()).distanceTo(baseline);
          } finally {
            for (let k=0;k<4;k++) {
              skinIndex.setComponent(renderId,k,savedIndices[k]!);
              skinWeight.setComponent(renderId,k,savedWeights[k]!);
            }
          }
          expect(truncatedError,"old top-four reduction must visibly move thumb web")
            .toBeGreaterThan(.0008);
        }
      }
    } finally { human.dispose(); }
  }, 60_000);

  it("proves wrist and passive palm use identical skin transforms in the pose envelope", () => {
    const { human, fk } = realHand();
    try {
      for (const pose of ["thumb","fist","index","wrist-thumb","mixed"] as const) {
        fk.apply(handPose(human, pose));
        human.spike.character.root.updateWorldMatrix(true, true);
        for (const side of SIDES) {
          const graph = human.spike.graph;
          const wrist = graph.joints.find(j=>j.role==="wrist_"+side)!;
          const palm = graph.joints.find(j=>j.role==="palm_"+side)!;
          const wristBone = human.spike.bones.get(wrist.id)!;
          const palmBone = human.spike.bones.get(palm.id)!;
          const wristIndex = human.spike.skeleton.bones.indexOf(wristBone);
          const palmIndex = human.spike.skeleton.bones.indexOf(palmBone);
          expect(wristIndex).toBeGreaterThanOrEqual(0);
          expect(palmIndex).toBeGreaterThanOrEqual(0);
          expect(palm.parentId).toBe(wrist.id);
          const skeleton = human.spike.skeleton;
          const wristSkin = wristBone.matrixWorld.clone()
            .multiply(skeleton.boneInverses[wristIndex]!);
          const palmSkin = palmBone.matrixWorld.clone()
            .multiply(skeleton.boneInverses[palmIndex]!);
          for (let element = 0; element < 16; element++)
            expect(Math.abs(wristSkin.elements[element]! -
              palmSkin.elements[element]!)).toBeLessThan(1e-6);
        }
      }
    } finally { human.dispose(); }
  }, 60_000);
