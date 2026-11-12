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
          // Diagnostic broad ceiling pending evidence-based thresholding.
          expect(worst.error).toBeLessThan(.035);
        }
      }
    } finally { human.dispose(); }
  }, 60_000);
});
