import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createSkinningSpike, validateSkinningSpike } from
  "../apps/web/src/characters/geometry/SkinningSpike";

describe("C2 genuine SkinnedMesh foundation",()=>{
  it("binds all canonical joints to normalized four-influence GPU attributes",()=>{
    const rig=createSkinningSpike();
    expect(rig.mesh).toBeInstanceOf(THREE.SkinnedMesh);
    expect(rig.skeleton.bones.length).toBe(rig.graph.joints.length);
    expect(rig.mesh.bindMatrix.determinant()).not.toBe(0);
    expect(rig.mesh.scale.toArray()).toEqual([1,1,1]);
    expect(rig.character.root.scale.toArray()).toEqual([1,1,1]);
    expect(rig.vertexCount).toBeGreaterThan(100);
    expect(rig.triangleCount).toBeGreaterThan(100);
    expect(()=>validateSkinningSpike(rig)).not.toThrow();
    rig.dispose();
  });
  it("rejects invalid proportion ranges and invalid skin weights",()=>{
    expect(()=>createSkinningSpike({heightScale:2})).toThrow();
    expect(()=>createSkinningSpike({shoulderScale:NaN})).toThrow();
    const rig=createSkinningSpike();
    const weights=rig.mesh.geometry.getAttribute("skinWeight");
    weights.setX(0,3);
    expect(()=>validateSkinningSpike(rig)).toThrow(/Unnormalized/);
    rig.dispose();
  });
  it("has live bind-pose bone transforms and deterministic proportions",()=>{
    const left=createSkinningSpike(),right=createSkinningSpike();
    expect(Array.from(left.mesh.geometry.getAttribute("position").array)).toEqual(
      Array.from(right.mesh.geometry.getAttribute("position").array));
    const shoulder=left.graph.joints.find(j=>j.role==="shoulder_left")!;
    const bone=left.bones.get(shoulder.id)!;
    const before=bone.getWorldPosition(new THREE.Vector3());
    bone.rotation.z=-.5;left.character.root.updateWorldMatrix(true,true);
    const after=bone.getWorldPosition(new THREE.Vector3());
    expect(after.distanceTo(before)).toBeCloseTo(0); // the joint rotates in place
    expect(left.skeleton.boneInverses.every(m=>Number.isFinite(m.determinant()))).toBe(true);
    left.dispose();right.dispose();
  });
});
describe("C2 continuous implicit topology feasibility",()=>{
  it("generates one indexed, normalized, finite Skin
