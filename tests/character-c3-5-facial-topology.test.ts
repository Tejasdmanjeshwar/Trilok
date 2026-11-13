import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {createHumanHeadRecipe,DEFAULT_HUMAN_HEAD_MORPHOLOGY} from
  "../packages/character-core/src/index";
import {parseAnatomicalOBJ,bindTemplateToSemanticRig} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {applyHumanMorphology} from
  "../apps/web/src/characters/geometry/HumanMorphology";
import {FACIAL_REGION_IDS,inspectHumanFacialTopology} from
  "../apps/web/src/characters/geometry/FacialTopology";
import {buildHumanFacialSourceSurface} from
  "../apps/web/src/characters/geometry/FacialSourceTopology";
import {AnatomicalFK} from
  "../apps/web/src/characters/geometry/AnatomicalFK";
import {validateSkinningSpike} from
  "../apps/web/src/characters/geometry/SkinningSpike";
import type {SourceRig,SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

const asset=(name:string)=>readFileSync(
  new URL("../apps/web/public/anatomy/"+name,import.meta.url),"utf8");
const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
const session=()=>bindTemplateToSemanticRig(parseAnatomicalOBJ(
  asset("makehuman-base.obj"),{includeGroups:["body"]}),{rig,weights});

describe("C3.5 canonical source-derived human facial foundation",()=>{
  it("retains ordered, bounded original source facial landmarks",()=>{
    const human=session();
    try{
      const atlas=inspectHumanFacialTopology(human);
      expect(atlas.regions.map(region=>region.id)).toEqual([...FACIAL_REGION_IDS]);
      expect(atlas.audit.originalBoundaryEdges).toBe(0);
      expect(atlas.audit.originalNonManifoldEdges).toBe(0);
      for(const region of atlas.regions){
        expect(region.landmark.sourceVertexId).toBe(
          human.template.sourceVertexIds[region.landmark.vertexIndex]);
        expect(region.weight(new THREE.Vector3(...region.landmark.rest))).toBeGreaterThan(.99);
      }
      expect(atlas.region("eyelid.upper.left").landmark.rest[1]).toBeGreaterThan(
        atlas.region("eyelid.lower.left").landmark.rest[1]);
    }finally{human.dispose();}
  },120_000);

  it("adds real source-connected facial control samples without moving any source anatomy",()=>{
    const human=session();
    try{
      const original=human.template.geometry;
      const originalCount=original.getAttribute("position").count;
      const face=buildHumanFacialSourceSurface(human);
      const g=face.geometry;
      expect(g).toBe(human.mesh.geometry);
      expect(face.audit.originalVertices).toBe(originalCount);
      expect(face.audit.refinedVertices).toBeGreaterThan(originalCount);
      expect(face.audit.refinedTriangles).toBeGreaterThan(face.audit.originalTriangles);
      expect(face.audit.refinedTriangles).toBeLessThan(55000);
      expect(face.audit.refinedVertices).toBeLessThan(26000);
      expect(face.audit.secondaryCanonicalEdges).toBeGreaterThan(32);
      expect(face.topologyIds.length).toBe(face.audit.refinedVertices);
      expect(face.derivedVertices.length).toBeGreaterThan(32);
      for(const field of ["position","uv","skinIndex","skinWeight"] as const) {
        const before=original.getAttribute(field);
        const after=g.getAttribute(field);
        for(let i=0;i<before.count;i++)
          for(let k=0;k<before.itemSize;k++)
            expect(after.getComponent(i,k)).toBe(before.getComponent(i,k));
      }
      for(const v of face.derivedVertices){
        expect(v.topologyId).toBeGreaterThanOrEqual(human.template.sourceVertexCount);
        expect(v.parentA).not.toBe(v.parentB);
        let total=0;
        for(let k=0;k<4;k++)total+=g.getAttribute("skinWeight").getComponent(v.index,k);
        expect(total).toBeCloseTo(1,5);
      }
      // Secondary edge splits never displace their endpoints or alter the UVs.
      // Each new position must be the exact midpoint of existing source-connected
      // parent coordinates when referenced by its canonical topology ID.
      const seen=new Map<number,number>();
      face.topologyIds.forEach((id,i)=>{if(!seen.has(id))seen.set(id,i);});
      const p=g.getAttribute("position");
      for(const v of face.derivedVertices){
        const a=seen.get(v.parentA)!,b=seen.get(v.parentB)!;
        for(let k=0;k<3;k++)
          expect(p.getComponent(v.index,k)).toBeCloseTo(
            (p.getComponent(a,k)+p.getComponent(b,k))*.5,5);
      }
      validateSkinningSpike(human.spike);
      console.log("C3.5 source-derived facial audit",JSON.stringify(face.audit));
    }finally{human.dispose();}
  },120_000);

  it("supports isolated bilateral control displacements as temporary diagnostics",()=>{
    const human=session();
    try{
      const face=buildHumanFacialSourceSurface(human);
      const left=face.controlWeights("eyelid.upper.left");
      const right=face.controlWeights("eyelid.upper.right");
      const jaw=face.controlWeights("lip.lower");
      const p=face.geometry.getAttribute("position");
      expect(left.length).toBe(p.count);
      let activeLeft=0,activeRight=0,activeJaw=0,wrongSide=0;
      for(let i=0;i<p.count;i++){
        if(left[i]!>.15){activeLeft++;if(right[i]!>.15)wrongSide++;}
        if(right[i]!>.15)activeRight++;
        if(jaw[i]!>.15)activeJaw++;
        if(p.getY(i)<1.2)expect(left[i]).toBe(0);
      }
      expect(activeLeft).toBeGreaterThan(4);
      expect(activeRight).toBeGreaterThan(4);
      expect(activeJaw).toBeGreaterThan(4);
      expect(wrongSide).toBe(0);
    }finally{human.dispose();}
  },120_000);

  it("regenerates deterministic canonical ancestry, and preserves extreme C3.4 plus C1 pose recovery",()=>{
    const snapshots:string[]=[];
    for(let attempt=0;attempt<2;attempt++){
      const human=session();
      try{
        applyHumanMorphology(human,createHumanHeadRecipe({
          ...DEFAULT_HUMAN_HEAD_MORPHOLOGY,skullWidth:1.10,
          forehead:1.07,cheeks:1.08,jawWidth:1.09,chin:1.08,
        }));
        const face=buildHumanFacialSourceSurface(human,{primaryEdges:512,secondaryEdges:640});
        snapshots.push(JSON.stringify({
          faces:Array.from(face.geometry.getIndex()!.array),
          ancestry:face.derivedVertices,
          ids:Array.from(face.topologyIds),
        }));
        const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
          jawTipWorldRest:human.jawTipWorldRest,
          forearmSkinBones:human.spike.forearmSkinBones,
          shoulderSkinBones:human.spike.shoulderSkinBones,
        });
        const jaw=human.spike.graph.joints.find(j=>j.role==="jaw")!;
        const vertex=face.derivedVertices.at(-1)!.index;
        const rest=human.mesh.getVertexPosition(vertex,new THREE.Vector3()).clone();
        fk.apply([{jointId:jaw.id,motion:"flexion",radians:.4}]);
        expect(human.mesh.getVertexPosition(vertex,new THREE.Vector3()).toArray()
          .every(Number.isFinite)).toBe(true);
        fk.apply([]);
        expect(human.mesh.getVertexPosition(vertex,new THREE.Vector3())
          .distanceTo(rest)).toBeLessThan(.00015);
        validateSkinningSpike(human.spike);
      }finally{human.dispose();}
    }
    expect(snapshots[0]).toBe(snapshots[1]);
  },120_000);

  it("rejects invalid topology budget without modifying source",()=>{
    const human=session();
    try{
      expect(()=>buildHumanFacialSourceSurface(human,{primaryEdges:0})).toThrow();
      expect(human.mesh.geometry).toBe(human.template.geometry);
      expect(()=>buildHumanFacialSourceSurface(human,{secondaryEdges:9000})).toThrow();
      expect(human.mesh.geometry).toBe(human.template.geometry);
    }finally{human.dispose();}
  },120_000);
});
