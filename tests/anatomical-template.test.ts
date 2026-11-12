import { describe,expect,it } from "vitest";
import * as THREE from "three";
import { bindTemplateToSemanticRig,parseAnatomicalOBJ } from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import { validateSkinningSpike } from
  "../apps/web/src/characters/geometry/SkinningSpike";

// Inline CC0-independent synthetic fixture: tests never depend on a download.
const fixture=[
  "# small five-vertex source with a quad and a deliberate UV seam",
  "v -1 0 0","v 1 0 0","v 1 2 0","v -1 2 0","v 0 1 0.5",
  "vt 0 0","vt 1 0","vt 1 1","vt 0 1","vt .1 .1",
  "f 1/1 2/2 3/3 4/4","f 1/5 4/4 5/3",
].join("\n");

describe("C2 verified-source anatomical OBJ importer",()=>{
  it("preserves upstream IDs across UV seams and triangulates quads deterministically",()=>{
    const first=parseAnatomicalOBJ(fixture);
    const second=parseAnatomicalOBJ(fixture);
    expect(first.sourceVertexCount).toBe(5);
    expect(first.sourceFaceCount).toBe(2);
    expect(first.sourceVertexIds.length).toBe(6); // seam duplicates v1 at different vt
    expect(first.sourceVertexIds[0]).toBe(first.sourceVertexIds[4]);
    expect(first.geometry.getIndex()!.count).toBe(9);
    expect(first.connectedComponents).toBe(1);
    expect(first.boundaryEdgeCount).toBeGreaterThan(0);
    expect(first.nonManifoldEdgeCount).toBe(0);
    expect(first.conversionMetersPerSourceUnit).toBeCloseTo(.94);
    expect(first.geometry.boundingBox!.max.y).toBeCloseTo(1.88);
    expect(Array.from(first.geometry.getAttribute("position").array)).toEqual(
      Array.from(second.geometry.getAttribute("position").array));
    expect(Array.from(first.sourceVertexIds)).toEqual(Array.from(second.sourceVertexIds));
    for(const name of ["position","normal","uv"])
      expect([...first.geometry.getAttribute(name).array].every(Number.isFinite)).toBe(true);
    first.geometry.dispose();second.geometry.dispose();
  });
  it("excludes MakeHuman helper geometry without renumbering source vertices",()=>{
    const grouped=fixture.replace("v 0 1 0.5","v 0 1 0.5\nv 0 99 0")
      .replace("f 1/1 2/2 3/3 4/4","g body\nf 1/1 2/2 3/3 4/4")
      .replace("f 1/5 4/4 5/3","g helper-skirt\nf 1/5 4/4 5/3");
    const template=parseAnatomicalOBJ(grouped,{includeGroups:["body"]});
    expect(template.sourceVertexCount).toBe(6); // all original v positions retained
    expect(template.sourceFaceCount).toBe(1); // only actual skin surface
    expect(template.geometry.getIndex()!.count).toBe(6);
    expect(Array.from(template.sourceVertexIds)).toEqual([0,1,2,3]);
    expect(template.sourceHeight).toBe(2); // ignores omitted height=99 helper
    expect(template.geometry.boundingBox!.max.y).toBeCloseTo(1.88);
    expect(()=>parseAnatomicalOBJ(grouped,{includeGroups:["missing"]})).toThrow(/Empty/);
    template.geometry.dispose();
  });
  it("binds unchanged C1 semantic bones with finite normalized four-weight influences",()=>{
    const p=bindTemplateToSemanticRig(parseAnatomicalOBJ(fixture));
    expect(p.mesh).toBeInstanceOf(THREE.SkinnedMesh);
    expect(p.mesh.scale.toArray()).toEqual([1,1,1]);
    expect(p.spike.character.root.scale.toArray()).toEqual([1,1,1]);
    expect(p.spike.skeleton.bones.length).toBe(p.spike.graph.joints.length);
    expect(()=>validateSkinningSpike(p.spike)).not.toThrow();
    const b=p.spike.bones.get(p.spike.graph.joints.find(j=>j.role==="shoulder_left")!.id)!;
    b.rotation.z=-.9;
    p.spike.character.root.updateWorldMatrix(true,true);
    const disposal:number[]=[];
    p.mesh.geometry.addEventListener("dispose",()=>disposal.push(1));
    p.dispose();p.dispose();
    expect(disposal).toEqual([1]);
  });
  it("rejects nonfinite, invalid-index, degenerate and pathological sources",()=>{
    expect(()=>parseAnatomicalOBJ(fixture.replace("v 1 2 0","v NaN 2 0"))).toThrow(/Nonfinite/);
    expect(()=>parseAnatomicalOBJ(fixture.replace("f 1\/1 2\/2 3\/3 4\/4","f 1/1 2/2 99/3 4/4"))).toThrow(/Invalid OBJ index/);
    expect(()=>parseAnatomicalOBJ(fixture.replace("f 1\/1 2\/2 3\/3 4\/4","f 1/1 1/1 3/3 4/4"))).toThrow(/Degenerate/);
    expect(()=>parseAnatomicalOBJ("f 1 2 3")).toThrow();
    expect(()=>parseAnatomicalOBJ("a".repeat(4_000_001))).toThrow(/budget/);
  });
});
