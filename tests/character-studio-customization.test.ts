import {describe,it,expect} from "vitest";
import {
  BODY_CONTROLS,BODY_PRESETS,resolveBodyMacroFactors,
} from "../apps/web/src/characters/geometry/MakeHumanBodyTargets";
import {
  ALL_FACIAL_CONTROLS,FACIAL_PRESETS,
} from "../apps/web/src/characters/geometry/MakeHumanFacialTargets";
import {
  STUDIO_CONTROLS,findStudioControls,defaultStudioMorphState,
  withStudioControl,resetStudioSection,withStudioPreset,controlValue,
  validateStudioMorphState,
} from "../apps/web/src/studio/StudioMorphCatalog";
import {DEFAULT_HUMAN_HEAD_MORPHOLOGY} from "@trilok/character-core";

describe("Character Studio authoritative MakeHuman controls",()=>{
  it("exposes every native body and facial modifier and original bounds",()=>{
    const body=STUDIO_CONTROLS.filter(c=>c.channel==="body");
    const face=STUDIO_CONTROLS.filter(c=>c.channel==="face");
    expect(body.length).toBe(BODY_CONTROLS.length);
    expect(face.length).toBe(ALL_FACIAL_CONTROLS.length);
    const ids=new Set(STUDIO_CONTROLS.map(c=>c.id));
    expect(ids.size).toBe(STUDIO_CONTROLS.length);
    for(const item of BODY_CONTROLS){
      const control=body.find(c=>c.id==="body:"+item.id);
      expect(control).toBeDefined();
      expect([control!.min,control!.max]).toEqual([item.min,item.max]);
    }
    for(const item of ALL_FACIAL_CONTROLS){
      const control=face.find(c=>c.id==="face:"+item.id);
      expect(control).toBeDefined();
      expect([control!.min,control!.max]).toEqual([item.min,item.max]);
    }
  });
  it("preserves age knots and infant source macro evaluation",()=>{
    for(const value of [0,.01,.03,.05,.055,.06,.1875,.5,1]){
      const next=withStudioControl(defaultStudioMorphState(),"body:macro/age",value);
      expect(next.body["macro/age"]).toBe(value);
      expect(resolveBodyMacroFactors(next.body).size).toBeGreaterThanOrEqual(0);
    }
    expect(STUDIO_CONTROLS.find(c=>c.id==="body:macro/age")?.step).toBe(.0005);
  });
  it("keeps native endpoints and existing deliberate stress extension",()=>{
    let state=defaultStudioMorphState();
    const native=STUDIO_CONTROLS.find(c=>c.id===
      "body:native/hip/hip-scale-horiz-decr-incr")!;
    state=withStudioControl(state,native.id,-1.25);
    expect(state.body[native.id.slice(5)]).toBe(-1.25);
    expect(()=>withStudioControl(state,native.id,-1.26)).toThrow();
    state=withStudioControl(state,"face:noseWidth",1.25);
    expect(state.face.noseWidth).toBe(1.25);
    expect(()=>withStudioControl(state,"face:noseWidth",1.26)).toThrow();
  });
  it("rebalances ancestry through original source rules",()=>{
    const next=withStudioControl(defaultStudioMorphState(),"body:macro/african",.7);
    expect(next.body["macro/african"]).toBe(.7);
    expect(next.body["macro/asian"]).toBeCloseTo(.15,10);
    expect(next.body["macro/caucasian"]).toBeCloseTo(.15,10);
    validateStudioMorphState(next);
  });
  it("has exact head and local bounds sourced from core schema",()=>{
    const initial=defaultStudioMorphState();
    expect(initial.shape).toEqual(DEFAULT_HUMAN_HEAD_MORPHOLOGY);
    const altered=withStudioControl(initial,"shape:jawWidth",1.09);
    expect(altered.shape.jawWidth).toBe(1.09);
    expect(()=>withStudioControl(initial,"shape:jawWidth",1.1)).toThrow();
  });
  it("supports contextual group search with hidden advanced controls",()=>{
    const basic=findStudioControls("body","",false);
    expect(basic.some(c=>c.id==="body:macro/age")).toBe(true);
    expect(basic.some(c=>c.id.startsWith("body:native/"))).toBe(false);
    const full=findStudioControls("body","",true);
    expect(full.length).toBe(STUDIO_CONTROLS.filter(c=>c.category==="body").length);
    expect(findStudioControls("face","nostril",false).some(c=>c.label.toLowerCase().includes("nostril"))).toBe(true);
    expect(findStudioControls("body","hand",true).length).toBeGreaterThan(0);
  });
  it("keeps opposite section, resets defaults and reuses source presets",()=>{
    const initial=defaultStudioMorphState();
    const body=withStudioPreset(initial,"body","athletic");
    expect(body.body).toEqual(BODY_PRESETS.athletic);
    const face=withStudioPreset(body,"face","smile");
    expect(face.face).toEqual(FACIAL_PRESETS.smile);
    const shaped=withStudioControl(face,"shape:skullWidth",1.08);
    const adjusted=withStudioControl(shaped,"body:macro/age",0);
    const reset=resetStudioSection(adjusted,"body");
    expect(reset.body).toEqual({});
    expect(reset.face).toEqual(face.face);
    expect(reset.shape.skullWidth).toBe(1.08);
    const facialReset=resetStudioSection(reset,"face");
    expect(facialReset.face).toEqual({});
    expect(facialReset.shape.skullWidth).toBe(1);
    expect(controlValue(facialReset,STUDIO_CONTROLS.find(c=>c.id==="body:macro/age")!)).toBe(.5);
  });
});
