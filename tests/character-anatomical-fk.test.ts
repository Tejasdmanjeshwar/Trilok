import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createAnatomyPreset } from "../packages/character-core/src/index";
import { createSkinningSpike, validateSkinningSpike } from "../apps/web/src/characters/geometry/SkinningSpike";
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

describe("C2.4 distributed forearm skin FK", () => {
  it("retains full elbow/wrist pronation and a non-twisting proximal skin anchor", () => {
    const rig=createSkinningSpike({forearmSkinning:true});
    const helpers=rig.forearmSkinBones!;
    const fk=new AnatomicalFK(rig.graph,rig.bones,{forearmSkinBones:helpers});
    const joints=rig.graph.joints.map(j=>j.id);
    const initial=rig.skeleton.boneInverses.map(m=>m.toArray());
    for(const side of ["left","right"] as const){
      const joint=rig.graph.joints.find(j=>j.role==="elbow_"+side)!;
      const elbow=rig.bones.get(joint.id)!;
      const helper=helpers.get(side)!;
      const wristJoint=rig.graph.joints.find(j=>j.role==="wrist_"+side)!;
      const wrist=rig.bones.get(wristJoint.id)!;
      const restElbow=elbow.quaternion.clone();
      const restWrist=wrist.quaternion.clone();
      const restHelper=helper.quaternion.clone();
      const bend={jointId:joint.id,motion:"flexion" as const,radians:1.05};
      const twist={jointId:joint.id,motion:"rotation" as const,
        radians:side==="left"?1.15:-1.15};
      fk.apply([twist,bend]);
      const combinedElbow=elbow.quaternion.clone();
      const combinedHelper=helper.quaternion.clone();
      expect(combinedHelper.angleTo(restHelper)).toBeGreaterThan(.5);
      expect(combinedElbow.angleTo(combinedHelper)).toBeGreaterThan(.9);
      expect(wrist.quaternion.angleTo(restWrist)).toBeLessThan(1e-7);
      fk.apply([bend]);
      expect(helper.quaternion.angleTo(combinedHelper)).toBeLessThan(1e-7);
      fk.apply([bend,twist]);
      expect(elbow.quaternion.angleTo(combinedElbow)).toBeLessThan(1e-7);
      fk.apply([twist]);
      expect(helper.quaternion.angleTo(restHelper)).toBeLessThan(1e-7);
      expect(elbow.quaternion.angleTo(restElbow)).toBeGreaterThan(1);
      fk.apply([]);
      expect(elbow.quaternion.angleTo(restElbow)).toBeLessThan(1e-7);
      expect(helper.quaternion.angleTo(restHelper)).toBeLessThan(1e-7);
      expect(wrist.quaternion.angleTo(restWrist)).toBeLessThan(1e-7);
    }
    expect(rig.skeleton.boneInverses.map(m=>m.toArray())).toEqual(initial);
    expect(rig.graph.joints.map(j=>j.id)).toEqual(joints);
    validateSkinningSpike(rig);
    rig.dispose();
  });
});

