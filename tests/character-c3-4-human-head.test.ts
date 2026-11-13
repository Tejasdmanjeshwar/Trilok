import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  DEFAULT_HUMAN_HEAD_MORPHOLOGY, createHumanHeadRecipe,
  validateHumanHeadRecipe, humanHeadMorphologyFingerprint,
  createHumanLocalRecipe, canonicalRecipeJSON,
} from "../packages/character-core/src/index";
import { bindTemplateToSemanticRig, parseAnatomicalOBJ } from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import { applyHumanMorphology, getHumanHeadLandmarks,
  getHumanMorphologyAlignment } from
  "../apps/web/src/characters/geometry/HumanMorphology";
import { AnatomicalFK } from
  "../apps/web/src/characters/geometry/AnatomicalFK";
import { inspectAnatomicalMorphologyBaseline } from
  "../apps/web/src/characters/geometry/AnatomicalMorphologyContract";
import type { SourceRig, SourceWeights } from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

const asset = (name:string)=>readFileSync(
  new URL("../apps/web/public/anatomy/"+name,import.meta.url),"utf8");
const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
function session(){
  return bindTemplateToSemanticRig(
    parseAnatomicalOBJ(asset("makehuman-base.obj"),{includeGroups:["body"]}),
    {rig,weights});
}
const extreme = {
  ...DEFAULT_HUMAN_HEAD_MORPHOLOGY,
  skullWidth:1.10,skullHeight:1.07,forehead:1.07,
  brow:1.08,cheeks:1.08,jawWidth:1.09,chin:1.08,
  faceDepth:1.06,eyeSpacing:1.05,
} as const;
const opposite = {
  ...DEFAULT_HUMAN_HEAD_MORPHOLOGY,stature:.92,breadth:.95,
  shoulders:.9,waist:1.1,hips:.9,arms:.94,legs:1.06,
  skullWidth:.90,skullHeight:.93,forehead:.93,
  brow:.92,cheeks:.92,jawWidth:.91,chin:.92,
  faceDepth:.94,eyeSpacing:.95,
} as const;

