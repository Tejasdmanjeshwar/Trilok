import {describe,it,expect} from "vitest";
import * as THREE from "three";
import {
  originalKevinBoneName,indexKevinBones,normalizeKevinFBXScene,
} from "../scripts/lib/kevin-fbx-source.mjs";

const fixture=()=>{
  const scene=new THREE.Group();
  const points=[
    ["B-hips",[0,0,97.9712]],
    ["B-head",[0,0,179.5]],
    ["B-hand.L",[62.9167,0.983,142.477]],
    ["B-hand.R",[-62.9167,0.983,142.477]],
    ["B-foot.L",[11.825,1.163,12.84]],
    ["B-foot.R",[-11.825,1.163,12.84]],
  ];
  for(const [name,xyz] of points){
    const bone=new THREE.Bone();
    bone.name=name.replace(".","_");
    bone.userData.originalName=name;
    bone.position.fromArray(xyz);
    scene.add(bone);
  }
  return scene;
};
describe("C6.3 Kevin import reference and normalizer",()=>{
  it("restores original FBX names without renaming track-bearing Three objects",()=>{
    const source=new THREE.Bone();
    source.name="B-indexFinger01_R";
    expect(originalKevinBoneName(source)).toBe("B-indexFinger01.R");
    source.userData.originalName="B-indexFinger01.R";
    expect(originalKevinBoneName(source)).toBe("B-indexFinger01.R");
    source.userData.originalName="pelvis";
    expect(()=>originalKevinBoneName(source)).toThrow(/Unexpected Kevin/);
  });
  it("normalizes Z-up centimeters to C1 Y-up meters once per source rig",()=>{
    const scene=fixture(),bones=normalizeKevinFBXScene(scene,{expectedBoneCount:6});
    expect(bones.size).toBe(6);
    expect(bones.get("B-hips").getWorldPosition(new THREE.Vector3()).y)
      .toBeCloseTo(.979712,5);
    expect(bones.get("B-hand.L").getWorldPosition(new THREE.Vector3()).x)
      .toBeCloseTo(.629167,5);
    expect(bones.get("B-foot.L").getWorldPosition(new THREE.Vector3()).y)
      .toBeCloseTo(.1284,5);
    expect(()=>normalizeKevinFBXScene(scene,{expectedBoneCount:6}))
      .toThrow(/Unexpected FBXLoader scene transform/);
  });
  it("rejects truncated source rigs and mislabeled anatomical sides",()=>{
    const scene=fixture();
    expect(()=>indexKevinBones(scene)).toThrow(/bone count/);
    const bones=indexKevinBones(scene,6);
    expect(bones.get("B-hand.R").name).toBe("B-hand_R");
    // Out-of-range/changed source root transform must never be accepted.
    const corrupted=fixture();
    corrupted.rotation.set(1,0,0);
    expect(()=>normalizeKevinFBXScene(corrupted,{expectedBoneCount:6}))
      .toThrow(/Unexpected FBXLoader scene transform/);
  });
});