describe("C2.4 shoulder skin distribution", () => {
  it("drives the intermediate shoulder connector without changing semantic FK", () => {
    const rig=createSkinningSpike({forearmSkinning:true,shoulderSkinning:true});
    const fk=new AnatomicalFK(rig.graph,rig.bones,{
      forearmSkinBones:rig.forearmSkinBones,
      shoulderSkinBones:rig.shoulderSkinBones,
    });
    const semanticIds=rig.graph.joints.map(j=>j.id);
    const restInverses=rig.skeleton.boneInverses.map(m=>m.toArray());
    for(const side of ["left","right"] as const){
      const joint=rig.graph.joints.find(j=>j.role==="shoulder_"+side)!;
      const shoulder=rig.bones.get(joint.id)!;
      const connector=rig.shoulderSkinBones!.get(side)!;
      const opposite=rig.shoulderSkinBones!.get(side==="left"?"right":"left")!;
      const restShoulder=shoulder.quaternion.clone();
      const restConnector=connector.quaternion.clone();
      const restOpposite=opposite.quaternion.clone();
      const targets=[
        {jointId:joint.id,motion:"abduction" as const,radians:1.4},
        {jointId:joint.id,motion:"flexion" as const,radians:.7},
      ];
      fk.apply(targets);
      const full=shoulder.quaternion.clone();
      const half=connector.quaternion.clone();
      const fullAngle=restShoulder.angleTo(full);
      const halfAngle=restConnector.angleTo(half);
      expect(fullAngle).toBeGreaterThan(.5);
      expect(halfAngle).toBeCloseTo(fullAngle*.5,5);
      expect(opposite.quaternion.angleTo(restOpposite)).toBeLessThan(1e-7);
      fk.apply([...targets].reverse());
      expect(shoulder.quaternion.toArray()).toEqual(full.toArray());
      expect(connector.quaternion.toArray()).toEqual(half.toArray());
      fk.apply([]);
      expect(shoulder.quaternion.angleTo(restShoulder)).toBeLessThan(1e-7);
      expect(connector.quaternion.angleTo(restConnector)).toBeLessThan(1e-7);
    }
    expect(rig.graph.joints.map(j=>j.id)).toEqual(semanticIds);
    expect(rig.skeleton.boneInverses.map(m=>m.toArray())).toEqual(restInverses);
    validateSkinningSpike(rig);
    rig.dispose();
  });
  it("leaves disabled shoulder references entirely absent from the C1 diagnostic",()=>{
    const rig=createSkinningSpike();
    expect(rig.shoulderSkinBones).toBeUndefined();
    expect(rig.skeleton.bones.length).toBe(rig.graph.joints.length);
    const fk=new AnatomicalFK(rig.graph,rig.bones);
    expect(()=>fk.apply([])).not.toThrow();
    rig.dispose();
  });
});

describe("C2.4 elbow and wrist skin blends",()=>{
  it("softens proximal elbow skin flexion while retaining full semantic bend and twist",()=>{
    const rig=createSkinningSpike({forearmSkinning:true});
    const fk=new AnatomicalFK(rig.graph,rig.bones,{
      forearmSkinBones:rig.forearmSkinBones,
    });
    const before=rig.graph.joints.map(j=>j.id);
    const inverses=rig.skeleton.boneInverses.map(m=>m.toArray());
    for(const side of ["left","right"] as const){
      const joint=rig.graph.joints.find(j=>j.role==="elbow_"+side)!;
      const elbow=rig.bones.get(joint.id)!;
      const helper=rig.forearmSkinBones!.get(side)!;
      const rest=helper.quaternion.clone();
      const targets=[
        {jointId:joint.id,motion:"flexion" as const,radians:1.4},
        {jointId:joint.id,motion:"rotation" as const,radians:side==="left"?.65:-.65},
      ];
      fk.apply(targets);
      const full=elbow.quaternion.clone();
      const half=helper.quaternion.clone();
      fk.apply([targets[0]!]);
      expect(helper.quaternion.angleTo(rest)).toBeCloseTo(.7,6);
      expect(elbow.quaternion.angleTo(rest)).toBeCloseTo(1.4,6);
      fk.apply([...targets].reverse());
      expect(elbow.quaternion.toArray()).toEqual(full.toArray());
      expect(helper.quaternion.toArray()).toEqual(half.toArray());
      fk.apply([]);
      expect(helper.quaternion.angleTo(rest)).toBeLessThan(1e-7);
    }
    expect(rig.graph.joints.map(j=>j.id)).toEqual(before);
    expect(rig.skeleton.boneInverses.map(m=>m.toArray())).toEqual(inverses);
    rig.dispose();
  });
  it("preserves full bilateral wrist FK and exact rest recovery without a skin bridge",()=>{
    const rig=createSkinningSpike({forearmSkinning:true,shoulderSkinning:true});
    const fk=new AnatomicalFK(rig.graph,rig.bones,{
      forearmSkinBones:rig.forearmSkinBones,
      shoulderSkinBones:rig.shoulderSkinBones,
    });
    const originalIds=rig.graph.joints.map(j=>j.id);
    const initial=rig.skeleton.boneInverses.map(m=>m.toArray());
    const wristBones=rig.graph.joints.filter(j=>j.role.startsWith("wrist_"));
    expect(wristBones).toHaveLength(2);
    expect(rig.skeleton.bones.length).toBe(rig.graph.joints.length+4);
    for(const side of ["left","right"] as const){
      const wristJoint=rig.graph.joints.find(j=>j.role==="wrist_"+side)!;
      const wrist=rig.bones.get(wristJoint.id)!;
      const oppositeJoint=rig.graph.joints.find(j=>j.role==="wrist_"+
        (side==="left"?"right":"left"))!;
      const opposite=rig.bones.get(oppositeJoint.id)!;
      const rest=wrist.quaternion.clone();
      const oppositeRest=opposite.quaternion.clone();
      const commands=[
        {jointId:wristJoint.id,motion:"flexion" as const,radians:.7},
        {jointId:wristJoint.id,motion:"abduction" as const,radians:.28},
      ];
      fk.apply(commands);
      const full=wrist.quaternion.clone();
      expect(rest.angleTo(full)).toBeGreaterThan(.7);
      expect(opposite.quaternion.angleTo(oppositeRest)).toBeLessThan(1e-7);
      fk.apply([...commands].reverse());
      expect(wrist.quaternion.toArray()).toEqual(full.toArray());
      fk.apply([]);
      expect(wrist.quaternion.angleTo(rest)).toBeLessThan(1e-7);
    }
    expect(rig.graph.joints.map(j=>j.id)).toEqual(originalIds);
    expect(rig.skeleton.boneInverses.map(m=>m.toArray())).toEqual(initial);
    validateSkinningSpike(rig);
    rig.dispose();
  });
});

