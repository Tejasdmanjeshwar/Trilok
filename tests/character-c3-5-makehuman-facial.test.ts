import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {readFileSync} from "node:fs";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {applyHumanMorphology} from "../apps/web/src/characters/geometry/HumanMorphology";
import {createHumanHeadRecipe,DEFAULT_HUMAN_HEAD_MORPHOLOGY} from "@trilok/character-core";
import {FACIAL_CONTROLS,FACIAL_PRESETS,MakeHumanFacialController,
  validateFacialAtlas,validateFacialWeights,type FacialAtlas} from
  "../apps/web/src/characters/geometry/MakeHumanFacialTargets";
import type {SourceRig,SourceWeights} from "../apps/web/src/characters/geometry/OfficialHumanRig";

const asset=(file:string)=>readFileSync("apps/web/public/anatomy/"+file,"utf8");
const manifest=JSON.parse(readFileSync("assets/makehuman-facial-v1.json","utf8"));
const sourceAtlas:FacialAtlas={
  payload:{schemaVersion:1,
    revision:"a8bc2d54ff0ac92e78ff71431b1023eda42bf482",
    license:"CC0-1.0",units:"MakeHuman source coordinates",
    sourceManifestHash:"0".repeat(64),
    targets:manifest.targets.map((entry:{id:string})=>({id:entry.id,rows:[0,0,0,0.01]}))},
  contentDigest:"0".repeat(64),
};
function human(){
  const template=parseAnatomicalOBJ(asset("makehuman-base.obj"),{includeGroups:["body"]});
  const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
  const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
  return bindTemplateToSemanticRig(template,{rig,weights});
}
describe("C3.5 pinned MakeHuman facial data contract",()=>{
  it("pins original upstream CC0 assets with complete control mapping",()=>{
    expect(manifest.revision).toBe("a8bc2d54ff0ac92e78ff71431b1023eda42bf482");
    expect(manifest.targets.length).toBe(80);
    expect(new Set(manifest.targets.map((t:{id:string})=>t.id)).size).toBe(80);
    expect(FACIAL_CONTROLS.length).toBeGreaterThanOrEqual(45);
    const ids=new Set(manifest.targets.map((t:{id:string})=>t.id));
    for(const c of FACIAL_CONTROLS){
      expect(ids.has(c.positive),c.id).toBe(true);
      if(c.negative)expect(ids.has(c.negative),c.id).toBe(true);
    }
  });
  it("rejects nonfinite, out-of-range, unexpected and invalid source targets",()=>{
    expect(()=>validateFacialWeights({leftLid:Infinity})).toThrow();
    expect(()=>validateFacialWeights({unknown:1})).toThrow();
    expect(()=>validateFacialWeights({leftLid:-0.1})).toThrow();
    expect(()=>validateFacialWeights({leftLid:1.25})).not.toThrow();
    expect(()=>validateFacialAtlas(sourceAtlas,20000)).not.toThrow();
    const invalid:FacialAtlas={...sourceAtlas,payload:{...sourceAtlas.payload,
      targets:sourceAtlas.payload.targets.map((t,i)=>i===0?
        {...t,rows:[20001,0,0,0.1]}:t)}};
    expect(()=>validateFacialAtlas(invalid,20000)).toThrow();
  });
  it("retains source topology/UV/skin and determinism across combinations",()=>{
    const instance=human();
    try{
      applyHumanMorphology(instance,createHumanHeadRecipe({...DEFAULT_HUMAN_HEAD_MORPHOLOGY,
        cheeks:1.06,brow:1.05}));
      const {mesh,template}=instance;
      const geometry=mesh.geometry;
      const baseline=Float32Array.from(geometry.getAttribute("position").array as ArrayLike<number>);
      const index=Array.from(geometry.getIndex()!.array);
      const uv=Array.from(geometry.getAttribute("uv").array);
      const skin=Array.from(geometry.getAttribute("skinWeight").array);
      const ctrl=new MakeHumanFacialController(instance,sourceAtlas);
      const a=ctrl.apply({leftLid:1,rightBrow:0.7,leftCheek:0.3});
      const first=Float32Array.from(geometry.getAttribute("position").array as ArrayLike<number>);
      expect(a.seamMismatches).toBe(0);
      expect(a.finiteFailures).toBe(0);
      ctrl.apply({rightBrow:0.7,leftCheek:0.3,leftLid:1});
      expect(Array.from(geometry.getAttribute("position").array)).toEqual(Array.from(first));
      ctrl.apply(FACIAL_PRESETS.neutral!);
      expect(Array.from(geometry.getAttribute("position").array)).toEqual(Array.from(baseline));
      expect(template.sourceVertexIds.length).toBe(geometry.getAttribute("position").count);
      expect(Array.from(geometry.getIndex()!.array)).toEqual(index);
      expect(Array.from(geometry.getAttribute("uv").array)).toEqual(uv);
      expect(Array.from(geometry.getAttribute("skinWeight").array)).toEqual(skin);
      ctrl.dispose();
      expect(()=>ctrl.apply({leftLid:1})).toThrow(/disposed/);
      expect(instance.spike.character.root.scale).toEqual(new THREE.Vector3(1,1,1));
    }finally{instance.dispose();}
  });
});
