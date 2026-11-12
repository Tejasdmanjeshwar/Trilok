import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createAnatomyPreset } from "../packages/character-core/src/index";
import { createSkinningSpike } from "../apps/web/src/characters/geometry/SkinningSpike";
import { AnatomicalFK, type JointTarget } from "../apps/web/src/characters/geometry/AnatomicalFK";

function fixture() {
  const rig = createSkinningSpike();
  const fk = new AnatomicalFK(rig.graph, rig.bones);
  const joint = (role: string, side?: string) => rig.graph.joints.find(
    j => j.role === role && (!side || j.id.includes("arm[" + side + ",")))!;
  const target = (role: string, motion: JointTarget["motion"], radians: number,
    side?: string): JointTarget => ({ jointId: joint(role, side).id, motion, radians });
  const position = (role: string, side?: string) =>
    rig.bones.get(joint(role, side).id)!.getWorldPosition(new THREE.Vector3());
  return { rig, fk, joint, target, position };
}
describe("C2.3 anatomical FK", () => {
  it("retains every semantic ID, rest pose and deterministic composition", () => {
    const { rig, fk, target } = fixture();
    const before = rig.graph.joints.map(j =>
      rig.bones.get(j.id)!.quaternion.toArray());
    fk.apply([]);
    expect(rig.graph.joints.map(j => rig.bones.get(j.id)!.quaternion.toArray()))
      .toEqual(before);
    const commands = [
      target("shoulder_left", "abduction", .7),
      target("elbow_left", "flexion", 1.1),
      target("elbow_left", "rotation", .5),
      target("finger_middle_0", "flexion", .9, "left"),
    ];
    fk.apply(commands);
    const a = rig.graph.joints.map(j => rig.bones.get(j.id)!.matrixWorld.toArray());
    fk.apply([...commands].reverse());
    const b = rig.graph.joints.map(j => rig.bones.get(j.id)!.matrixWorld.toArray());
    expect(a).toEqual(b);
    expect(fk.frames.size).toBe(rig.graph.joints.length);
    rig.dispose();
  });
  it("curls all fingers toward their measured palm and independently per side", () => {
    const { rig, fk, target, position } = fixture();
    for (const side of ["left", "right"] as const) {
      const baseline = position("finger_index_2", side);
      const untouched = position("finger_index_2", side === "left" ? "right" : "left");
      const palm = position("palm_" + side);
      const commands = ["thumb", "index", "middle", "ring", "little"].map(digit =>
        target("finger_" + digit + "_0", "flexion", .8, side));
      fk.apply(commands);
      const moved = position("finger_index_2", side);
      const other = position("finger_index_2", side === "left" ? "right" : "left");
      expect(moved.distanceTo(baseline)).toBeGreaterThan(.001);
      expect(other.distanceTo(untouched)).toBeCloseTo(0, 8);
      expect(moved.distanceTo(palm)).toBeLessThan(baseline.distanceTo(palm) + .1);
      fk.apply([]);
    }
    rig.dispose();
  });
  it("separates elbow axial twist from wrist flexion, clamping legal limits", () => {
    const { rig, fk, joint, target, position } = fixture();
    const wristBefore = position("wrist_left");
    const palmBefore = position("palm_left");
    fk.apply([target("elbow_left", "rotation", 100)]);
    const elbow = rig.bones.get(joint("elbow_left").id)!;
    const expected = new THREE.Quaternion().setFromAxisAngle(
      fk.frames.get(joint("elbow_left").id)!.freedoms.get("rotation")!.axis, 1.4);
    expect(elbow.quaternion.angleTo(expected)).toBeLessThan(1e-7);
    expect(position("wrist_left").distanceTo(wristBefore)).toBeLessThan(.0001);
    expect(position("palm_left").distanceTo(palmBefore)).toBeGreaterThan(.0001);
    const wrist = rig.bones.get(joint("wrist_left").id)!;
    expect(wrist.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-7);
    fk.apply([target("wrist_left", "flexion", .5)]);
    expect(elbow.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-7);
    expect(wrist.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(.4);
    rig.dispose();
  });
  it("keeps finger spread and thumb opposition distinct from finger flexion", () => {
    const { rig, fk, joint, target, position } = fixture();
    for (const side of ["left", "right"] as const) {
      const index = joint("finger_index_0", side);
      const frame = fk.frames.get(index.id)!;
      const flex = frame.freedoms.get("flexion")!.axis;
      const spread = frame.freedoms.get("abduction")!.axis;
      expect(Math.abs(flex.dot(spread))).toBeLessThan(.15);
      const thumb = fk.frames.get(joint("finger_thumb_0", side).id)!;
      const thumbFlex = thumb.freedoms.get("flexion")!.axis;
      const opposition = thumb.freedoms.get("opposition")!.axis;
      expect(Math.abs(thumbFlex.dot(opposition))).toBeLessThan(.9);
      const untouched = position("finger_middle_2", side);
      fk.apply([target("finger_index_0", "abduction", .18, side)]);
      expect(position("finger_middle_2", side).distanceTo(untouched)).toBeLessThan(1e-6);
      fk.apply([]);
    }
    rig.dispose();
  });
  it("rejects invalid or duplicate commands atomically", () => {
    const { rig, fk, target, joint } = fixture();
    const valid = target("knee_left", "flexion", 1.3);
    fk.apply([valid]);
    const old = rig.bones.get(joint("knee_left").id)!.quaternion.clone();
    expect(() => fk.apply([valid, valid])).toThrow(/Duplicate/);
    expect(() => fk.apply([valid, target("jaw", "rotation", .5)])).toThrow(/Unsupported/);
    expect(() => fk.apply([target("knee_left", "flexion", NaN)])).toThrow(/Unsupported/);
    expect(rig.bones.get(joint("knee_left").id)!.quaternion.equals(old)).toBe(true);
    rig.dispose();
  });
  it("works on the human base without modifying C1 graph serialization", () => {
    const graph = createAnatomyPreset();
    const before = JSON.stringify(graph);
    const { rig, fk } = fixture();
    for (const side of ["left", "right"] as const) {
      for (const digit of ["thumb", "index", "middle", "ring", "little"]) {
        for (const index of [0, 1, 2]) {
          if (digit === "thumb" && index === 2) continue;
          const j = rig.graph.joints.find(j =>
            j.role === "finger_" + digit + "_" + index && j.id.includes("arm[" + side + ","))!;
          expect(fk.frames.get(j.id)?.freedoms.has("flexion")).toBe(true);
        }
      }
    }
    expect(JSON.stringify(graph)).toBe(before);
    rig.dispose();
  });
});


/**
 * CC0-style tilted MakeHuman hands: these deliberately have nearly zero
 * global-Z palm normals. The sign is established by the volar thumb landmark,
 * not by world +Z or mirrored Euler constants. Coordinates are representative
 * of the source skeleton's rest geometry (scaled to meters).
 */
function tiltedHandFixture() {
  const rig = createSkinningSpike();
  const base: Record<string, readonly [number, number, number]> = {
    wrist: [4.31185, 2.45181, 1.75655],
    palm: [4.29115, 2.22625, 1.96860],
    thumb0: [4.19508, 2.30585, 2.13439],
    thumb1: [4.09483, 2.25569, 2.37332],
    index0: [4.49554, 2.03029, 2.64416],
    index1: [4.53153, 1.89514, 2.85379],
    index2: [4.53383, 1.74540, 3.02354],
    middle0: [4.60830, 1.88615, 2.47898],
    middle1: [4.71245, 1.67240, 2.69079],
    ring0: [4.69636, 1.82499, 2.30946],
    ring1: [4.81135, 1.61740, 2.46117],
    little0: [4.74540, 1.76372, 2.12385],
    little1: [4.80704, 1.58199, 2.22121],
  };
  const joint = (role: string, side: "left" | "right") =>
    rig.graph.joints.find(j => j.role === role &&
      (role.startsWith("finger_") ? j.id.includes("arm[" + side + ",") : role.endsWith("_" + side)))!;
  const source = (key: string, side: "left" | "right") => {
    const [x, y, z] = base[key]!;
    return new THREE.Vector3((side === "right" ? x : -x) * .1, y * .1, z * .1);
  };
  for (const side of ["left", "right"] as const) {
    const mapping = new Map<string, THREE.Vector3>([
      ["wrist_" + side, source("wrist", side)],
      ["palm_" + side, source("palm", side)],
    ]);
    for (const digit of ["thumb", "index", "middle", "ring", "little"] as const) {
      const first = source(digit + "0", side);
      const second = source(digit + "1", side);
      mapping.set("finger_" + digit + "_0", first);
      mapping.set("finger_" + digit + "_1", second);
      if (digit !== "thumb")
        mapping.set("finger_" + digit + "_2", base[digit + "2"] ? source(digit + "2", side) :
          second.clone().add(second.clone().sub(first)));
    }
    // Move parents before descendants, preserving the semantic hierarchy.
    for (const j of rig.graph.joints) {
      const desired = mapping.get(j.role);
      if (!desired || (j.role.startsWith("finger_") &&
          !j.id.includes("arm[" + side + ","))) continue;
      const bone = rig.bones.get(j.id)!;
      bone.parent!.updateWorldMatrix(true, false);
      bone.position.copy(bone.parent!.worldToLocal(desired.clone()));
      bone.updateWorldMatrix(false, true);
    }
  }
  rig.character.root.updateWorldMatrix(true, true);
  const fk = new AnatomicalFK(rig.graph, rig.bones);
  const world = (role: string, side: "left" | "right") =>
    rig.bones.get(joint(role, side).id)!.getWorldPosition(new THREE.Vector3());
  const target = (role: string, side: "left" | "right",
    motion: JointTarget["motion"], radians: number): JointTarget =>
    ({ jointId: joint(role, side).id, motion, radians });
  return { rig, fk, world, target };
}

describe("C2.3 mirrored MakeHuman hand directions", () => {
  it("moves every MCP/PIP/DIP toward the volar side, including individual index curl", () => {
    const { rig, fk, world, target } = tiltedHandFixture();
    for (const side of ["left", "right"] as const) {
      const palmar = fk.palmarNormals.get(side)!;
      const thumb = world("finger_thumb_1", side);
      const wrist = world("wrist_" + side);
      expect(thumb.clone().sub(wrist).dot(palmar)).toBeGreaterThan(0);
      for (const digit of ["index", "middle", "ring", "little"]) {
        for (const index of [0, 1, 2]) {
          const currentRole = "finger_" + digit + "_" + index;
          const at = world(currentRole, side);
          const previous = index > 0 ?
            world("finger_" + digit + "_" + (index - 1), side) :
            world("palm_" + side, side);
          const end = index < 2 ?
            world("finger_" + digit + "_" + (index + 1), side) :
            at.clone().add(at.clone().sub(previous));
          const bone = rig.bones.get(target(currentRole, side, "flexion", .6).jointId)!;
          const local = bone.worldToLocal(end.clone());
          fk.apply([target(currentRole, side, "flexion", .6)]);
          const moved = bone.localToWorld(local.clone());
          expect(moved.clone().sub(end).dot(palmar),
            side + " " + digit + " phalanx " + index + " bent dorsally")
            .toBeGreaterThan(.0001);
          fk.apply([]);
        }
      }
    }
    rig.dispose();
  });
  it("moves each thumb across its palm toward the opposing ring knuckle", () => {
    const { rig, fk, world, target } = tiltedHandFixture();
    for (const side of ["left", "right"] as const) {
      const thumb = world("finger_thumb_1", side);
      const ring = world("finger_ring_0", side);
      const before = thumb.distanceTo(ring);
      fk.apply([target("finger_thumb_0", side, "opposition", .7)]);
      const after = world("finger_thumb_1", side).distanceTo(ring);
      expect(after, side + " thumb abducted away from the opposing palm")
        .toBeLessThan(before - .001);
      fk.apply([]);
    }
    rig.dispose();
  });
});
