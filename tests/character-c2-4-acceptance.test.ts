import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  bindTemplateToSemanticRig, parseAnatomicalOBJ,
} from "../apps/web/src/characters/geometry/AnatomicalTemplate";
import { AnatomicalFK, type AnatomicalMotion, type JointTarget } from
  "../apps/web/src/characters/geometry/AnatomicalFK";
import { validateSkinningSpike } from
  "../apps/web/src/characters/geometry/SkinningSpike";
import type { SourceRig, SourceWeights } from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

const readAsset = (name: string): string => readFileSync(
  new URL("../apps/web/public/anatomy/" + name, import.meta.url), "utf8");

function importedHuman() {
  const template = parseAnatomicalOBJ(readAsset("makehuman-base.obj"),
    { includeGroups: ["body"] });
  const rig = JSON.parse(readAsset("makehuman-default.mhskel")) as SourceRig;
  const weights = JSON.parse(readAsset("makehuman-default_weights.mhw")) as SourceWeights;
  const human = bindTemplateToSemanticRig(template, { rig, weights });
  const fk = new AnatomicalFK(human.spike.graph, human.spike.bones, {
    jawTipWorldRest: human.jawTipWorldRest,
    forearmSkinBones: human.spike.forearmSkinBones,
    shoulderSkinBones: human.spike.shoulderSkinBones,
  });
  return { human, fk };
}
type Human = ReturnType<typeof importedHuman>;

function combinedPose({ human }: Human): JointTarget[] {
  const targets: JointTarget[] = [];
  const add = (role: string, motion: AnatomicalMotion, radians: number) => {
    const joint = human.spike.graph.joints.find(j => j.role === role);
    if (!joint) throw new Error("No canonical role " + role);
    targets.push({ jointId: joint.id, motion, radians });
  };
  for (const side of ["left", "right"] as const) {
    add("clavicle_" + side, "abduction", .2);
    add("shoulder_" + side, "abduction", 1.15);
    add("shoulder_" + side, "flexion", .55);
    add("elbow_" + side, "flexion", 1.6);
    add("elbow_" + side, "rotation", side === "left" ? .6 : -.6);
    add("wrist_" + side, "flexion", .4);
    add("hip_" + side, "flexion", 1.05);
    add("hip_" + side, "abduction", .3);
    add("knee_" + side, "flexion", 1.5);
    add("ankle_" + side, "flexion", -.3);
    const finger = human.spike.graph.joints.find(j =>
      j.role === "finger_index_0" && j.id.includes("arm[" + side + ","));
    if (!finger) throw new Error("Missing C1 index knuckle " + side);
    targets.push({ jointId: finger.id, motion: "flexion", radians: .8 });
  }
  add("chest", "rotation", .25);
  add("neck", "rotation", .3);
  add("jaw", "flexion", .3);
  return targets;
}

function sampleIds(human: Human["human"]): number[] {
  const ids = new Set<number>();
  const count = human.mesh.geometry.getAttribute("position").count;
  for (let i = 0; i < count; i += 17) ids.add(i);
  ids.add(count - 1);
  const firstBySource = new Map<number, number>();
  let seams = 0;
  human.template.sourceVertexIds.forEach((source, rendered) => {
    const first = firstBySource.get(source);
    if (first === undefined) firstBySource.set(source, rendered);
    else if (seams++ < 150) { ids.add(first); ids.add(rendered); }
  });
  expect(seams).toBeGreaterThan(150);
  return [...ids].sort((a, b) => a - b);
}

function cpuPositions(human: Human["human"], vertices: readonly number[]): number[] {
  return vertices.flatMap(i =>
    human.mesh.getVertexPosition(i, new THREE.Vector3()).toArray());
}

