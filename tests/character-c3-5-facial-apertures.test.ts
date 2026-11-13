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
      fk.apply([{jointId:jaw.id,motion:"flexion",radians:.4}]);
      expect(jawBone.localToWorld(local.clone()).y).toBeLessThan(chin.y-.0005);
      fk.apply([]);
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
