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
