import {describe,it,expect} from "vitest";
import {
 initialStudioRecipe,reduceStudioRecipe,studioRecipeFingerprint,
 validateStudioRecipe,type StudioRecipeV1,
} from "../apps/web/src/studio/StudioRecipe";
import {StudioHistory} from "../apps/web/src/studio/StudioHistory";

const adjust=(id:string,value:number)=>({type:"adjust",id,value} as const);
const preset=(section:"body"|"face",value:string)=>
  ({type:"preset",section,preset:value} as const);

describe("Studio versioned in-memory character recipe",()=>{
  it("starts with an immutable, human-only validated neutral recipe",()=>{
    const recipe=initialStudioRecipe();
    expect(Object.isFrozen(recipe)).toBe(true);
    expect(Object.isFrozen(recipe.morphology.body)).toBe(true);
    expect(Object.isFrozen(recipe.morphology.face)).toBe(true);
    expect(Object.isFrozen(recipe.morphology.shape)).toBe(true);
    expect(recipe.schemaVersion).toBe(1);
    expect(recipe.topologyFamilyId).toBe("humanoid_biped_v1");
    expect(recipe.seed).toBe(1);
    expect(()=>validateStudioRecipe(recipe)).not.toThrow();
  });
  it("rejects altered schema, unknown modifiers and invalid numbers",()=>{
    const initial=initialStudioRecipe();
    const invalid=(changes:Partial<StudioRecipeV1>)=>
      validateStudioRecipe({...initial,...changes});
    expect(()=>invalid({schemaVersion:2 as 1})).toThrow();
    expect(()=>invalid({archetypeId:"vanara" as "human"})).toThrow();
    expect(()=>invalid({seed:0})).toThrow();
    expect(()=>invalid({seed:1.25})).toThrow();
    expect(()=>invalid({selectedPresets:{body:"unknown",face:"neutral"}})).toThrow();
    expect(()=>invalid({morphology:{...initial.morphology,
      shape:{...initial.morphology.shape,unknown:1}} as typeof initial.morphology})).toThrow();
    expect(()=>reduceStudioRecipe(initial,adjust("body:macro/age",NaN))).toThrow();
    expect(()=>reduceStudioRecipe(initial,adjust("face:noseWidth",1.26))).toThrow();
    expect(()=>reduceStudioRecipe(initial,adjust("body:missing",.5))).toThrow();
    expect(()=>reduceStudioRecipe(initial,adjust("shape:jawWidth",1.2))).toThrow();
  });
  it("keeps independent body/face edits, derived source presets and resets",()=>{
    const a=initialStudioRecipe();
    const b=reduceStudioRecipe(a,adjust("body:macro/age",.03));
    const c=reduceStudioRecipe(b,preset("face","smile"));
    const d=reduceStudioRecipe(c,adjust("shape:jawWidth",1.09));
    expect(d.morphology.body["macro/age"]).toBe(.03);
    expect(d.morphology.face.smile).toBe(.85);
    expect(d.morphology.shape.jawWidth).toBe(1.09);
    expect(d.selectedPresets).toEqual({body:"custom",face:"custom"});
    expect(a.morphology.body["macro/age"]).toBeUndefined();
    const reset=reduceStudioRecipe(d,{type:"reset-section",section:"body"});
    expect(reset.morphology.body).toEqual({});
    expect(reset.morphology.face.smile).toBe(.85);
    const all=reduceStudioRecipe(reset,{type:"reset-all"});
    expect(studioRecipeFingerprint(all)).toEqual(studioRecipeFingerprint(a));
  });
  it("makes independent source-channel order deterministic",()=>{
    const start=initialStudioRecipe();
    const a=reduceStudioRecipe(reduceStudioRecipe(start,adjust("face:noseWidth",.5)),
      adjust("face:chinWidth",.25));
    const b=reduceStudioRecipe(reduceStudioRecipe(start,adjust("face:chinWidth",.25)),
      adjust("face:noseWidth",.5));
    expect(studioRecipeFingerprint(a)).toBe(studioRecipeFingerprint(b));
    expect(a).not.toBe(b);
    expect(studioRecipeFingerprint(start)).not.toEqual(studioRecipeFingerprint(a));
  });
  it("preserves original infant source knots and extremes",()=>{
    for(const age of [0,.01,.03,.05,.055,.06,.1875,.5,1]){
      const value=reduceStudioRecipe(initialStudioRecipe(),adjust("body:macro/age",age));
      expect(value.morphology.body["macro/age"]).toBe(age);
    }
    const b=reduceStudioRecipe(initialStudioRecipe(),
      adjust("body:native/hip/hip-scale-horiz-decr-incr",-1.25));
    const f=reduceStudioRecipe(b,adjust("face:noseWidth",1.25));
    expect(f.morphology.face.noseWidth).toBe(1.25);
    expect(f.morphology.body["native/hip/hip-scale-horiz-decr-incr"]).toBe(-1.25);
  });
});

