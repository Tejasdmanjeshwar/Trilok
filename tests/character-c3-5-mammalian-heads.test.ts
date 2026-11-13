import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {DEFAULT_MAMMALIAN_HEAD_MORPHOLOGY,createMammalianHeadRecipe,
  validateMammalianHeadRecipe,mammalianHeadFingerprint,canonicalRecipeJSON,
  MAMMAL_HEAD_TOPOLOGY_FAMILIES,createHumanHeadRecipe,
  type MammalianHeadFamilyV1} from "../packages/character-core/src/index";
import {parseAnatomicalOBJ,bindTemplateToSemanticRig} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {applyHumanMorphology,getMammalianHeadLandmarks,getHumanHeadLandmarks,
  getHumanMorphologyAlignment} from
  "../apps/web/src/characters/geometry/HumanMorphology";
import {AnatomicalFK} from
  "../apps/web/src/characters/geometry/AnatomicalFK";
import {inspectAnatomicalMorphologyBaseline} from
  "../apps/web/src/characters/geometry/AnatomicalMorphologyContract";
import {validateSkinningSpike} from
  "../apps/web/src/characters/geometry/SkinningSpike";
import type {SourceRig,SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

const asset=(name:string)=>readFileSync(
  new URL("../apps/web/public/anatomy/"+name,import.meta.url),"utf8");
const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
function session(headFamily?:MammalianHeadFamilyV1) {
  return bindTemplateToSemanticRig(parseAnatomicalOBJ(
    asset("makehuman-base.obj"),{includeGroups:["body"]}),
    {rig,weights,headFamily});
}
const families=["primate","bear"] as const;
const stressed={
  ...DEFAULT_MAMMALIAN_HEAD_MORPHOLOGY,
  muzzleLength:1.15,muzzleWidth:1.12,muzzleHeight:1.10,
  earSize:1.15,browMass:1.12,jawMass:1.12,
  skullWidth:1.08,skullHeight:1.05,
  stature:1.04,breadth:1.05,shoulders:1.08,hips:1.05,
} as const;
const opposite={
  ...DEFAULT_MAMMALIAN_HEAD_MORPHOLOGY,
  muzzleLength:.85,muzzleWidth:.88,muzzleHeight:.90,
  earSize:.85,browMass:.88,jawMass:.88,
  skullWidth:.93,skullHeight:.95,
  stature:.94,breadth:.95,shoulders:.92,hips:.94,
} as const;

describe("C3.5 primate and bear anatomical head families",()=>{
  it("uses family-specific versioned recipes, stable hashes and fail-closed ranges",()=>{
    const hash=new Set<string>();
    for(const family of families) {
      const recipe=createMammalianHeadRecipe(family,stressed,41);
      expect(validateMammalianHeadRecipe(recipe)).toEqual({family,shape:stressed});
      expect(recipe.archetypeId).toBe("animal_head");
      expect(recipe.topologyFamilyId).toBe("humanoid_biped_v1");
      expect(canonicalRecipeJSON(recipe)).toBe(canonicalRecipeJSON(
        createMammalianHeadRecipe(family,{...stressed},41)));
      const fingerprint=mammalianHeadFingerprint(recipe);
      hash.add(fingerprint);
      expect(fingerprint).not.toBe(mammalianHeadFingerprint(
        createMammalianHeadRecipe(family,stressed,42)));
      expect(()=>validateMammalianHeadRecipe({
        ...recipe,parameters:{...recipe.parameters,"mammal.unlisted":1},
      })).toThrow();
      expect(()=>validateMammalianHeadRecipe({
        ...recipe,archetypeId:"human",
      })).toThrow();
      expect(()=>validateMammalianHeadRecipe({
        ...recipe,generatorVersion:"c3.4-human-head-v1",
      })).toThrow();
      expect(()=>createMammalianHeadRecipe(family,{
        ...stressed,earSize:Infinity,
      })).toThrow();
      expect(()=>createMammalianHeadRecipe(family,{
        ...stressed,muzzleLength:1.151,
      })).toThrow();
      expect(()=>validateMammalianHeadRecipe(createHumanHeadRecipe())).toThrow();
    }
    expect(hash.size).toBe(2);
    expect(()=>createMammalianHeadRecipe("avian" as MammalianHeadFamilyV1))
      .toThrow();
  });

  it("both species retain C1 IDs and continuous CC0 topology, UVs and weights",()=>{
    const reference=session();
    const canonical=reference.spike.graph.joints.map(j=>j.id);
    reference.dispose();
    for(const family of families){
      for(const shape of [DEFAULT_MAMMALIAN_HEAD_MORPHOLOGY,stressed,opposite]) {
        const human=session(family);
        try {
          const {spike,template,mesh}=human;
          expect(spike.graph.headTopologyFamilyId)
            .toBe(MAMMAL_HEAD_TOPOLOGY_FAMILIES[family]);
          expect(spike.graph.joints.map(j=>j.id)).toEqual(canonical);
          expect(spike.character.graph.headTopologyFamilyId)
            .toBe(MAMMAL_HEAD_TOPOLOGY_FAMILIES[family]);
          const positions=Float32Array.from(mesh.geometry.getAttribute("position").array as ArrayLike<number>);
          const sourceIds=Array.from(template.sourceVertexIds);
          const faces=Array.from(mesh.geometry.getIndex()!.array);
          const uv=Array.from(mesh.geometry.getAttribute("uv").array);
          const weightsBefore=Array.from(mesh.geometry.getAttribute("skinWeight").array);
          const indexBefore=Array.from(mesh.geometry.getAttribute("skinIndex").array);
          const recipe=createMammalianHeadRecipe(family,shape);
          const result=applyHumanMorphology(human,recipe);
          expect(result.generatorVersion).toBe(recipe.generatorVersion);
          expect([...template.sourceVertexIds]).toEqual(sourceIds);
          expect([...mesh.geometry.getIndex()!.array]).toEqual(faces);
          expect([...mesh.geometry.getAttribute("uv").array]).toEqual(uv);
          expect([...mesh.geometry.getAttribute("skinWeight").array]).toEqual(weightsBefore);
          expect([...mesh.geometry.getAttribute("skinIndex").array]).toEqual(indexBefore);
          expect(spike.character.root.scale.toArray()).toEqual([1,1,1]);
          expect(getHumanHeadLandmarks(human)).toBeDefined();
          expect(getHumanMorphologyAlignment(human)).toBeDefined();
          const landmarks=getMammalianHeadLandmarks(human)!;
          expect(landmarks.family).toBe(family);
          expect(landmarks.earLeftRest[0]).toBeLessThan(landmarks.earRightRest[0]);
          expect(landmarks.muzzleRest[2]).toBeGreaterThan(landmarks.earLeftRest[2]-.03);
          let moved=0;
          const pos=mesh.geometry.getAttribute("position");
          for(let i=0;i<pos.count;i++){
            const p=new THREE.Vector3().fromBufferAttribute(pos,i);
            expect(p.toArray().every(Number.isFinite)).toBe(true);
            moved=Math.max(moved,p.distanceTo(new THREE.Vector3(
              positions[i*3]!,positions[i*3+1]!,positions[i*3+2]!)));
          }
          expect(moved).toBeGreaterThan(.015);
          validateSkinningSpike(spike);
          inspectAnatomicalMorphologyBaseline(human);
        }finally{human.dispose();human.dispose();}
      }
    }
  },120_000);

  it("muzzle and ears follow head FK, jaw lowers, neutral recovers",()=>{
    for(const family of families){
      const human=session(family);
      try{
        applyHumanMorphology(human,createMammalianHeadRecipe(family,stressed));
        const {spike,mesh}=human;
        const landmarks=getMammalianHeadLandmarks(human)!;
        const fk=new AnatomicalFK(spike.graph,spike.bones,{
          jawTipWorldRest:human.jawTipWorldRest,
          forearmSkinBones:spike.forearmSkinBones,
          shoulderSkinBones:spike.shoulderSkinBones});
        const probe=landmarks.muzzleWorld().clone();
        const ear=landmarks.earWorld("right").clone();
        const rest=mesh.getVertexPosition(170,new THREE.Vector3()).clone();
        const head=spike.graph.joints.find(j=>j.role==="head")!;
        fk.apply([{jointId:head.id,motion:"rotation",radians:.35}]);
        expect(landmarks.muzzleWorld().distanceTo(probe)).toBeGreaterThan(.001);
        expect(landmarks.earWorld("right").distanceTo(ear)).toBeGreaterThan(.001);
        fk.apply([]);
        expect(landmarks.muzzleWorld().distanceTo(probe)).toBeLessThan(1e-6);
        expect(landmarks.earWorld("right").distanceTo(ear)).toBeLessThan(1e-6);
        const jaw=spike.graph.joints.find(j=>j.role==="jaw")!;
        const tip=human.jawTipWorldRest!.clone();
        const jawBone=spike.bones.get(jaw.id)!;
        const local=jawBone.worldToLocal(tip.clone());
        fk.apply([{jointId:jaw.id,motion:"flexion",radians:.4}]);
        expect(jawBone.localToWorld(local.clone()).y).toBeLessThan(tip.y-.0005);
        fk.apply([]);
        expect(mesh.getVertexPosition(170,new THREE.Vector3()).distanceTo(rest))
          .toBeLessThan(.00015);
        expect(()=>applyHumanMorphology(human,createMammalianHeadRecipe(family)))
          .toThrow(/already applied/);
      }finally{human.dispose();}
    }
  },120_000);

  it("does not accept a mismatched family graph or posed input",()=>{
    const human=session("primate");
    try{
      const first=human.mesh.geometry.getAttribute("position").getX(0);
      expect(()=>applyHumanMorphology(human,createMammalianHeadRecipe("bear")))
        .toThrow(/requires the pinned/);
      expect(human.mesh.geometry.getAttribute("position").getX(0)).toBe(first);
      const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
        jawTipWorldRest:human.jawTipWorldRest,
        forearmSkinBones:human.spike.forearmSkinBones,
        shoulderSkinBones:human.spike.shoulderSkinBones});
      const head=human.spike.graph.joints.find(j=>j.role==="head")!;
      fk.apply([{jointId:head.id,motion:"flexion",radians:.3}]);
      expect(()=>applyHumanMorphology(human,createMammalianHeadRecipe("primate")))
        .toThrow(/neutral-pose/);
      fk.apply([]);
      expect(human.mesh.geometry.getAttribute("position").getX(0)).toBe(first);
    }finally{human.dispose();}
  },60_000);
});
