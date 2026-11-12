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
  it("keeps CC0 shoulder01 skin distinct from clavicle and upperarm without changing UV seams",()=>{
    const template=parseAnatomicalOBJ(meshSource);
    const rig=createSkinningSpike({forearmSkinning:true,shoulderSkinning:true});
    const graph=rig.graph;
    const shoulders=rig.shoulderSkinBones!;
    const first=graph.joints.length+2;
    expect(rig.skeleton.bones[first]).toBe(shoulders.get("left"));
    expect(rig.skeleton.bones[first+1]).toBe(shoulders.get("right"));
    const sources=Array.from(template.sourceVertexIds);
    const uv=Array.from(template.geometry.getAttribute("uv").array);
    const index=Array.from(template.geometry.getIndex()!.array);
    const position=Array.from(template.geometry.getAttribute("position").array);
    const weights:SourceWeights={license:"CC0",weights:{
      "clavicle.L":[[0,.3],[1,.6]],
      "shoulder01.L":[[0,.7],[1,.4]],
      "shoulder01.R":[[2,.8],[3,.5]],
      "upperarm01.R":[[2,.2],[3,.5]],
    }};
    const forearmIndices=new Map<"left"|"right",number>([
      ["left",graph.joints.length],["right",graph.joints.length+1]]);
    const shoulderIndices=new Map<"left"|"right",number>([
      ["left",first],["right",first+1]]);
    const diagnostics=applyOfficialSkinWeights(template,graph,fixtureRig,
      weights,forearmIndices,shoulderIndices);
    expect(diagnostics.unweightedVertices).toBe(0);
    const ids=template.geometry.getAttribute("skinIndex");
    const sw=template.geometry.getAttribute("skinWeight");
    const role=(name:string)=>graph.joints.findIndex(j=>j.role===name);
    const expected=[
      [[first+1,.7],[role("clavicle_right"),.3]],
      [[role("clavicle_right"),.6],[first+1,.4]],
      [[first,.8],[role("shoulder_left"),.2]],
      [[first,.5],[role("shoulder_left"),.5]],
    ] as const;
    for(let i=0;i<sources.length;i++){
      const want=expected[sources[i]!]!;
      const actual=new Map<number,number>();
      let sum=0;
      for(let k=0;k<4;k++){
        const bone=ids.getComponent(i,k),w=sw.getComponent(i,k);
        if(w>0)actual.set(bone,w);
        sum+=w;
      }
      for(const [bone,w] of want)
        expect(actual.get(bone)).toBeCloseTo(w,5);
      expect(sum).toBeCloseTo(1,5);
    }
    expect(Array.from(template.sourceVertexIds)).toEqual(sources);
    expect(Array.from(template.geometry.getAttribute("uv").array)).toEqual(uv);
    expect(Array.from(template.geometry.getIndex()!.array)).toEqual(index);
    expect(Array.from(template.geometry.getAttribute("position").array)).toEqual(position);
    rig.mesh.geometry=template.geometry;
    validateSkinningSpike(rig);
    // Template and diagnostic geometry are independent owned resources.
    rig.dispose();
  });
  it("calibrates shoulder skin connectors to the original source landmark",()=>{
    const rig=createSkinningSpike({shoulderSkinning:true});
    const template=parseAnatomicalOBJ(meshSource);
    const original=rig.graph.joints.map(j=>j.id);
    const landmarks=new Map<string,THREE.Vector3>();
    for(const side of ["left","right"] as const){
      const shoulder=rig.graph.joints.find(j=>j.role==="shoulder_"+side)!;
      const elbow=rig.bones.get(shoulder.id)!;
      const p=elbow.getWorldPosition(new THREE.Vector3());
      landmarks.set("shoulder01"+(side==="left"?".R":".L"),
        p.add(new THREE.Vector3(side==="left"?-.02:.02,.015,0)));
    }
    calibrateHumanBones(rig.graph,rig.bones,rig.skeleton,rig.character.root,
      landmarks,undefined,rig.shoulderSkinBones);
    for(const side of ["left","right"] as const){
      const key="shoulder01"+(side==="left"?".R":".L");
      const helper=rig.shoulderSkinBones!.get(side)!;
      const actual=helper.getWorldPosition(new THREE.Vector3());
      expect(actual.distanceTo(landmarks.get(key)!)).toBeLessThan(1e-6);
      expect(rig.skeleton.boneInverses[rig.skeleton.bones.indexOf(helper)]!
        .elements.every(Number.isFinite)).toBe(true);
    }
    expect(rig.graph.joints.map(j=>j.id)).toEqual(original);
    template.geometry.dispose();rig.dispose();
  });
  it("retains exact CC0 wrist-band source weights across UV seams and both hands",()=>{
    const template=parseAnatomicalOBJ(meshSource);
    const rig=createSkinningSpike({forearmSkinning:true,
      shoulderSkinning:true,wristSkinning:true});
    const sourceVertices=Array.from(template.sourceVertexIds);
    const originalPosition=Array.from(template.geometry.getAttribute("position").array);
    const originalUV=Array.from(template.geometry.getAttribute("uv").array);
    const originalIndex=Array.from(template.geometry.getIndex()!.array);
    const start=rig.graph.joints.length;
    const proximal=new Map<"left"|"right",number>([
      ["left",start],["right",start+1]]);
    const shoulder=new Map<"left"|"right",number>([
      ["left",start+2],["right",start+3]]);
    const wrist=new Map<"left"|"right",number>([
      ["left",start+4],["right",start+5]]);
    expect(rig.skeleton.bones[start+4]).toBe(rig.wristSkinBones!.get("left"));
    expect(rig.skeleton.bones[start+5]).toBe(rig.wristSkinBones!.get("right"));
    const weights:SourceWeights={license:"CC0",weights:{
      "wrist.L":[[0,.7],[1,.45]],
      "metacarpal1.L":[[0,.3],[1,.55]],
      "wrist.R":[[2,.6],[3,.25]],
      "metacarpal2.R":[[2,.4],[3,.75]],
    }};
    const diagnostics=applyOfficialSkinWeights(template,rig.graph,fixtureRig,
      weights,proximal,shoulder,wrist);
    expect(diagnostics.unweightedVertices).toBe(0);
    const ids=template.geometry.getAttribute("skinIndex");
    const sw=template.geometry.getAttribute("skinWeight");
    const palmLeft=rig.graph.joints.findIndex(j=>j.role==="palm_left");
    const palmRight=rig.graph.joints.findIndex(j=>j.role==="palm_right");
    const expected=[
      [[start+5,.7],[palmRight,.3]],
      [[palmRight,.55],[start+5,.45]],
      [[start+4,.6],[palmLeft,.4]],
      [[palmLeft,.75],[start+4,.25]],
    ] as const;
    for(let i=0;i<sourceVertices.length;i++){
      const actual=new Map<number,number>();
      let total=0;
      for(let k=0;k<4;k++){
        const id=ids.getComponent(i,k),weight=sw.getComponent(i,k);
        if(weight>0)actual.set(id,weight);
        expect(Number.isFinite(weight)).toBe(true);
        total+=weight;
      }
      expect(total).toBeCloseTo(1,5);
      for(const [bone,weight] of expected[sourceVertices[i]!]!)
        expect(actual.get(bone)).toBeCloseTo(weight,5);
    }
    expect(Array.from(template.sourceVertexIds)).toEqual(sourceVertices);
    expect(Array.from(template.geometry.getAttribute("position").array)).toEqual(originalPosition);
    expect(Array.from(template.geometry.getAttribute("uv").array)).toEqual(originalUV);
    expect(Array.from(template.geometry.getIndex()!.array)).toEqual(originalIndex);
    rig.mesh.geometry=template.geometry;
    validateSkinningSpike(rig);
    rig.dispose();
  });
  it("copies calibrated wrist bind origins to skin-only references",()=>{
    const rig=createSkinningSpike({wristSkinning:true});
    const landmarks=new Map<string,THREE.Vector3>();
    for(const side of ["left","right"] as const){
      const joint=rig.graph.joints.find(j=>j.role==="wrist_"+side)!;
      const wrist=rig.bones.get(joint.id)!;
      landmarks.set("wrist"+(side==="left"?".R":".L"),
        wrist.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.015,0)));
    }
    const semanticIds=rig.graph.joints.map(j=>j.id);
    calibrateHumanBones(rig.graph,rig.bones,rig.skeleton,rig.character.root,
      landmarks,undefined,undefined,rig.wristSkinBones);
    for(const side of ["left","right"] as const){
      const key="wrist"+(side==="left"?".R":".L");
      const wristJoint=rig.graph.joints.find(j=>j.role==="wrist_"+side)!;
      const wrist=rig.bones.get(wristJoint.id)!;
      const bridge=rig.wristSkinBones!.get(side)!;
      expect(bridge.getWorldPosition(new THREE.Vector3())
        .distanceTo(wrist.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-7);
      expect(wrist.getWorldPosition(new THREE.Vector3())
        .distanceTo(landmarks.get(key)!)).toBeLessThan(1e-7);
      expect(rig.skeleton.boneInverses[rig.skeleton.bones.indexOf(bridge)]!
        .elements.every(Number.isFinite)).toBe(true);
    }
    expect(rig.graph.joints.map(j=>j.id)).toEqual(semanticIds);
    validateSkinningSpike(rig);
    rig.dispose();
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