describe("Studio bounded semantic edit history",()=>{
  it("groups an entire slider gesture into a single undo entry",()=>{
    const h=new StudioHistory();
    h.beginGesture("body:macro/age");
    for(const age of [.1,.06,.03]){
      expect(h.apply(adjust("body:macro/age",age))).toBe(true);
      // Rendering intermediate previews must not split the gesture.
      expect(h.resolve(h.status.revision,true)).toBe(true);
    }
    h.endGesture();
    expect(h.status.length).toBe(2);
    expect(h.current.morphology.body["macro/age"]).toBe(.03);
    expect(h.undo()).toBe(true);
    expect(h.current.morphology.body["macro/age"]).toBeUndefined();
    expect(h.redo()).toBe(true);
    expect(h.current.morphology.body["macro/age"]).toBe(.03);
  });
  it("undo redo round-trips presets and invalidates redo after branch edit",()=>{
    const h=new StudioHistory();
    h.apply(preset("body","athletic"));
    h.apply(preset("face","smile"));
    const signature=studioRecipeFingerprint(h.current);
    expect(h.undo()).toBe(true);
    expect(h.redo()).toBe(true);
    expect(studioRecipeFingerprint(h.current)).toBe(signature);
    h.undo();
    h.apply(adjust("face:noseWidth",.75));
    expect(h.redo()).toBe(false);
    expect(h.current.morphology.face.noseWidth).toBe(.75);
  });
  it("bounds history to capacity without losing valid timeline",()=>{
    const h=new StudioHistory(4);
    for(let i=0;i<12;i++)h.apply(adjust("face:noseWidth",(i+1)/20));
    expect(h.status.length).toBe(4);
    let undoCount=0;
    while(h.undo())undoCount++;
    expect(undoCount).toBe(3);
    expect(h.undo()).toBe(false);
  });
  it("does not commit invalid or repeated edits",()=>{
    const h=new StudioHistory();
    const revision=h.status.revision;
    expect(()=>h.apply(adjust("face:noseWidth",Infinity))).toThrow();
    expect(h.status.revision).toBe(revision);
    expect(h.apply({type:"reset-all"})).toBe(false);
    expect(h.status.length).toBe(1);
  });
  it("rejects stale success/failure during newer editing",()=>{
    const h=new StudioHistory();
    h.apply(adjust("body:macro/age",.03));
    const stale=h.status.revision;
    h.apply(adjust("body:macro/age",.06));
    expect(h.resolve(stale,false)).toBe(false);
    expect(h.resolve(stale,true)).toBe(false);
    expect(h.current.morphology.body["macro/age"]).toBe(.06);
    expect(h.resolve(h.status.revision,true)).toBe(true);
  });
  it("rolls back failed edits to the last rendered valid state and keeps undo",()=>{
    const h=new StudioHistory();
    h.apply(adjust("body:macro/age",.03));
    h.resolve(h.status.revision,true);
    h.beginGesture("body:macro/age");
    h.apply(adjust("body:macro/age",.04));
    h.resolve(h.status.revision,true);
    h.apply(adjust("body:macro/age",.05));
    const serial=h.status.revision;
    expect(h.resolve(serial,false)).toBe(true);
    expect(h.current.morphology.body["macro/age"]).toBe(.04);
    expect(h.undo()).toBe(true);
    expect(h.current.morphology.body["macro/age"]).toBe(.03);
  });
  it("undo while regeneration is pending cannot be overwritten by stale render",()=>{
    const h=new StudioHistory();
    h.apply(adjust("body:macro/age",.03));
    const inFlight=h.status.revision;
    h.undo();
    const undoSerial=h.status.revision;
    expect(h.resolve(inFlight,true)).toBe(false);
    expect(h.resolve(undoSerial,true)).toBe(true);
    expect(h.current.morphology.body["macro/age"]).toBeUndefined();
    expect(h.redo()).toBe(true);
    expect(h.current.morphology.body["macro/age"]).toBe(.03);
  });
});
