import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {createHumanHeadRecipe,DEFAULT_HUMAN_HEAD_MORPHOLOGY} from
  "../packages/character-core/src/index";
import {parseAnatomicalOBJ,bindTemplateToSemanticRig} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {applyHumanMorphology} from
  "../apps/web/src/characters/geometry/HumanMorphology";
import {inspectHumanFacialTopology,refineHumanFacialTopology,
  FACIAL_REGION_IDS} from "../apps/web/src/characters/geometry/FacialTopology";
import {AnatomicalFK} from "../apps/web/src/characters/geometry/AnatomicalFK";
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
const shape={...DEFAULT_HUMAN_HEAD_MORPHOLOGY,skullWidth:1.08,
  forehead:1.05,cheeks:1.06,jawWidth:1.05,chin:1.05,faceDepth:1.04} as const;

describe("C3.5 human facial topology foundation",()=>{
  it("provides ordered, local semantic regions from the pinned, skinned CC0 face",()=>{
    const human=session();
    try{
      const atlas=inspectHumanFacialTopology(human);
      expect(atlas.version).toBe(1);
      expect(atlas.regions.map(r=>r.id)).toEqual([...FACIAL_REGION_IDS]);
      expect(atlas.regions.length).toBe(26);
      for(const region of atlas.regions){
        const p=new THREE.Vector3(...region.landmark.rest);
        expect(region.landmark.sourceVertexId).toBe(
          human.template.sourceVertexIds[region.landmark.vertexIndex]);
        expect(region.weight(p)).toBeGreaterThan(.99);
        expect(region.weight(p.clone().add(new THREE.Vector3(1,0,0)))).toBe(0);
        expect(region.radius.every(n=>Number.isFinite(n)&&n>0)).toBe(true);
      }
      expect(atlas.region("eye.inner.left").landmark.rest[0]).toBeLessThan(
        atlas.region("eye.inner.right").landmark.rest[0]);
      expect(atlas.region("lip.upper").landmark.rest[1]).toBeGreaterThan(
        atlas.region("chin").landmark.rest[1]);
      expect(atlas.region("mouth.corner.left").landmark.boneRole).toBe("jaw");
      expect(atlas.region("nose.tip").landmark.boneRole).toBe("head");
      expect(atlas.audit.originalBoundaryEdges).toBe(0);
      expect(atlas.audit.originalNonManifoldEdges).toBe(0);
    }finally{human.dispose();}
  },60_000);

  it("splits source-canonical facial edges conformingly without skin, UV or head/neck regressions",()=>{
    const human=session();
    try{
      applyHumanMorphology(human,createHumanHeadRecipe(shape));
      const original=human.template.geometry;
      const sourceIndices=Array.from(original.getIndex()!.array);
      const before=original.getAttribute("position");
      const oldCount=before.count;
      const oldTriangles=sourceIndices.length/3;
      const body=new THREE.Vector3().fromBufferAttribute(before,0);
      const uv=Array.from(original.getAttribute("uv").array);
      const refined=refineHumanFacialTopology(human,{maxSourceEdges:512});
      const mesh=human.mesh;
      const geometry=mesh.geometry;
      const p=geometry.getAttribute("position");
      expect(geometry).toBe(refined.geometry);
      expect(p.count).toBeGreaterThan(oldCount);
      expect(refined.atlas.audit.selectedEdges).toBeLessThanOrEqual(512);
      expect(refined.atlas.audit.refinedTriangles).toBeGreaterThan(oldTriangles);
      expect(refined.atlas.audit.refinedTriangles-oldTriangles).toBeLessThanOrEqual(1024);
      expect(refined.atlas.audit.refinedVertices).toBe(p.count);
      expect(geometry.getAttribute("uv").array.slice(0,uv.length)).toEqual(
        original.getAttribute("uv").array);
      for(let i=0;i<oldCount;i++){
        expect(p.getX(i)).toBe(before.getX(i));
        expect(p.getY(i)).toBe(before.getY(i));
        expect(p.getZ(i)).toBe(before.getZ(i));
      }
      expect(new THREE.Vector3().fromBufferAttribute(p,0).distanceTo(body)).toBe(0);
      validateSkinningSpike(human.spike);
      const influence=geometry.getAttribute("skinWeight");
      const skinIndex=geometry.getAttribute("skinIndex");
      for(let i=oldCount;i<p.count;i++){
        let total=0;
        for(let j=0;j<4;j++){
          total+=influence.getComponent(i,j);
          expect(skinIndex.getComponent(i,j)).toBeLessThan(human.spike.skeleton.bones.length);
        }
        expect(total).toBeCloseTo(1,5);
      }
      // Recount geometric edges across rendered UV islands using canonical
      // source endpoints plus derived midpoint ownership.
      const origins=new Map(refined.sourceEdges.map(o=>[o.renderIndex,o]));
      const canonical=(i:number):string=>{
        const origin=origins.get(i);
        return origin?`m:${Math.min(origin.sourceA,origin.sourceB)}:${Math.max(origin.sourceA,origin.sourceB)}`:
          `v:${human.template.sourceVertexIds[i]}`;
      };
      const edgeCounts=new Map<string,number>();
      const idx=geometry.getIndex()!;
      for(let i=0;i<idx.count;i+=3){
        const t=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)];
        for(let j=0;j<3;j++){
          const pair=[canonical(t[j]!),canonical(t[(j+1)%3]!)].sort().join("|");
          edgeCounts.set(pair,(edgeCounts.get(pair)??0)+1);
        }
      }
      expect([...edgeCounts.values()].filter(n=>n!==2)).toEqual([]);
      const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
        jawTipWorldRest:human.jawTipWorldRest,
        forearmSkinBones:human.spike.forearmSkinBones,
        shoulderSkinBones:human.spike.shoulderSkinBones});
      const head=human.spike.graph.joints.find(j=>j.role==="head")!;
      const jaw=human.spike.graph.joints.find(j=>j.role==="jaw")!;
      const posePoint=mesh.getVertexPosition(refined.sourceEdges[0]!.renderIndex,new THREE.Vector3()).clone();
      fk.apply([{jointId:head.id,motion:"rotation",radians:.35}]);
      expect(mesh.getVertexPosition(refined.sourceEdges[0]!.renderIndex,new THREE.Vector3())
        .distanceTo(posePoint)).toBeGreaterThan(.0001);
      fk.apply([{jointId:jaw.id,motion:"flexion",radians:.4}]);
      fk.apply([]);
      expect(mesh.getVertexPosition(refined.sourceEdges[0]!.renderIndex,new THREE.Vector3())
        .distanceTo(posePoint)).toBeLessThan(.0001);
      expect(()=>refineHumanFacialTopology(human)).toThrow(/unrefined/);
    }finally{human.dispose();human.dispose();}
  },120_000);

  it("regenerates identical canonical topology and rejects invalid budgets",()=>{
    const snapshots:string[]=[];
    for(let k=0;k<2;k++){
      const human=session();
      try{
        const ref=refineHumanFacialTopology(human,{maxSourceEdges:96});
        snapshots.push(JSON.stringify({
          index:Array.from(ref.geometry.getIndex()!.array),
          edges:ref.sourceEdges,
          counts:ref.atlas.audit.regionCounts,
        }));
        expect(()=>refineHumanFacialTopology(human,{maxSourceEdges:0})).toThrow();
      }finally{human.dispose();}
    }
    expect(snapshots[0]).toBe(snapshots[1]);
  },120_000);
});