describe("C2.3 mirrored MakeHuman hand directions", () => {
  it("moves every MCP/PIP/DIP toward the volar side, including individual index curl", () => {
    const { rig, fk, world, target } = tiltedHandFixture();
    for (const side of ["left", "right"] as const) {
      const palmar = fk.palmarNormals.get(side)!;
      const thumb = world("finger_thumb_1", side);
      const wrist = world("wrist_" + side, side);
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

describe("C2.3 signed mandibular opening", () => {
  it("opens the mouth by lowering the chin, without moving the upper head", () => {
    for(const yaw of [0, .7, -1.1]){
      const rig=createSkinningSpike();
      rig.character.root.rotation.y=yaw;
      rig.character.root.updateWorldMatrix(true,true);
      const jaw=rig.graph.joints.find(j=>j.role==="jaw")!;
      const head=rig.graph.joints.find(j=>j.role==="head")!;
      const jawBone=rig.bones.get(jaw.id)!;
      const headBone=rig.bones.get(head.id)!;
      // A jaw-tip probe placed ahead of and below its anatomical hinge.
      const chin=jawBone.localToWorld(new THREE.Vector3(0,-.07,.06));
      const tipInJaw=jawBone.worldToLocal(chin.clone());
      const headRest=headBone.getWorldPosition(new THREE.Vector3());
      const fk=new AnatomicalFK(rig.graph,rig.bones,
        {jawTipWorldRest:chin});
      fk.apply([{jointId:jaw.id,motion:"flexion",radians:.4}]);
      const opened=jawBone.localToWorld(tipInJaw.clone());
      expect(opened.y,yaw+" opening did not lower chin").toBeLessThan(chin.y-.005);
      expect(headBone.getWorldPosition(new THREE.Vector3())
        .distanceTo(headRest)).toBeLessThan(1e-7);
      // No negative jaw-opening commands; constraints are preserved.
      fk.apply([{jointId:jaw.id,motion:"flexion",radians:-.7}]);
      expect(jawBone.localToWorld(tipInJaw.clone()).distanceTo(chin))
        .toBeLessThan(1e-7);
      fk.apply([]);
      expect(jawBone.localToWorld(tipInJaw.clone()).distanceTo(chin))
        .toBeLessThan(1e-7);
      rig.dispose();
    }
  });
});
