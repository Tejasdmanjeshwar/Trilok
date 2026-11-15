import {describe,it,expect} from "vitest";
import {initialStudioRecipe,reduceStudioRecipe,studioRecipeFingerprint,
  validateStudioRecipe} from "../apps/web/src/studio/StudioRecipe";
import {StudioHistory} from "../apps/web/src/studio/StudioHistory";
import {STUDIO_CONTROLS,controlValue} from "../apps/web/src/studio/StudioMorphCatalog";
import {FACIAL_CONTROLS} from "../apps/web/src/characters/geometry/MakeHumanFacialTargets";
import {STUDIO_GENERATOR_VERSION,generateStudioCharacter,
  compareGeneratedCharacter,validateGeneratorSeed,parseStudioGeneratorSeed}
  from "../apps/web/src/studio/StudioGenerator";

const generated=(seed:number)=>reduceStudioRecipe(initialStudioRecipe(),{
  type:"generate",seed,
});
describe("One-click random human character generator",()=>{
  it("parses manual seed exactly without truncation or notation surprises",()=>{
    expect(parseStudioGeneratorSeed("2694905601")).toBe(2694905601);
    expect(parseStudioGeneratorSeed(" 2694905601 ")).toBe(2694905601);
    expect(parseStudioGeneratorSeed("4294967295")).toBe(4294967295);
    for(const seed of [""," ","0","4294967296","-1","+1","1.5",
      "1e3","0x10","NaN","Infinity","1 2"]){
      expect(()=>parseStudioGeneratorSeed(seed),seed).toThrow();
    }
    const first=generated(parseStudioGeneratorSeed("2694905601"));
    const second=generated(parseStudioGeneratorSeed("2694905601"));
    expect(studioRecipeFingerprint(first)).toBe(studioRecipeFingerprint(second));
    expect(first.seed).toBe(2694905601);
  });

  it("uses one deterministic, versioned seed and immutable edit history",()=>{
    const first=generated(1729);
    expect(first.generatorVersion).toBe(STUDIO_GENERATOR_VERSION);
    expect(first.seed).toBe(1729);
    expect(studioRecipeFingerprint(generated(1729)))
      .toBe(studioRecipeFingerprint(first));
    expect(Object.isFrozen(first.morphology.face)).toBe(true);
    const again=reduceStudioRecipe(first,{type:"generate",seed:1729});
    expect(studioRecipeFingerprint(first)).toBe(studioRecipeFingerprint(again));
  });
  it("visibly varies face, body build, proportions and appearance across seeds",()=>{
    const initial=initialStudioRecipe();
    const unique=new Set<string>();
    const colors=new Set<string>();
    const ages=new Set<number>();
    const heights=new Set<number>();
    const noses=new Set<number>();
    const faces=new Set<string>();
    for(let seed=1;seed<=32;seed++){
      const recipe=generated(seed);
      expect(()=>validateStudioRecipe(recipe)).not.toThrow();
      unique.add(studioRecipeFingerprint(recipe));
      colors.add(recipe.appearance.tone);
      ages.add(recipe.morphology.body["macro/age"]!);
      heights.add(recipe.morphology.body["macro/height"]!);
      noses.add(recipe.morphology.face.noseWidth!);
      faces.add(JSON.stringify(recipe.morphology.face));
      const difference=compareGeneratedCharacter(initial,recipe);
      expect(difference.face).toBeGreaterThanOrEqual(16);
      expect(difference.body).toBeGreaterThanOrEqual(10);
      for(const control of STUDIO_CONTROLS){
        const value=controlValue(recipe.morphology,control);
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(control.min);
        expect(value).toBeLessThanOrEqual(control.max);
      }
      expect(recipe.morphology.body["stress/gain"]).toBeUndefined();
    }
    expect(unique.size).toBe(32);
    expect(colors.size).toBeGreaterThanOrEqual(5);
    expect(ages.size).toBe(32);
    expect(heights.size).toBe(32);
    expect(noses.size).toBe(32);
    expect(faces.size).toBe(32);
  });
  it("randomizes structural facial controls over native range, not expression previews",()=>{
    const results=Array.from({length:100},(_,i)=>generated(i+1));
    for(const control of FACIAL_CONTROLS){
      if(control.positive.startsWith("expression/")||
         control.positive.startsWith("asym/"))continue;
      const values=results.map(r=>r.morphology.face[control.id]!);
      expect(values.every(Number.isFinite)).toBe(true);
      expect(Math.max(...values)-Math.min(...values)).toBeGreaterThan(.6);
    }
    for(const r of results){
      expect(r.morphology.face.mouthOpen).toBeUndefined();
      expect(r.morphology.face.smile).toBeUndefined();
      expect(r.morphology.face.leftLid).toBeUndefined();
    }
  });
  it("respects ancestry normalization even while changing the underlying values",()=>{
    for(let seed=1;seed<=80;seed++){
      const w=generated(seed).morphology.body;
      const values=["african","asian","caucasian"].map(k=>w["macro/"+k]!);
      expect(values.reduce((a,v)=>a+v,0)).toBeCloseTo(1,7);
      expect(values.every(v=>v>=0&&v<=1)).toBe(true);
    }
  });
  it("rejects invalid seed and preserves one-step undo/redo plus manual editing",()=>{
    for(const seed of [0,NaN,1.2,-1,4294967296]){
      expect(()=>validateGeneratorSeed(seed)).toThrow();
      expect(()=>generated(seed)).toThrow();
    }
    const history=new StudioHistory();
    history.apply({type:"generate",seed:1729});
    expect(history.status.length).toBe(2);
    expect(history.resolve(history.status.revision,true)).toBe(true);
    const result=studioRecipeFingerprint(history.current);
    history.apply({type:"adjust",id:"face:noseWidth",value:.5});
    expect(history.undo()).toBe(true);
    expect(studioRecipeFingerprint(history.current)).toBe(result);
    expect(history.undo()).toBe(true);
    expect(studioRecipeFingerprint(history.current))
      .toBe(studioRecipeFingerprint(initialStudioRecipe()));
    expect(history.redo()).toBe(true);
    expect(studioRecipeFingerprint(history.current)).toBe(result);
  });
});
