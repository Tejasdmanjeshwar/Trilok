import {describe,it,expect} from "vitest";
import {initialStudioRecipe,reduceStudioRecipe,studioRecipeFingerprint,
  validateStudioRecipe} from "../apps/web/src/studio/StudioRecipe";
import {StudioHistory} from "../apps/web/src/studio/StudioHistory";
import {STUDIO_CONTROLS,controlValue} from "../apps/web/src/studio/StudioMorphCatalog";
import {
  DEFAULT_GENERATOR_OPTIONS,GENERATOR_STYLES,STUDIO_GENERATOR_VERSION,
  generateStudioCharacter,compareGeneratedCharacter,
  validateGeneratorOptions,type GeneratorOptions,
} from "../apps/web/src/studio/StudioGenerator";

const choices=(overrides:Partial<GeneratorOptions>={}):GeneratorOptions=>({
  ...DEFAULT_GENERATOR_OPTIONS,style:"warrior",seed:1729,
  ...overrides,
});
const generate=(recipe=initialStudioRecipe(),options=choices())=>
  reduceStudioRecipe(recipe,{type:"generate",options});

describe("C4.7 seeded human character generator",()=>{
  it("reproduces pinned seed/version and a fixed native macro snapshot",()=>{
    const first=generate();
    const again=generate();
    expect(first.generatorVersion).toBe(STUDIO_GENERATOR_VERSION);
    expect(first.seed).toBe(1729);
    expect(studioRecipeFingerprint(first)).toBe(studioRecipeFingerprint(again));
    expect(first.morphology.body["macro/age"]).toBe(.539901);
    expect(first.morphology.body["macro/height"]).toBe(.517711);
    expect(first.morphology.body["macro/weight"]).toBe(.480511);
    expect(first.morphology.body["macro/muscle"]).toBe(.700034);
    expect(first.morphology.body["macro/proportions"]).toBe(.546094);
    expect(first.selectedPresets).toEqual({body:"custom",face:"custom"});
    expect(Object.isFrozen(first.morphology.face)).toBe(true);
    // Repeating the same choices on an already generated character must not
    // drift unlocked appearance or anatomy.
    expect(studioRecipeFingerprint(generate(first))).toBe(studioRecipeFingerprint(first));
  });
  it("provides correlated, bounded profiles across seeds and variations",()=>{
    const unique=new Set<string>();
    for(const style of Object.keys(GENERATOR_STYLES) as GeneratorOptions["style"][]){
      for(const seed of [1,2,7,17,99,101,1729,32021,0xffffffff]){
        const recipe=generate(initialStudioRecipe(),choices({style,seed}));
        expect(()=>validateStudioRecipe(recipe)).not.toThrow();
        unique.add(studioRecipeFingerprint(recipe));
        for(const control of STUDIO_CONTROLS){
          const v=controlValue(recipe.morphology,control);
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(control.min);
          expect(v).toBeLessThanOrEqual(control.max);
        }
        expect(recipe.morphology.body["macro/age"]).toBeGreaterThanOrEqual(.31);
        expect(recipe.morphology.body["macro/age"]).toBeLessThanOrEqual(.69);
        expect(Object.keys(recipe.morphology.body).some(k=>k.startsWith("stress/"))).toBe(false);
      }
    }
    expect(unique.size).toBeGreaterThan(30);
    const subtle=generate(initialStudioRecipe(),choices({variation:0}));
    const distinct=generate(initialStudioRecipe(),choices({variation:1}));
    expect(studioRecipeFingerprint(subtle)).not.toBe(studioRecipeFingerprint(distinct));
  });
  it("preserves exact group locks and supports age-only, feature-specific locks",()=>{
    let previous=initialStudioRecipe();
    for(const [id,value] of [
      ["body:macro/age",.03],
      ["body:macro/height",.72],
      ["face:noseWidth",.7],
      ["shape:jawWidth",1.08],
    ] as const)previous=reduceStudioRecipe(previous,{type:"adjust",id,value});
    previous=reduceStudioRecipe(previous,{type:"appearance-tone",tone:"deep"});
    const locks=choices({seed:200,locks:{
      body:false,face:false,age:true,appearance:true,
      features:["body:macro/height","face:noseWidth","shape:jawWidth"],
    }});
    const result=generate(previous,locks);
    expect(result.morphology.body["macro/age"]).toBe(.03);
    expect(result.morphology.body["macro/height"]).toBe(.72);
    expect(result.morphology.face.noseWidth).toBe(.7);
    expect(result.morphology.shape.jawWidth).toBe(1.08);
    expect(result.appearance).toEqual(previous.appearance);
    expect(result.morphology.body["macro/muscle"]).toBeDefined();
    for(const [groupKey,group] of [["body","body"],["face","face"]] as const){
      const lock=choices({locks:{
        body:groupKey==="body",face:groupKey==="face",
        age:false,appearance:false,features:[],
      }});
      const next=generate(previous,lock);
      expect(next.morphology[group]).toEqual(previous.morphology[group]);
      if(groupKey==="body"){
        for(const control of STUDIO_CONTROLS.filter(x=>x.channel==="shape"&&x.category==="body"))
          expect(controlValue(next.morphology,control)).toBe(controlValue(previous.morphology,control));
      }else{
        for(const control of STUDIO_CONTROLS.filter(x=>x.channel==="shape"&&x.category==="face"))
          expect(controlValue(next.morphology,control)).toBe(controlValue(previous.morphology,control));
      }
    }
  });
  it("does not sample ancestry or sex from gameplay styles",()=>{
    let previous=initialStudioRecipe();
    previous=reduceStudioRecipe(previous,{type:"adjust",id:"body:macro/sex",value:.83});
    previous=reduceStudioRecipe(previous,{type:"adjust",id:"body:macro/asian",value:.7});
    for(const style of Object.keys(GENERATOR_STYLES) as GeneratorOptions["style"][]){
      const next=generate(previous,choices({style,seed:903}));
      for(const key of ["macro/sex","macro/asian","macro/african","macro/caucasian"])
        expect(next.morphology.body[key]).toBe(previous.morphology.body[key]);
    }
  });
  it("rejects invalid inputs without changing the editor's recipe",()=>{
    const initial=initialStudioRecipe();
    const invalid=[
      {seed:0},{seed:4294967296},{seed:NaN},{seed:2.2},
      {variation:Infinity},{variation:-.1},{variation:1.2},
      {style:"unsupported"},
      {locks:{body:false,face:false,age:false,appearance:false,
        features:["body:does-not-exist"]}},
      {locks:{body:false,face:false,age:false,appearance:false,
        features:["face:noseWidth","face:noseWidth"]}},
    ] as Partial<GeneratorOptions>[];
    const before=studioRecipeFingerprint(initial);
    for(const patch of invalid){
      const options=choices(patch);
      expect(()=>validateGeneratorOptions(options)).toThrow();
      expect(()=>generate(initial,options)).toThrow();
      expect(studioRecipeFingerprint(initial)).toBe(before);
    }
  });
  it("is one undoable command and remains editable after generation",()=>{
    const history=new StudioHistory();
    const options=choices({seed:42});
    expect(history.apply({type:"generate",options})).toBe(true);
    expect(history.status.length).toBe(2);
    expect(history.resolve(history.status.revision,true)).toBe(true);
    const generated=studioRecipeFingerprint(history.current);
    const difference=compareGeneratedCharacter(initialStudioRecipe(),history.current);
    expect(difference.body+difference.face).toBeGreaterThan(0);
    history.apply({type:"adjust",id:"face:noseWidth",value:.5});
    expect(history.undo()).toBe(true);
    expect(studioRecipeFingerprint(history.current)).toBe(generated);
    expect(history.undo()).toBe(true);
    expect(studioRecipeFingerprint(history.current))
      .toBe(studioRecipeFingerprint(initialStudioRecipe()));
    expect(history.redo()).toBe(true);
    expect(studioRecipeFingerprint(history.current)).toBe(generated);
    history.apply({type:"generate",options:choices({seed:92})});
    const stale=history.status.revision;
    history.undo();
    expect(history.resolve(stale,true)).toBe(false);
  });
});
