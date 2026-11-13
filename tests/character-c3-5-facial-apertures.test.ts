import {readFileSync} from "node:fs";
import * as THREE from "three";
import {describe,expect,it} from "vitest";
import {parseAnatomicalOBJ,bindTemplateToSemanticRig} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {buildHumanFacialApertures,FACIAL_APERTURE_IDS} from
  "../apps/web/src/characters/geometry/FacialApertures";
import {validateSkinningSpike} from
  "../apps/web/src/characters/geometry/SkinningSpike";
import {AnatomicalFK} from
  "../apps/web/src/characters/geometry/AnatomicalFK";
import {createHumanHeadRecipe,DEFAULT_HUMAN_HEAD_MORPHOLOGY} from
  "../packages/character-core/src/index";
import {applyHumanMorphology} from
  "../apps/web/src/characters/geometry/HumanMorphology";
import type {SourceRig,SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

const asset=(name:string)=>readFileSync(
  new URL("../apps/web/public/anatomy/"+name,import.meta.url),"utf8");
const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
const make=()=>bindTemplateToSemanticRig(
  parseAnatomicalOBJ(asset("makehuman-base.obj"),{includeGroups:["body"]}),{rig,weights});

describe("C3.5 source-contiguous bounded human facial aperture scaffolding",()=>{
  it("carves five capped, closed, nonmanifold-free feature pockets in the existing human mesh",()=>{
    const human=make();
    try{
      const original=human.template.geometry;
      const before=original.getAttribute("position");
      const created=buildHumanFacialApertures(human);
      console.log("C3.5 facial source probe:",JSON.stringify(
        ["brow.left","eyelid.upper.left","eyelid.lower.left",
          "eye.inner.left","eye.outer.left","lip.upper","lip.lower",
          "mouth.corner.left","nose.tip","nostril.left","chin",
          "crownRest"]
          .map(id=>id==="crownRest" ? [id,[]] :
            [id,created.edgeFlow.atlas.region(id as import(
              "../apps/web/src/characters/geometry/FacialTopology").FacialRegionId)
              .landmark.rest])));

      expect(created.audit.apertureCount).toBe(5);
      const atlas=created.edgeFlow.atlas;
      const browY=atlas.region("brow.left").landmark.rest[1];
      const upperY=atlas.region("eyelid.upper.left").landmark.rest[1];
      const lowerY=atlas.region("eyelid.lower.left").landmark.rest[1];
      const chinY=atlas.region("chin").landmark.rest[1];
      // Source-probed eyelids cannot occupy the same supraciliary strip
      // as the brow; that was the defect observed in rendered screenshots.
      expect(browY-upperY).toBeGreaterThan((upperY-chinY)*.10);
      expect(upperY).toBeGreaterThan(lowerY);
      expect(atlas.region("lip.upper").landmark.rest[1])
        .toBeGreaterThan(atlas.region("lip.lower").landmark.rest[1]);
      expect(created.audit.features.map(f=>f.id)).toEqual([...FACIAL_APERTURE_IDS]);
      expect(created.audit.boundaryEdges).toBe(0);
      expect(created.audit.nonManifoldEdges).toBe(0);
      expect(created.audit.afterVertices).toBeGreaterThan(created.audit.beforeVertices);
      expect(created.audit.afterTriangles).toBeGreaterThan(created.audit.beforeTriangles);
      expect(created.topologyIds.length).toBe(created.audit.afterVertices);
      expect(created.audit.features.every(f=>f.boundaryVertices>=8&&f.removedTriangles>1)).toBe(true);
      for(let i=0;i<before.count;i++){
        for(let k=0;k<3;k++)
          expect(created.geometry.getAttribute("position").getComponent(i,k))
            .toBe(before.getComponent(i,k));
      }
      // Geometry surgery must preserve the original C2 UV and skin-weight
      // attribute prefix exactly; only newly created pocket vertices may
      // receive C3.5 transitional oral/jaw influences.
      for(const name of ["uv","skinIndex","skinWeight"] as const){
        const source=original.getAttribute(name).array;
        const current=created.geometry.getAttribute(name).array;
        expect(Array.from(current.slice(0,source.length))).toEqual(Array.from(source));
      }
      const p=created.geometry.getAttribute("position");
      for(const feature of created.audit.features){
        expect(p.getZ(feature.centerVertex)).toBeLessThan(
          Math.max(...feature.sourceTopologyIds.slice(0,10).map(id=>{
            const index=created.topologyIds.indexOf(id);
            return p.getZ(index);
          })));
      }
      validateSkinningSpike(human.spike);
      const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
        jawTipWorldRest:human.jawTipWorldRest,
        forearmSkinBones:human.spike.forearmSkinBones,
        shoulderSkinBones:human.spike.shoulderSkinBones,
      });
      const jaw=human.spike.graph.joints.find(j=>j.role==="jaw")!;
      const chin=human.jawTipWorldRest!.clone();
      const jawBone=human.spike.bones.get(jaw.id)!;
      const local=jawBone.worldToLocal(chin.clone());
      const mouthCenter=created.audit.features.find(f=>f.id==="mouth")!.centerVertex;
      const orbitCenter=created.audit.features.find(f=>f.id==="orbit.left")!.centerVertex;
      const restMouth=human.mesh.getVertexPosition(mouthCenter,new THREE.Vector3()).clone();
      const restOrbit=human.mesh.getVertexPosition(orbitCenter,new THREE.Vector3()).clone();
      fk.apply([{jointId:jaw.id,motion:"flexion",radians:.4}]);
      expect(jawBone.localToWorld(local.clone()).y).toBeLessThan(chin.y-.0005);
      const posedMouth=human.mesh.getVertexPosition(mouthCenter,new THREE.Vector3());
      const posedOrbit=human.mesh.getVertexPosition(orbitCenter,new THREE.Vector3());
      expect(posedMouth.toArray().every(Number.isFinite)).toBe(true);
      expect(posedOrbit.toArray().every(Number.isFinite)).toBe(true);
      expect(posedOrbit.distanceTo(restOrbit)).toBeLessThan(.0002);
      expect(posedMouth.distanceTo(restMouth)).toBeGreaterThan(.0005);
      fk.apply([]);
      expect(human.mesh.getVertexPosition(mouthCenter,new THREE.Vector3())
        .distanceTo(restMouth)).toBeLessThan(.0002);
      expect(human.mesh.getVertexPosition(orbitCenter,new THREE.Vector3())
        .distanceTo(restOrbit)).toBeLessThan(.0002);
      console.log("C3.5 aperture audit:",JSON.stringify(created.audit));
    }finally{human.dispose();}
  },120_000);

  it("retains deterministic aperture ancestry on a repeat neutral source and a shaped C3.4 head",()=>{
    const outputs:string[]=[];
    for(let k=0;k<2;k++){
      const human=make();
      try{
        const result=buildHumanFacialApertures(human);
        outputs.push(JSON.stringify({
          audit:result.audit,ids:Array.from(result.topologyIds),
          faces:Array.from(result.geometry.getIndex()!.array),
        }));
      }finally{human.dispose();}
    }
    expect(outputs[0]).toBe(outputs[1]);
    const human=make();
    try{
      applyHumanMorphology(human,createHumanHeadRecipe({
        ...DEFAULT_HUMAN_HEAD_MORPHOLOGY,
        skullWidth:1.08,cheeks:1.05,jawWidth:1.05,chin:1.05,
      }));
      const result=buildHumanFacialApertures(human);
      expect(result.audit.apertureCount).toBe(5);
      validateSkinningSpike(human.spike);
    }finally{human.dispose();}
  },120_000);
});