function assertOriginalSeams(human: Human["human"]): void {
  const skin = human.mesh.geometry.getAttribute("skinIndex");
  const weight = human.mesh.geometry.getAttribute("skinWeight");
  const rest = human.mesh.geometry.getAttribute("position");
  const original = new Map<number, number>();
  let seamVertices = 0;
  const temporary = new THREE.Vector3();
  human.template.sourceVertexIds.forEach((id, rendered) => {
    const first = original.get(id);
    if (first === undefined) {
      original.set(id, rendered);
      return;
    }
    seamVertices++;
    for (let k = 0; k < 4; k++) {
      expect(skin.getComponent(rendered, k)).toBe(skin.getComponent(first, k));
      expect(weight.getComponent(rendered, k)).toBeCloseTo(
        weight.getComponent(first, k), 6);
    }
    for (let k = 0; k < 3; k++)
      expect(rest.getComponent(rendered, k)).toBe(
        rest.getComponent(first, k));
    const firstPose = human.mesh.getVertexPosition(first, temporary);
    const seamPose = human.mesh.getVertexPosition(rendered, new THREE.Vector3());
    expect(firstPose.distanceTo(seamPose),
      "original source " + id + " must deform identically across UV seams")
      .toBeLessThan(2e-6);
  });
  expect(seamVertices).toBeGreaterThan(150);
}

describe("C2.4 targeted anatomical skinning acceptance (pinned CC0, no WebGL)", () => {
  it("restores source-correct UV seams and identical skin after a full-body FK combination", () => {
    const rig = importedHuman();
    try {
      const { human, fk } = rig;
      expect(human.spike.forearmSkinBones?.size).toBe(2);
      expect(human.spike.shoulderSkinBones?.size).toBe(2);
      expect(human.mesh.scale.toArray()).toEqual([1, 1, 1]);
      expect(human.spike.character.root.scale.toArray()).toEqual([1, 1, 1]);
      validateSkinningSpike(human.spike);
      const vertices = sampleIds(human);
      const rest = cpuPositions(human, vertices);
      const restInverse = human.spike.skeleton.boneInverses.map(m => m.toArray());
      const canonicalIds = human.spike.graph.joints.map(j => j.id);
      const pose = combinedPose(rig);
      fk.apply(pose);
      assertOriginalSeams(human);
      const positioned = cpuPositions(human, vertices);
      expect(positioned.some((value, i) =>
        Math.abs(value - rest[i]!) > .01)).toBe(true);
      expect(positioned.every(Number.isFinite)).toBe(true);
      fk.apply([...pose].reverse());
      expect(cpuPositions(human, vertices)).toEqual(positioned);
      fk.apply([]);
      for (let i = 0; i < rest.length; i++)
        expect(Math.abs(cpuPositions(human, vertices)[i]! - rest[i]!))
          .toBeLessThan(3e-6);
      expect(human.spike.skeleton.boneInverses.map(m => m.toArray()))
        .toEqual(restInverse);
      expect(human.spike.graph.joints.map(j => j.id)).toEqual(canonicalIds);
      validateSkinningSpike(human.spike);
    } finally {
      rig.human.dispose();
    }
  });

  it("keeps separate imported instances isolated and disposes owned resources once", () => {
    const first = importedHuman();
    const second = importedHuman();
    try {
      const a = sampleIds(first.human);
      const b = sampleIds(second.human);
      expect(a).toEqual(b);
      const before = cpuPositions(second.human, b);
      const graphBefore = second.human.spike.graph.joints.map(j => j.id);
      const positionBefore = Array.from(
        second.human.mesh.geometry.getAttribute("position").array);
      first.fk.apply(combinedPose(first));
      expect(cpuPositions(second.human, b)).toEqual(before);
      expect(second.human.spike.graph.joints.map(j => j.id))
        .toEqual(graphBefore);
      expect(Array.from(second.human.mesh.geometry.getAttribute("position").array))
        .toEqual(positionBefore);
      first.fk.apply([]);
      expect(cpuPositions(first.human, a)).toEqual(before);
    } finally {
      for (const { human } of [first, second]) {
        const geometry = human.mesh.geometry;
        const material = human.mesh.material as THREE.Material;
        let geoDisposed = 0;
        let materialDisposed = 0;
        geometry.addEventListener("dispose", () => geoDisposed++);
        material.addEventListener("dispose", () => materialDisposed++);
        human.dispose();
        human.dispose();
        expect(geoDisposed).toBe(1);
        expect(materialDisposed).toBe(1);
      }
    }
  });
});
