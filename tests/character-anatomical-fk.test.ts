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
