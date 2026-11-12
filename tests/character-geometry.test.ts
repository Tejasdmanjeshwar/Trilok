import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createSkinningSpike, validateSkinningSpike } from
  "../apps/web/src/characters/geometry/SkinningSpike";
import { createContinuousHumanPrototype } from
  "../apps/web/src/characters/geometry/ContinuousHumanPrototype";

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
  it("generates one indexed, normalized, finite SkinnedMesh with stable topology",()=>{
    const p=createContinuousHumanPrototype({step:.06});
    expect(p.mesh).toBeInstanceOf(THREE.SkinnedMesh);
    expect(p.mesh.geometry.getIndex()?.count).toBeGreaterThan(600);
    expect(p.vertexCount).toBeGreaterThan(100);
    expect(p.triangleCount).toBeGreaterThan(200);
    expect(p.mesh.geometry.getAttribute("position").count).toBe(p.vertexCount);
    expect(p.mesh.geometry.getAttribute("uv").count).toBe(p.vertexCount);
    expect(()=>validateSkinningSpike(p.spike)).not.toThrow();
    const coordinates=Array.from(p.mesh.geometry.getAttribute("position").array);
    const second=createContinuousHumanPrototype({step:.06});
    expect(Array.from(second.mesh.geometry.getAttribute("position").array)).toEqual(coordinates);
    expect(Array.from(second.mesh.geometry.getIndex()!.array)).toEqual(
      Array.from(p.mesh.geometry.getIndex()!.array));
    p.dispose();second.dispose();
  },30_000);
  it("maintains rig deformation, socket transforms and controlled resources",()=>{
    const p=createContinuousHumanPrototype({step:.07});
    const left=p.spike.graph.joints.find(j=>j.role==="shoulder_left")!;
    const bone=p.spike.bones.get(left.id)!;
    const before=p.spike.character.socketWorld(
      p.spike.graph.sockets.find(s=>s.purpose==="primary_grip")!.id);
    const beforePosition=new THREE.Vector3().setFromMatrixPosition(before);
    bone.rotation.z=-1.0;
    p.spike.character.root.updateWorldMatrix(true,true);
    const afterPosition=new THREE.Vector3().setFromMatrixPosition(
      p.spike.character.socketWorld(
        p.spike.graph.sockets.find(s=>s.purpose==="primary_grip")!.id));
    expect(afterPosition.distanceTo(beforePosition)).toBeGreaterThan(.02);
    const geo=p.mesh.geometry;
    let disposal=0;geo.addEventListener("dispose",()=>disposal++);
    p.dispose();p.dispose();
    expect(disposal).toBe(1);
  },30_000);
});
