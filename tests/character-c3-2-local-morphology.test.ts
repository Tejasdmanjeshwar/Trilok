import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createHumanLocalRecipe, validateHumanLocalRecipe,
  humanLocalMorphologyFingerprint, DEFAULT_HUMAN_LOCAL_MORPHOLOGY,
  canonicalRecipeJSON,
} from "../packages/character-core/src/index";
import { bindTemplateToSemanticRig, parseAnatomicalOBJ } from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import { applyHumanMorphology } from
  "../apps/web/src/characters/geometry/HumanMorphology";
import { AnatomicalFK } from
  "../apps/web/src/characters/geometry/AnatomicalFK";
import { validateSkinningSpike } from
  "../apps/web/src/characters/geometry/SkinningSpike";
import { inspectAnatomicalMorphologyBaseline } from
  "../apps/web/src/characters/geometry/AnatomicalMorphologyContract";
import type { SourceRig, SourceWeights } from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

const asset=(name:string)=>readFileSync(
  new URL("../apps/web/public/anatomy/"+name,import.meta.url),"utf8");
const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
function session(){
  const template=parseAnatomicalOBJ(asset("makehuman-base.obj"),{includeGroups:["body"]});
  return bindTemplateToSemanticRig(template,{rig,weights});
}
const extremes=[
  {stature:1.08,breadth:1.05,shoulders:1.10,chest:1.10,
    waist:0.90,hips:1.10,arms:1.06,legs:0.94},
  {stature:0.92,breadth:0.95,shoulders:0.90,chest:0.90,
    waist:1.10,hips:0.90,arms:0.94,legs:1.06},
] as const;

