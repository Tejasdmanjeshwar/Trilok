import {describe,it,expect} from "vitest";
import * as THREE from "three";
import {readFileSync} from "node:fs";
import {
  HUMAN_SKIN_TONES,FINISH_PRESETS,DEFAULT_STUDIO_APPEARANCE,
  SKIN_ROUGHNESS_RANGE,STUDIO_APPEARANCE_CONTROLS,STUDIO_MODULES,
  availableStudioModules,validateStudioAppearance,withSkinTone,
  withSkinRoughness,withFinishPreset,
} from "../apps/web/src/studio/StudioAppearance";
import {applyStudioSkinMaterial} from "../apps/web/src/studio/StudioSkinMaterial";
import {
  initialStudioRecipe,reduceStudioRecipe,studioRecipeFingerprint,
  validateStudioRecipe,
} from "../apps/web/src/studio/StudioRecipe";
import {StudioHistory} from "../apps/web/src/studio/StudioHistory";

describe("Studio real skin material appearance",()=>{
  it("ships only physical, supported skin controls and actual modular capabilities",()=>{
    expect(STUDIO_APPEARANCE_CONTROLS.map(c=>c.id)).toEqual(["tone","roughness"]);
    expect(availableStudioModules().map(m=>m.id)).toEqual(["body","face","appearance"]);
    expect(STUDIO_MODULES.filter(m=>m.availability==="deferred")
      .every(m=>m.controls.length===0)).toBe(true);
    const ui=readFileSync("apps/web/src/studio/main.ts","utf8");
    expect(ui).toContain("availableStudioModules()");
    expect(ui).not.toContain('data-section="hair"');
    expect(ui).not.toContain('data-section="armor"');
  });
  it("keeps deterministic swatch colors, valid bounded roughness and no fake textures",()=>{
    expect(Object.keys(HUMAN_SKIN_TONES).length).toBe(8);
    for(const tone of Object.values(HUMAN_SKIN_TONES)){
      expect(tone.hex).toBeGreaterThanOrEqual(0);
      expect(tone.hex).toBeLessThanOrEqual(0xffffff);
    }
    for(const value of Object.values(FINISH_PRESETS)){
      expect(value.roughness).toBeGreaterThanOrEqual(SKIN_ROUGHNESS_RANGE.min);
      expect(value.roughness).toBeLessThanOrEqual(SKIN_ROUGHNESS_RANGE.max);
    }
    expect(()=>validateStudioAppearance(DEFAULT_STUDIO_APPEARANCE)).not.toThrow();
    expect(()=>withSkinTone(DEFAULT_STUDIO_APPEARANCE,"missing" as "neutral")).toThrow();
    expect(()=>withSkinRoughness(DEFAULT_STUDIO_APPEARANCE,Infinity)).toThrow();
    expect(()=>withSkinRoughness(DEFAULT_STUDIO_APPEARANCE,.03)).toThrow();
    expect(()=>withFinishPreset(DEFAULT_STUDIO_APPEARANCE,"invalid" as "matte")).toThrow();
  });
  it("updates only the existing owned Three.js standard material",()=>{
    const geom=new THREE.BufferGeometry();
    const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.86,metalness:.2});
    const mesh=new THREE.SkinnedMesh(geom,material);
    const tone=withSkinTone(DEFAULT_STUDIO_APPEARANCE,"deep");
    const edited=withSkinRoughness(tone,.51);
    applyStudioSkinMaterial(mesh,edited);
    expect(mesh.geometry).toBe(geom);
    expect(mesh.material).toBe(material);
    expect(material.color.getHex()).toBe(HUMAN_SKIN_TONES.deep.hex);
    expect(material.roughness).toBe(.51);
    expect(material.metalness).toBe(0);
    const before=material.color.getHex();
    expect(()=>applyStudioSkinMaterial(mesh,{...edited,roughness:NaN})).toThrow();
    expect(material.color.getHex()).toBe(before);
    geom.dispose();material.dispose();
  });
  it("appearance is a validated immutable part of the existing in-memory recipe",()=>{
    const neutral=initialStudioRecipe();
    const edited=reduceStudioRecipe(neutral,{type:"appearance-tone",tone:"amber"});
    const finish=reduceStudioRecipe(edited,{type:"appearance-finish",preset:"matte"});
    expect(edited.appearance.tone).toBe("amber");
    expect(finish.appearance.roughness).toBe(FINISH_PRESETS.matte.roughness);
    expect(neutral.appearance).toEqual(DEFAULT_STUDIO_APPEARANCE);
    expect(Object.isFrozen(finish.appearance)).toBe(true);
    expect(studioRecipeFingerprint(finish)).not.toBe(studioRecipeFingerprint(neutral));
    expect(()=>validateStudioRecipe({...finish,appearance:{
      ...finish.appearance,unsafe:1,
    } as typeof finish.appearance})).toThrow();
  });
  it("undo/redo, reset and appearance stay independent of body, face and camera",()=>{
    const h=new StudioHistory();
    h.apply({type:"adjust",id:"body:macro/age",value:.03});
    h.resolve(h.status.revision,true);
    h.apply({type:"adjust",id:"face:noseWidth",value:.5});
    h.resolve(h.status.revision,true);
    h.apply({type:"appearance-tone",tone:"deep"});
    h.resolve(h.status.revision,true);
    h.apply({type:"appearance-roughness",roughness:.52});
    h.resolve(h.status.revision,true);
    const applied=h.current;
    expect(applied.morphology.body["macro/age"]).toBe(.03);
    expect(applied.morphology.face.noseWidth).toBe(.5);
    expect(applied.appearance).toEqual({tone:"deep",roughness:.52});
    expect(h.undo()).toBe(true);
    expect(h.current.appearance.roughness).toBe(DEFAULT_STUDIO_APPEARANCE.roughness);
    expect(h.undo()).toBe(true);
    expect(h.current.appearance.tone).toBe("neutral");
    expect(h.redo()).toBe(true);
    expect(h.redo()).toBe(true);
    expect(studioRecipeFingerprint(h.current)).toBe(studioRecipeFingerprint(applied));
    h.apply({type:"reset-appearance"});
    expect(h.current.appearance).toEqual(DEFAULT_STUDIO_APPEARANCE);
    expect(h.current.morphology.body["macro/age"]).toBe(.03);
    expect(h.current.morphology.face.noseWidth).toBe(.5);
    h.apply({type:"reset-all"});
    expect(h.current.appearance).toEqual(DEFAULT_STUDIO_APPEARANCE);
    expect(h.current.morphology.body).toEqual({});
  });
  it("coalesces an appearance slider gesture into one undo action",()=>{
    const h=new StudioHistory();
    h.beginGesture("appearance:roughness");
    for(const roughness of [.61,.65,.68]){
      h.apply({type:"appearance-roughness",roughness});
      h.resolve(h.status.revision,true);
    }
    h.endGesture();
    expect(h.status.length).toBe(2);
    expect(h.current.appearance.roughness).toBe(.68);
    h.undo();
    expect(h.current.appearance.roughness).toBe(DEFAULT_STUDIO_APPEARANCE.roughness);
  });
});
