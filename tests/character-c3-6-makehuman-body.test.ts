import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {readFileSync} from "node:fs";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {BODY_CONTROLS,BODY_PRESETS,BODY_MACRO_DEFAULTS,setBodyAncestryChannel,
  MakeHumanBodyController,resolveBodyMacroFactors,
  validateBodyWeights,validateBodyAtlas,type BodyAtlas} from "../apps/web/src/characters/geometry/MakeHumanBodyTargets";
import {NATIVE_MAKEHUMAN_BODY_MODIFIERS} from "../apps/web/src/characters/geometry/NativeMakeHumanBodyControls";
import {getHumanMorphologyAlignment} from "../apps/web/src/characters/geometry/HumanMorphology";
import type {SourceRig,SourceWeights} from "../apps/web/src/characters/geometry/OfficialHumanRig";
const asset=(f:string)=>readFileSync("apps/web/public/anatomy/"+f,"utf8");
const manifest=JSON.parse(readFileSync("assets/makehuman-body-v1.json","utf8"));
function makeHuman(){
  const tpl=parseAnatomicalOBJ(asset("makehuman-base.obj"),{includeGroups:["body"]});
  const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
  const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
  return bindTemplateToSemanticRig(tpl,{rig,weights});
}
describe("C3.6 original MakeHuman body asset correspondence",()=>{
  it("pins complete source and native modifiers, with no fabricated target files",()=>{
    expect(manifest.revision).toBe("a8bc2d54ff0ac92e78ff71431b1023eda42bf482");
    expect(manifest.license).toBe("CC0-1.0");
    expect(manifest.targets.length).toBe(846);
    expect(new Set(manifest.targets.map((t:{id:string})=>t.id)).size).toBe(846);
    expect(NATIVE_MAKEHUMAN_BODY_MODIFIERS.length).toBe(142);
    const ids=new Set(manifest.targets.map((t:{id:string})=>t.id));
    for(const c of BODY_CONTROLS) {
      if(c.positive)expect(ids.has(c.positive),c.id+" positive").toBe(true);
      if(c.negative)expect(ids.has(c.negative),c.id+" negative").toBe(true);
    }
  });
  it("preserves original MakeHuman signed and unipolar supported ranges",()=>{
    for(const c of BODY_CONTROLS.filter(c=>c.positive)){
      expect(c.nativeMin===-1||c.nativeMin===0).toBe(true);
      expect(c.nativeMax).toBe(1);
    }
    expect(()=>validateBodyWeights({"native/hip/hip-scale-horiz-decr-incr":-1.25})).not.toThrow();
    expect(()=>validateBodyWeights({"native/hip/hip-scale-horiz-decr-incr":-1.26})).toThrow();
    expect(()=>validateBodyWeights({"macro/muscle":NaN})).toThrow();
    expect(()=>validateBodyWeights({"macro/african":.7,"macro/asian":.7})).toThrow();
    expect(()=>validateBodyWeights({unexpected:1})).toThrow();
  });
  it("matches pinned MakeHuman native macro factor knots and ethnic coupling",()=>{
    expect(BODY_MACRO_DEFAULTS["macro/african"]).toBeCloseTo(1/3,12);
    expect(BODY_MACRO_DEFAULTS["macro/asian"]).toBeCloseTo(1/3,12);
    expect(BODY_MACRO_DEFAULTS["macro/caucasian"]).toBeCloseTo(1/3,12);
    const normalized=setBodyAncestryChannel({},"african",.7);
    expect(normalized["macro/african"]).toBe(.7);
    expect(normalized["macro/asian"]).toBeCloseTo(.15,12);
    expect(normalized["macro/caucasian"]).toBeCloseTo(.15,12);
    expect(()=>validateBodyWeights(normalized)).not.toThrow();
    expect(resolveBodyMacroFactors({}).size).toBe(0);
    const weight=resolveBodyMacroFactors({"macro/weight":1});
    expect([...weight.keys()].some(k=>k.startsWith("macrodetails/height/"))).toBe(false);
    expect([...weight.keys()].some(k=>k.startsWith("macrodetails/proportions/"))).toBe(false);
    const age=resolveBodyMacroFactors({"macro/age":.1875});
    expect(age.get("macrodetails/caucasian-male-child")).toBeCloseTo((.1875*5.333)/6,10);
    expect(age.get("macrodetails/caucasian-male-baby")).toBeCloseTo((1-.1875*5.333)/6,10);
    expect(resolveBodyMacroFactors({"macro/height":1}).get(
      "macrodetails/height/male-young-averagemuscle-averageweight-maxheight"))
      .toBeCloseTo(.5,8);
  });
  it("maps source endpoints exactly, with identical deltas on original UV duplicates",()=>{
    const atlas=JSON.parse(readFileSync("assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
    const human=makeHuman();
    try{
      const ctrl=new MakeHumanBodyController(human,atlas);
      const geometry=human.mesh.geometry;
      const base=Float32Array.from(geometry.getAttribute("position").array as ArrayLike<number>);
      const originalFaces=Array.from(geometry.getIndex()!.array);
      const originalUvs=Array.from(geometry.getAttribute("uv").array);
      const originalSkin=Array.from(geometry.getAttribute("skinWeight").array);
      const atlasById=validateBodyAtlas(atlas,human.template.sourceVertexCount);
      for(const [control,targetId,value] of [
        ["native/armslegs/l-hand-fingers-length-decr-incr","armslegs/l-hand-fingers-length-incr",1],
        ["native/armslegs/l-hand-fingers-length-decr-incr","armslegs/l-hand-fingers-length-decr",-1],
        ["native/neck/neck-scale-horiz-decr-incr","neck/neck-scale-horiz-incr",1],
        ["native/hip/hip-scale-horiz-decr-incr","hip/hip-scale-horiz-decr",-1],
      ] as const){
        const target=atlasById.get(targetId)!;
        expect(target).toBeDefined();
        const sourceId=target.rows[0]!;
        const renderId=human.template.sourceVertexIds.indexOf(sourceId);
        expect(renderId).toBeGreaterThanOrEqual(0);
        const diagnostics=ctrl.apply({[control]:value});
        const position=geometry.getAttribute("position");
        for(let axis=0;axis<3;axis++){
          const expected=base[renderId*3+axis]!+
            target.rows[axis+1]!*human.template.conversionMetersPerSourceUnit;
          expect(Math.abs(position.getComponent(renderId,axis)-expected)).toBeLessThan(2e-6);
        }
        expect(diagnostics.finiteFailures).toBe(0);
        expect(diagnostics.seamMismatches).toBe(0);
      }
      ctrl.apply({});
      expect(Array.from(geometry.getAttribute("position").array)).toEqual(Array.from(base));
      expect(Array.from(geometry.getIndex()!.array)).toEqual(originalFaces);
      expect(Array.from(geometry.getAttribute("uv").array)).toEqual(originalUvs);
      expect(Array.from(geometry.getAttribute("skinWeight").array)).toEqual(originalSkin);
      ctrl.dispose();
      expect(()=>ctrl.apply({})).toThrow(/disposed/);
    }finally{human.dispose();}
  },120_000);
  it("refits C1 rest skeleton, inverse binds and semantic IK from source body displacement",()=>{
    const atlas=JSON.parse(readFileSync("assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
    const human=makeHuman();
    try{
      const root=human.spike.character.root;
      root.updateMatrixWorld(true);
      const original=human.spike.skeleton.bones.map(b=>
        b.getWorldPosition(new THREE.Vector3()));
      const ctrl=new MakeHumanBodyController(human,atlas);
      const diagnostic=ctrl.apply({"native/measure/measure-upperarm-length-decr-incr":1});
      expect(diagnostic.affectedVertices).toBeGreaterThan(0);
      const alignment=getHumanMorphologyAlignment(human);
      expect(alignment).toBeDefined();
      expect(alignment!.chains.get("arm_left")!.upperMeters).toBeGreaterThan(.08);
      const changed=human.spike.skeleton.bones.some((bone,i)=>
        bone.getWorldPosition(new THREE.Vector3()).distanceTo(original[i]!)>1e-5);
      expect(changed).toBe(true);
      for(let i=0;i<human.spike.skeleton.bones.length;i++){
        const bone=human.spike.skeleton.bones[i]!;
        const m=bone.matrixWorld.clone().multiply(human.spike.skeleton.boneInverses[i]!);
        const e=m.elements;
        expect(e.every((v,j)=>Math.abs(v-(j%5===0?1:0))<1e-5)).toBe(true);
      }
      ctrl.apply({});
      root.updateMatrixWorld(true);
      human.spike.skeleton.bones.forEach((bone,i)=>{
        expect(bone.getWorldPosition(original[i]!.clone()).distanceTo(original[i]!))
          .toBeLessThan(1e-5);
      });
      ctrl.dispose();
    }finally{human.dispose();}
  },120_000);
  it("rejects a posed C1 skeleton before any geometry or inverse bind changes",()=>{
    const atlas=JSON.parse(readFileSync("assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
    const human=makeHuman();
    try{
      const ctrl=new MakeHumanBodyController(human,atlas);
      const geometry=human.mesh.geometry;
      const positions=Array.from(geometry.getAttribute("position").array);
      const inverse=human.spike.skeleton.boneInverses.map(m=>m.clone());
      const bone=human.spike.skeleton.bones.find(b=>b.name.includes("shoulder")) ??
        human.spike.skeleton.bones[5]!;
      bone.rotation.x+=.3;
      human.spike.character.root.updateMatrixWorld(true);
      expect(()=>ctrl.apply({"native/neck/neck-scale-horiz-decr-incr":.6}))
        .toThrow(/neutral-pose rest skeleton/);
      expect(Array.from(geometry.getAttribute("position").array)).toEqual(positions);
      human.spike.skeleton.boneInverses.forEach((m,i)=>
        expect(m.elements).toEqual(inverse[i]!.elements));
      bone.rotation.x-=.3;
      human.spike.character.root.updateMatrixWorld(true);
      expect(ctrl.apply({}).finiteFailures).toBe(0);
      ctrl.dispose();
    }finally{human.dispose();}
  },120_000);
  it("keeps jaw-tip displacement in root-local coordinates after root rotation",()=>{
    const atlas=JSON.parse(readFileSync("assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
    const a=makeHuman(),b=makeHuman();
    try{
      const aRoot=a.spike.character.root,bRoot=b.spike.character.root;
      bRoot.position.set(1.2,.4,-.8);
      bRoot.rotation.y=.72;
      bRoot.updateMatrixWorld(true);
      // The world-space landmark accompanies its character when the root moves.
      b.jawTipWorldRest?.applyMatrix4(bRoot.matrixWorld);
      const aCtrl=new MakeHumanBodyController(a,atlas);
      const bCtrl=new MakeHumanBodyController(b,atlas);
      const recipe={"native/neck/neck-scale-horiz-decr-incr":.8};
      aCtrl.apply(recipe);
      bCtrl.apply(recipe);
      // A second refit must not misclassify a moved neutral root as FK motion.
      aCtrl.apply(recipe);
      bCtrl.apply(recipe);
      expect(a.jawTipWorldRest).toBeDefined();
      expect(b.jawTipWorldRest).toBeDefined();
      const expected=a.jawTipWorldRest!.clone().applyMatrix4(bRoot.matrixWorld);
      expect(b.jawTipWorldRest!.distanceTo(expected)).toBeLessThan(1e-5);
      aCtrl.dispose();bCtrl.dispose();
    }finally{a.dispose();b.dispose();}
  },120_000);
  it("uses insertion-order-independent macro factors and preserves neutral geometry",()=>{
    const atlas=JSON.parse(readFileSync("assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
    const human=makeHuman();
    try{
      const ctrl=new MakeHumanBodyController(human,atlas);
      const original=Array.from(human.mesh.geometry.getAttribute("position").array);
      expect(resolveBodyMacroFactors({}).size).toBe(0);
      const a=ctrl.apply(BODY_PRESETS.muscular!);
      expect(a.affectedVertices).toBeGreaterThan(0);
      const output=Array.from(human.mesh.geometry.getAttribute("position").array);
      const inverted=Object.fromEntries(Object.entries(BODY_PRESETS.muscular!).reverse());
      ctrl.apply(inverted);
      expect(Array.from(human.mesh.geometry.getAttribute("position").array)).toEqual(output);
      ctrl.apply({});
      expect(Array.from(human.mesh.geometry.getAttribute("position").array)).toEqual(original);
      expect(a.unsupportedExtrapolation).toBe(false);
      expect(ctrl.apply(BODY_PRESETS.stress!).unsupportedExtrapolation).toBe(true);
    }finally{human.dispose();}
  },120_000);
});