describe("C3.2 opt-in local anatomical deformation",()=>{
  it("versioned recipes are canonical, bounded, deterministic and fail closed",()=>{
    const a=createHumanLocalRecipe(extremes[0],8);
    const b=createHumanLocalRecipe({...extremes[0]},8);
    expect(canonicalRecipeJSON(a)).toBe(canonicalRecipeJSON(b));
    expect(humanLocalMorphologyFingerprint(a)).toBe(humanLocalMorphologyFingerprint(b));
    expect(validateHumanLocalRecipe(a)).toEqual(extremes[0]);
    expect(humanLocalMorphologyFingerprint(createHumanLocalRecipe(extremes[0],9)))
      .not.toBe(humanLocalMorphologyFingerprint(a));
    expect(()=>createHumanLocalRecipe({...extremes[0],waist:1.11})).toThrow();
    expect(()=>createHumanLocalRecipe({...extremes[0],arms:Infinity})).toThrow();
    expect(()=>validateHumanLocalRecipe({...a,generatorVersion:"c3.1-human-proportions-v1"}))
      .toThrow();
    expect(()=>validateHumanLocalRecipe({...a,parameters:{...a.parameters,"face.test":1}}))
      .toThrow();
    expect(()=>validateHumanLocalRecipe({...a,topologyFamilyId:"humanoid_multi_limb_v1"}))
      .toThrow();
  });

  it("neutral local recipe preserves source positions, original C1 joints and neutral CPU skin",()=>{
    const human=session();
    try{
      const {spike,mesh}=human;
      const original=new Float32Array(mesh.geometry.getAttribute("position").array);
      const initial=spike.graph.joints.map(j=>spike.bones.get(j.id)!.getWorldPosition(
        new THREE.Vector3()).clone());
      const result=applyHumanMorphology(human,createHumanLocalRecipe());
      expect(result.generatorVersion).toBe("c3.2-local-anatomy-v1");
      const position=mesh.geometry.getAttribute("position");
      for(let i=0;i<position.count;i++){
        for(let k=0;k<3;k++)
          expect(Math.abs(position.getComponent(i,k)-original[i*3+k]!))
            .toBeLessThan(1e-7);
      }
      for(const [n,joint] of spike.graph.joints.entries()){
        expect(spike.bones.get(joint.id)!.getWorldPosition(new THREE.Vector3())
          .distanceTo(initial[n]!)).toBeLessThan(1e-6);
      }
      validateSkinningSpike(spike);
      expect(inspectAnatomicalMorphologyBaseline(human).uvDuplicatedVertices)
        .toBeGreaterThan(0);
    } finally{human.dispose();}
  },60_000);

  it("extreme local proportions retain CC0 source/UV, bilateral rig, valid skin and neutral recovery",()=>{
    for(const morph of extremes){
      const human=session();
      try{
        const {template,spike,mesh}=human;
        const originalIds=Array.from(template.sourceVertexIds);
        const index=Array.from(mesh.geometry.getIndex()!.array);
        const uv=Array.from(mesh.geometry.getAttribute("uv").array);
        const skinIndex=Array.from(mesh.geometry.getAttribute("skinIndex").array);
        const skinWeight=Array.from(mesh.geometry.getAttribute("skinWeight").array);
        const ids=spike.graph.joints.map(j=>j.id);
        const source=mesh.geometry.getAttribute("position");
        const initial=Float32Array.from(source.array as ArrayLike<number>);
        const sample=Array.from({length:24},(_,i)=>Math.floor(
          i*(source.count-1)/23));
        applyHumanMorphology(human,createHumanLocalRecipe(morph));
        expect(Array.from(template.sourceVertexIds)).toEqual(originalIds);
        expect(Array.from(mesh.geometry.getIndex()!.array)).toEqual(index);
        expect(Array.from(mesh.geometry.getAttribute("uv").array)).toEqual(uv);
        expect(Array.from(mesh.geometry.getAttribute("skinIndex").array)).toEqual(skinIndex);
        expect(Array.from(mesh.geometry.getAttribute("skinWeight").array)).toEqual(skinWeight);
        expect(spike.graph.joints.map(j=>j.id)).toEqual(ids);
        expect(spike.character.root.scale.toArray()).toEqual([1,1,1]);
        validateSkinningSpike(spike);
        inspectAnatomicalMorphologyBaseline(human);
        // At least part of the source is truly locally deformed beyond C3.1
        // global scaling, without a root-scale shortcut.
        let localChange=0;
        for(let i=0;i<source.count;i++){
          const x=source.getX(i),y=source.getY(i),z=source.getZ(i);
          const dx=x-initial[i*3]!*morph.breadth;
          const dy=y-initial[i*3+1]!*morph.stature;
          const dz=z-initial[i*3+2]!*morph.breadth;
          localChange=Math.max(localChange,Math.hypot(dx,dy,dz));
        }
        expect(localChange).toBeGreaterThan(.005);
        const fk=new AnatomicalFK(spike.graph,spike.bones,{
          jawTipWorldRest:human.jawTipWorldRest,
          forearmSkinBones:spike.forearmSkinBones,
          shoulderSkinBones:spike.shoulderSkinBones,
        });
        const rest=sample.map(i=>mesh.getVertexPosition(i,new THREE.Vector3()).clone());
        for(const [role,motion,radians] of [
          ["shoulder_left","abduction",1.2],
          ["hip_right","flexion",.8],
          ["elbow_left","flexion",1],
          ["knee_right","flexion",1],
        ] as const){
          const id=spike.graph.joints.find(j=>j.role===role)!.id;
          fk.apply([{jointId:id,motion,radians}]);
          for(const i of sample)
            expect(mesh.getVertexPosition(i,new THREE.Vector3()).toArray()
              .every(Number.isFinite)).toBe(true);
          fk.apply([]);
          sample.forEach((i,n)=>expect(mesh.getVertexPosition(i,new THREE.Vector3())
            .distanceTo(rest[n]!)).toBeLessThan(.00015));
        }
        expect(() => applyHumanMorphology(human,createHumanLocalRecipe()))
          .toThrow(/already applied/);
      }finally{human.dispose();human.dispose();}
    }
  },120_000);

  it("rejects a posed CC0 surface without damaging the original input",()=>{
    const human=session();
    try{
      const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
        jawTipWorldRest:human.jawTipWorldRest,
        forearmSkinBones:human.spike.forearmSkinBones,
        shoulderSkinBones:human.spike.shoulderSkinBones,
      });
      const joint=human.spike.graph.joints.find(j=>j.role==="elbow_left")!;
      const before=human.mesh.geometry.getAttribute("position").getX(0);
      fk.apply([{jointId:joint.id,motion:"flexion",radians:.35}]);
      expect(()=>applyHumanMorphology(human,createHumanLocalRecipe(extremes[0])))
        .toThrow(/neutral-pose/);
      expect(human.mesh.geometry.getAttribute("position").getX(0)).toBe(before);
      fk.apply([]);
    }finally{human.dispose();}
  },60_000);
});