describe("C3.4 complete human head morphology",()=>{
  it("serializes deterministically with a separate exact parameter schema",()=>{
    const recipe=createHumanHeadRecipe(extreme,17);
    expect(validateHumanHeadRecipe(recipe)).toEqual(extreme);
    expect(canonicalRecipeJSON(recipe)).toBe(
      canonicalRecipeJSON(createHumanHeadRecipe({...extreme},17)));
    expect(humanHeadMorphologyFingerprint(recipe)).toBe(
      humanHeadMorphologyFingerprint(createHumanHeadRecipe(extreme,17)));
    expect(humanHeadMorphologyFingerprint(recipe)).not.toBe(
      humanHeadMorphologyFingerprint(createHumanHeadRecipe(extreme,18)));
    expect(()=>createHumanHeadRecipe({...extreme,skullWidth:1.26})).toThrow();
    expect(()=>createHumanHeadRecipe({...extreme,brow:NaN})).toThrow();
    expect(()=>createHumanHeadRecipe({...extreme,eyeSpacing:Infinity})).toThrow();
    expect(()=>validateHumanHeadRecipe({...recipe,
      parameters:{...recipe.parameters,"head.unknown":1}})).toThrow();
    expect(()=>validateHumanHeadRecipe({...recipe,
      topologyFamilyId:"head_bear_v1"})).toThrow();
    expect(()=>validateHumanHeadRecipe({...recipe,
      generatorVersion:"c3.2-local-anatomy-v1"})).toThrow();
    expect(()=>validateHumanHeadRecipe(createHumanLocalRecipe())).toThrow();
  });

  it("neutral C3.4 matches the CC0 rest surface and preserves semantic/skin contracts",()=>{
    const human=session();
    try{
      const positions=Float32Array.from(
        human.mesh.geometry.getAttribute("position").array as ArrayLike<number>);
      const ids=human.spike.graph.joints.map(j=>j.id);
      const weightsBefore=Float32Array.from(
        human.mesh.geometry.getAttribute("skinWeight").array as ArrayLike<number>);
      applyHumanMorphology(human,createHumanHeadRecipe());
      const after=human.mesh.geometry.getAttribute("position").array as ArrayLike<number>;
      for(let i=0;i<positions.length;i++)
        expect(Math.abs(after[i]!-positions[i]!)).toBeLessThan(1e-7);
      expect(human.spike.graph.joints.map(j=>j.id)).toEqual(ids);
      expect([...human.mesh.geometry.getAttribute("skinWeight").array])
        .toEqual([...weightsBefore]);
      expect(getHumanHeadLandmarks(human)).toBeDefined();
      inspectAnatomicalMorphologyBaseline(human);
    }finally{human.dispose();}
  },60_000);

  it("paired head extremes retain CC0 source/UV topology and jaw/eye FK",()=>{
    for(const shape of [extreme,opposite]){
      const human=session();
      try{
        const {spike,template,mesh}=human;
        const before=Float32Array.from(mesh.geometry.getAttribute("position").array as ArrayLike<number>);
        const ids=Uint32Array.from(template.sourceVertexIds);
        const faces=Array.from(mesh.geometry.getIndex()!.array);
        const uv=Array.from(mesh.geometry.getAttribute("uv").array);
        const influence=Array.from(mesh.geometry.getAttribute("skinIndex").array);
        const weights=Array.from(mesh.geometry.getAttribute("skinWeight").array);
        const bones=spike.graph.joints.map(j=>j.id);
        applyHumanMorphology(human,createHumanHeadRecipe(shape));
        const positions=mesh.geometry.getAttribute("position");
        let changed=0;
        for(let i=0;i<positions.count;i++){
          const p=new THREE.Vector3().fromBufferAttribute(positions,i);
          expect(p.toArray().every(Number.isFinite)).toBe(true);
          changed=Math.max(changed,p.distanceTo(
            new THREE.Vector3(before[i*3]!*shape.breadth,
              before[i*3+1]!*shape.stature,before[i*3+2]!*shape.breadth)));
        }
        expect(changed).toBeGreaterThan(.001);
        expect(Array.from(template.sourceVertexIds)).toEqual(Array.from(ids));
        expect(Array.from(mesh.geometry.getIndex()!.array)).toEqual(faces);
        expect(Array.from(mesh.geometry.getAttribute("uv").array)).toEqual(uv);
        expect(Array.from(mesh.geometry.getAttribute("skinIndex").array)).toEqual(influence);
        expect(Array.from(mesh.geometry.getAttribute("skinWeight").array)).toEqual(weights);
        expect(spike.graph.joints.map(j=>j.id)).toEqual(bones);
        expect(spike.character.root.scale.toArray()).toEqual([1,1,1]);
        inspectAnatomicalMorphologyBaseline(human);
        const points=getHumanHeadLandmarks(human)!;
        expect(points.orbitLeftRest[0]).toBeLessThan(points.orbitRightRest[0]);
        expect(points.crownRest[1]).toBeGreaterThan(points.jawRest[1]);
        expect(getHumanMorphologyAlignment(human)).toBeDefined();
        const fk=new AnatomicalFK(spike.graph,spike.bones,{
          jawTipWorldRest:human.jawTipWorldRest,
          forearmSkinBones:spike.forearmSkinBones,
          shoulderSkinBones:spike.shoulderSkinBones});
        const eye=points.eyeWorld("left");
        const head=spike.graph.joints.find(j=>j.role==="head")!;
        fk.apply([{jointId:head.id,motion:"rotation",radians:.30}]);
        expect(points.eyeWorld("left").distanceTo(eye)).toBeGreaterThan(.002);
        fk.apply([]);
        expect(points.eyeWorld("left").distanceTo(eye)).toBeLessThan(1e-6);
        const jaw=spike.graph.joints.find(j=>j.role==="jaw")!;
        const chin=human.jawTipWorldRest!.clone();
        const local=spike.bones.get(jaw.id)!.worldToLocal(chin.clone());
        fk.apply([{jointId:jaw.id,motion:"flexion",radians:.45}]);
        const opened=spike.bones.get(jaw.id)!.localToWorld(local.clone());
        expect(opened.y).toBeLessThan(chin.y-.0005);
        fk.apply([]);
        expect(()=>applyHumanMorphology(human,createHumanHeadRecipe())).toThrow();
      }finally{human.dispose();human.dispose();}
    }
  },120_000);

  it("rejects posed sources without modifying their rest surface",()=>{
    const human=session();
    try{
      const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
        jawTipWorldRest:human.jawTipWorldRest,
        forearmSkinBones:human.spike.forearmSkinBones,
        shoulderSkinBones:human.spike.shoulderSkinBones});
      const head=human.spike.graph.joints.find(j=>j.role==="head")!;
      const before=human.mesh.geometry.getAttribute("position").getX(0);
      fk.apply([{jointId:head.id,motion:"flexion",radians:.3}]);
      expect(()=>applyHumanMorphology(human,createHumanHeadRecipe(extreme)))
        .toThrow(/neutral-pose/);
      expect(human.mesh.geometry.getAttribute("position").getX(0)).toBe(before);
      fk.apply([]);
    }finally{human.dispose();}
  },60_000);
});
