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
import {getVanaraReplacement} from
  "../apps/web/src/characters/geometry/VanaraHeadReplacement";
import {makeMammalianHeadTransform} from
  "../apps/web/src/characters/geometry/MammalianHeadDeformation";
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

  it("both families retain C1/C2 skin, but only primate replaces facial topology",()=>{
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
          const vanara=getVanaraReplacement(human);
          if(family==="primate") {
            expect(vanara).toBeDefined();
            expect(mesh.geometry.getIndex()!.count).toBeLessThan(faces.length);
            const kept=Array.from(mesh.geometry.getIndex()!.array);
            expect(faces.length-kept.length).toBe(
              vanara!.removedHumanTriangles*3);
            expect(vanara!.newHeadTriangles).toBeLessThanOrEqual(
              vanara!.removedHumanTriangles*1.30);
            expect(vanara!.headWidthMeters).toBeLessThanOrEqual(
              vanara!.humanWidthMeters*1.11);
            expect(vanara!.seamVertices).toBeGreaterThanOrEqual(24);
            const headGeometry=vanara!.mesh.geometry;
            const vertices=headGeometry.getAttribute("position");
            const influences=headGeometry.getAttribute("skinWeight");
            expect(headGeometry.getIndex()!.count/3).toBe(
              vanara!.newHeadTriangles);
            expect(headGeometry.getAttribute("uv").count).toBe(vertices.count);
            for(let i=0;i<influences.count;i++){
              let total=0;
              for(let k=0;k<4;k++)
                total+=influences.getComponent(i,k);
              expect(Math.abs(total-1)).toBeLessThan(1e-4);
            }
          }else{
            expect(vanara).toBeUndefined();
            expect([...mesh.geometry.getIndex()!.array]).toEqual(faces);
          }
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
          if(family==="bear")
            inspectAnatomicalMorphologyBaseline(human);
          else
            expect(vanara!.mesh.geometry.getAttribute("position").count)
              .toBeGreaterThan(vanara!.seamVertices);
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


  it("features calibrated nasal pad, paired recessed nostrils and jaw-mounted mouth",()=>{
    for(const family of families){
      const human=session(family);
      try{
        const base=human.mesh.geometry.getAttribute("position");
        const previous=Float32Array.from(base.array as ArrayLike<number>);
        const recipe=createMammalianHeadRecipe(family,stressed);
        applyHumanMorphology(human,recipe);
        const {spike,mesh}=human;
        const colors=mesh.geometry.getAttribute("color");
        expect(colors).toBeDefined();
        expect(colors!.itemSize).toBe(3);
        expect(colors!.count).toBe(base.count);
        const seen=new Set<string>();
        for(let i=0;i<colors!.count;i++){
          const r=colors!.getX(i),g=colors!.getY(i),b=colors!.getZ(i);
          expect([r,g,b].every(v=>Number.isFinite(v)&&v>=0&&v<=1)).toBe(true);
          seen.add([r,g,b].map(n=>n.toFixed(2)).join(","));
        }
        expect(seen.size).toBeGreaterThan(12);
        const raw=session(family);
        let anatomy:ReturnType<typeof makeMammalianHeadTransform>["anatomy"];
        try {anatomy=makeMammalianHeadTransform(raw,family,stressed).anatomy;}
        finally {raw.dispose();}
        const n=anatomy.metrics;
        expect(n.noseY).toBeGreaterThan(n.mouthY);
        expect(n.maximumMuzzleProjectionMeters).toBeLessThan(.07);
        const left=new THREE.Vector3(-n.nasalHalfWidth*.40,n.noseY-n.noseHeight*.22,n.faceZ+.1);
        const right=left.clone();right.x=-left.x;
        const nasal=anatomy.fields(new THREE.Vector3(0,n.noseY,n.faceZ+.1));
        const naresL=anatomy.fields(left),naresR=anatomy.fields(right);
        expect(nasal.nosePad).toBeGreaterThan(0);
        expect(naresL.nostrilLeft).toBeGreaterThan(naresL.nostrilRight);
        expect(naresR.nostrilRight).toBeGreaterThan(naresR.nostrilLeft);
        const mouth=anatomy.fields(new THREE.Vector3(0,n.mouthY,n.faceZ+.1));
        expect(mouth.mouthCrease).toBeGreaterThan(.1);
        const lm=getMammalianHeadLandmarks(human)!;
        expect(lm.noseRest[1]).toBeGreaterThan(lm.mouthRest[1]);
        expect(lm.nostrilLeftRest[0]).toBeLessThan(lm.nostrilRightRest[0]);
        const fk=new AnatomicalFK(spike.graph,spike.bones,{
          jawTipWorldRest:human.jawTipWorldRest,
          forearmSkinBones:spike.forearmSkinBones,
          shoulderSkinBones:spike.shoulderSkinBones,
        });
        const mouthBefore=lm.mouthWorld(),noseBefore=lm.noseWorld();
        const jaw=spike.graph.joints.find(j=>j.role==="jaw")!;
        fk.apply([{jointId:jaw.id,motion:"flexion",radians:.45}]);
        expect(lm.mouthWorld().distanceTo(mouthBefore)).toBeGreaterThan(.001);
        expect(lm.noseWorld().distanceTo(noseBefore)).toBeLessThan(.00001);
        fk.apply([]);
        expect(lm.mouthWorld().distanceTo(mouthBefore)).toBeLessThan(.00001);
        expect(lm.noseWorld().distanceTo(noseBefore)).toBeLessThan(.00001);
        let maxDelta=0;
        for(let i=0;i<base.count;i++){
          const p=new THREE.Vector3().fromBufferAttribute(base,i);
          const source=new THREE.Vector3(previous[i*3]!,previous[i*3+1]!,
            previous[i*3+2]!);
          maxDelta=Math.max(maxDelta,p.distanceTo(source));
        }
        expect(maxDelta).toBeGreaterThan(.01);
        expect(maxDelta).toBeLessThan(.35);
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
