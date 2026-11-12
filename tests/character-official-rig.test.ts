import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createAnatomyPreset } from "../packages/character-core/src/index";
import { parseAnatomicalOBJ } from "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {
  applyOfficialSkinWeights, sourceBoneForRole, sourceWeightRole,
  makeSourceLandmarks, calibrateHumanBones,
  type SourceRig, type SourceWeights,
} from "../apps/web/src/characters/geometry/OfficialHumanRig";
import { createSkinningSpike, validateSkinningSpike } from
  "../apps/web/src/characters/geometry/SkinningSpike";

const meshSource=[
  "v 0 0 0","v 1 0 0","v 1 2 0","v 0 2 0",
  "vt 0 0","vt 1 0","vt 1 1","vt 0 1","vt .2 .2",
  "f 1/1 2/2 3/3 4/4","f 1/5 4/4 3/3",
].join("\n");
const fixtureRig:SourceRig={
  license:"CC0",
  bones:{
    "head":{head:"origin",tail:"tip",parent:null},
    "root":{head:"origin",tail:"tip",parent:null},
  },
  joints:{origin:[0],tip:[2]},
};
describe("C2.2 CC0 source skeleton and weight retarget",()=>{
  it("resolves official left/right fingers to disjoint semantic IDs",()=>{
    const graph=createAnatomyPreset();
    const left=graph.joints.find(j=>j.role==="finger_index_0"&&j.id.includes("arm[left,"))!;
    const right=graph.joints.find(j=>j.role==="finger_index_0"&&j.id.includes("arm[right,"))!;
    expect(sourceBoneForRole(left.role,left.id)).toBe("finger2-1.R");
    expect(sourceBoneForRole(right.role,right.id)).toBe("finger2-1.L");
    expect(sourceWeightRole("finger2-1.R")).toBe("finger_index_0_left");
    expect(sourceWeightRole("finger2-1.L")).toBe("finger_index_0_right");
    expect(sourceWeightRole("finger1-3.L")).toBe("finger_thumb_1_right");
  });
  it("assigns source shoulder and leg surfaces to their actual C1 segment origins",()=>{
    // The official 163-bone CC0 rig inserts shoulder01 between clavicle and
    // upperarm01; lowerleg02 is still on the shin, foot begins at the ankle.
    // Misplacing these weights deforms the underarm and sends shin/foot skin
    // through adjacent joint rotations during crouch and ankle flexion.
    for(const [source,role] of [
      ["shoulder01.L","clavicle_right"],["shoulder01.R","clavicle_left"],
      ["upperarm01.L","shoulder_right"],["upperarm02.R","shoulder_left"],
      ["lowerleg01.L","knee_right"],["lowerleg02.L","knee_right"],
      ["lowerleg02.R","knee_left"],["foot.L","ankle_right"],
      ["foot.R","ankle_left"],["toe1-1.L","foot_right"],
      ["toe5-1.R","foot_left"],["toe1-2.L","toe_right"],
      ["toe5-3.R","toe_left"],
      ["lowerarm01.R","elbow_left"],["lowerarm02.L","elbow_right"],
      ["wrist.R","wrist_left"],
    ] as const)expect(sourceWeightRole(source),source).toBe(role);
  });
  it("keeps source-index seam equality after shoulder and shin ownership transfer",()=>{
    const template=parseAnatomicalOBJ(meshSource);
    const graph=createAnatomyPreset();
    const source:SourceWeights={license:"CC0",weights:{
      "shoulder01.L":[[0,.8],[1,.4]],"upperarm01.L":[[0,.2],[1,.6]],
      "lowerleg02.L":[[2,.75],[3,.8]],"foot.L":[[2,.25],[3,.2]],
    }};
    const ids=template.sourceVertexIds;
    const geometry=template.geometry;
    const beforePosition=Array.from(geometry.getAttribute("position").array);
    const beforeUV=Array.from(geometry.getAttribute("uv").array);
    const beforeIndex=Array.from(geometry.getIndex()!.array);
    const diagnostics=applyOfficialSkinWeights(template,graph,fixtureRig,source);
    expect(diagnostics.unweightedVertices).toBe(0);
    const skinIds=geometry.getAttribute("skinIndex");
    const weights=geometry.getAttribute("skinWeight");
    const indexFor=(role:string)=>graph.joints.findIndex(j=>j.role===role);
    const expected=[
      [[indexFor("clavicle_right"),.8],[indexFor("shoulder_right"),.2]],
      [[indexFor("shoulder_right"),.6],[indexFor("clavicle_right"),.4]],
      [[indexFor("knee_right"),.75],[indexFor("ankle_right"),.25]],
      [[indexFor("knee_right"),.8],[indexFor("ankle_right"),.2]],
    ] as const;
    for(let i=0;i<ids.length;i++){
      const expectedInfluences=expected[ids[i]!]!;
      for(let k=0;k<expectedInfluences.length;k++){
        expect(skinIds.getComponent(i,k)).toBe(expectedInfluences[k]![0]);
        expect(weights.getComponent(i,k)).toBeCloseTo(expectedInfluences[k]![1],5);
      }
      let sum=0;
      for(let k=0;k<4;k++){
        const w=weights.getComponent(i,k);
        expect(Number.isFinite(w)).toBe(true);
        expect(w).toBeGreaterThanOrEqual(0);
        sum+=w;
      }
      expect(sum).toBeCloseTo(1,5);
    }
    expect(Array.from(ids)).toEqual(Array.from(template.sourceVertexIds));
    expect(Array.from(geometry.getAttribute("position").array)).toEqual(beforePosition);
    expect(Array.from(geometry.getAttribute("uv").array)).toEqual(beforeUV);
    expect(Array.from(geometry.getIndex()!.array)).toEqual(beforeIndex);
    geometry.dispose();
  });
  it("calibrates source landmarks in mesh coordinate space without global scaling",()=>{
    const template=parseAnatomicalOBJ(meshSource);
    const source=new THREE.Float32BufferAttribute(template.sourcePositions,3);
    const markers=makeSourceLandmarks(fixtureRig,template,source);
    expect(markers.get("head")!.x).toBeCloseTo(-.47);
    expect(markers.get("head")!.y).toBeCloseTo(0);
    expect(markers.get("head")!.z).toBeCloseTo(0);
    const rig=createSkinningSpike();
    const head=rig.graph.joints.find(j=>j.role==="head")!;
    const before=rig.bones.get(head.id)!.getWorldPosition(new THREE.Vector3());
    const displacement=calibrateHumanBones(rig.graph,rig.bones,rig.skeleton,
      rig.character.root,markers);
    expect(Number.isFinite(displacement)).toBe(true);
    expect(displacement).toBeGreaterThan(0);
    expect(rig.bones.get(head.id)!.getWorldPosition(new THREE.Vector3())
      .distanceTo(markers.get("head")!)).toBeLessThan(1e-5);
    expect(rig.character.root.scale.toArray()).toEqual([1,1,1]);
    expect(rig.skeleton.boneInverses.every(m=>Number.isFinite(m.determinant()))).toBe(true);
    expect(before.distanceTo(markers.get("head")!)).toBeGreaterThan(0);
    rig.dispose();template.geometry.dispose();
  });
  it("uses identical official weights across UV seams, normalized and isolated by side",()=>{
    const template=parseAnatomicalOBJ(meshSource);
    const graph=createAnatomyPreset();
    const source:SourceWeights={license:"CC0",weights:{
      "finger2-1.L":[[0,1],[1,.9]],
      "finger2-1.R":[[2,1],[3,1]],
      "metacarpal1.L":[[1,.1]],
    }};
    const stats=applyOfficialSkinWeights(template,graph,fixtureRig,source);
    expect(stats.unweightedVertices).toBe(0);
    const ids=template.geometry.getAttribute("skinIndex");
    const weights=template.geometry.getAttribute("skinWeight");
    const original=[...template.sourceVertexIds];
    const corresponding=original.map((v,i)=>({v,i})).filter(x=>x.v===0);
    expect(corresponding.length).toBeGreaterThan(1);
    for(const entry of corresponding) {
      expect(ids.getX(entry.i)).toBe(ids.getX(corresponding[0]!.i));
      expect(weights.getX(entry.i)).toBeCloseTo(1);
    }
    const first=ids.getX(original.indexOf(0));
    const other=ids.getX(original.indexOf(2));
    expect(first).not.toBe(other);
    for(let i=0;i<ids.count;i++){
      let sum=0;
      for(let k=0;k<4;k++)sum+=weights.getComponent(i,k);
      expect(sum).toBeCloseTo(1,5);
    }
    template.geometry.dispose();
  });
  it("separates the source lowerarm01 and lowerarm02 twist references without changing the C1 graph",()=>{
    const template=parseAnatomicalOBJ(meshSource);
    const spike=createSkinningSpike({forearmSkinning:true});
    const beforeIds=spike.graph.joints.map(j=>j.id);
    const beforeUV=Array.from(template.geometry.getAttribute("uv").array);
    const beforeVertices=Array.from(template.sourceVertexIds);
    const beforeIndices=Array.from(template.geometry.getIndex()!.array);
    const helpers=spike.forearmSkinBones!;
    expect(spike.skeleton.bones.length).toBe(spike.graph.joints.length+2);
    for(const side of ["left","right"] as const){
      const elbow=spike.graph.joints.find(j=>j.role==="elbow_"+side)!;
      expect(helpers.get(side)!.parent).toBe(spike.bones.get(elbow.id)!.parent);
    }
    const helperIndex=(side:"left"|"right")=>
      spike.skeleton.bones.indexOf(helpers.get(side)!);
    const source:SourceWeights={license:"CC0",weights:{
      "lowerarm01.L":[[0,1]],"lowerarm02.L":[[1,1]],
      "lowerarm01.R":[[2,1]],"lowerarm02.R":[[3,1]],
    }};
    const stats=applyOfficialSkinWeights(template,spike.graph,fixtureRig,
      source,new Map([["left",helperIndex("left")],
        ["right",helperIndex("right")]]));
    expect(stats.unweightedVertices).toBe(0);
    const skin=template.geometry.getAttribute("skinIndex");
    const skinWeights=template.geometry.getAttribute("skinWeight");
    const roleIndex=(name:string)=>spike.graph.joints.findIndex(j=>j.role===name);
    const expected=[
      helperIndex("right"),roleIndex("elbow_right"),
      helperIndex("left"),roleIndex("elbow_left"),
    ];
    for(let i=0;i<template.sourceVertexIds.length;i++){
      expect(skin.getX(i)).toBe(expected[template.sourceVertexIds[i]!]!);
      expect(skinWeights.getX(i)).toBeCloseTo(1,6);
      let sum=0;
      for(let k=0;k<4;k++)sum+=skinWeights.getComponent(i,k);
      expect(sum).toBeCloseTo(1,5);
    }
    expect(Array.from(template.sourceVertexIds)).toEqual(beforeVertices);
    expect(Array.from(template.geometry.getAttribute("uv").array)).toEqual(beforeUV);
    expect(Array.from(template.geometry.getIndex()!.array)).toEqual(beforeIndices);
    expect(spike.graph.joints.map(j=>j.id)).toEqual(beforeIds);
    validateSkinningSpike(spike);
    template.geometry.dispose();spike.dispose();
  });
  it("rejects unlicensed or malformed source weight assignments",()=>{
    const template=parseAnatomicalOBJ(meshSource);
    const graph=createAnatomyPreset();
    expect(()=>applyOfficialSkinWeights(template,graph,fixtureRig,
      {license:"GPL",weights:{"head":[[0,1]]}})).toThrow(/CC0/);
    expect(()=>applyOfficialSkinWeights(template,graph,fixtureRig,
      {license:"CC0",weights:{"head":[[999,1]]}})).toThrow(/Invalid/);
    template.geometry.dispose();
  });
});
