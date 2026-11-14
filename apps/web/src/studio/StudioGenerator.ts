import {FACIAL_CONTROLS} from "../characters/geometry/MakeHumanFacialTargets";
import {BODY_CONTROLS} from "../characters/geometry/MakeHumanBodyTargets";
import {
  STUDIO_CONTROLS,defaultStudioMorphState,controlValue,validateStudioMorphState,
  type StudioMorphState,
} from "./StudioMorphCatalog";
import {
  HUMAN_SKIN_TONES,SKIN_ROUGHNESS_RANGE,validateStudioAppearance,
  type SkinToneId,type StudioAppearanceV1,
} from "./StudioAppearance";
import type {StudioRecipeV1} from "./StudioRecipe";

/** The v1 profile algorithm has been replaced. No external recipe files exist
 * yet; version this change so in-memory histories remain unambiguous. */
export const STUDIO_GENERATOR_VERSION="studio-human-v2" as const;
export interface GeneratorResult {
  readonly seed:number;
  readonly morphology:StudioMorphState;
  readonly appearance:StudioAppearanceV1;
  readonly selectedPresets:StudioRecipeV1["selectedPresets"];
}

export function validateGeneratorSeed(seed:number):void{
  if(!Number.isSafeInteger(seed)||seed<1||seed>0xffffffff)
    throw new Error("Invalid random character seed");
}

/** Simple, reproducible random stream. The UI chooses fresh seed entropy;
 * given the same seed, this function must never use global randomness. */
function randomStream(seed:number):()=>number{
  let state=seed>>>0;
  return ()=>{
    state=(state+0x6d2b79f5)>>>0;
    let t=Math.imul(state^(state>>>15),1|state);
    t^=t+Math.imul(t^(t>>>7),61|t);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
const round=(v:number)=>Number(v.toFixed(6));
function between(next:()=>number,min:number,max:number):number{
  return round(min+(max-min)*next());
}

/**
 * Randomize across the real MakeHuman control ranges, not a narrow collection
 * of role-based presets. Every shape channel is sampled independently and
 * every primary structural facial modifier gets its own full-strength draw.
 *
 * A native modifier is included at random rather than layering *all* native
 * targets in one mesh, which would stack many overlapping deformations.
 * Temporary facial expressions and unsupported stress extrapolation are not
 * part of permanent anatomical randomization.
 */
export function generateStudioCharacter(seed:number):GeneratorResult{
  validateGeneratorSeed(seed);
  const next=randomStream(seed);
  const anatomy=defaultStudioMorphState();
  const body:Record<string,number>={};
  const face:Record<string,number>={};
  const shape:Record<string,number>={...anatomy.shape};

  for(const control of STUDIO_CONTROLS){
    if(control.channel==="shape"){
      shape[control.id.slice(6)]=between(next,control.min,control.max);
    }
  }

  // Every supported macro is sampled over its *entire* range. Independent
  // ancestry inputs are normalized to satisfy the source's sum-to-one contract.
  const macros=BODY_CONTROLS.filter(c=>
    c.id.startsWith("macro/")&&!/macro\/(african|asian|caucasian)/.test(c.id));
  for(const control of macros)
    body[control.id]=between(next,control.nativeMin,control.nativeMax);

  const ancestry=[next(),next(),next()];
  const total=ancestry[0]!+ancestry[1]!+ancestry[2]!;
  const first=round(ancestry[0]!/total);
  const second=round(ancestry[1]!/total);
  body["macro/african"]=first;
  body["macro/asian"]=second;
  body["macro/caucasian"]=1-first-second;

  // Native body targets are independent. Sample a random subset on each
  // generation instead of always applying the same shoulders/arms/hips recipe.
  for(const control of BODY_CONTROLS){
    if(!control.id.startsWith("native/")||next()>=.19)continue;
    body[control.id]=between(next,control.nativeMin,control.nativeMax);
  }

  // Structural controls deform recognizable parts of the actual face.
  // Exclude temporary expressions/pose units (blinks, smiles, jaw opening);
  // those remain in the dedicated Pose preview. Draw every structural control
  // independently over the original native MakeHuman -1..1 (or 0..1) range.
  for(const control of FACIAL_CONTROLS){
    if(control.positive.startsWith("expression/")||
       control.positive.startsWith("asym/"))continue;
    const studio=STUDIO_CONTROLS.find(c=>c.id==="face:"+control.id);
    if(!studio)throw new Error("Missing facial source control: "+control.id);
    const minimum=Math.max(studio.min,-1);
    const maximum=Math.min(studio.max,1);
    face[control.id]=between(next,minimum,maximum);
  }

  const morphology:StudioMorphState={body,face,
    shape:shape as unknown as StudioMorphState["shape"]};
  validateStudioMorphState(morphology);
  const tones=Object.keys(HUMAN_SKIN_TONES) as SkinToneId[];
  const appearance:StudioAppearanceV1={
    tone:tones[Math.floor(next()*tones.length)]!,
    roughness:between(next,SKIN_ROUGHNESS_RANGE.min,SKIN_ROUGHNESS_RANGE.max),
  };
  validateStudioAppearance(appearance);
  return {seed,morphology,appearance,selectedPresets:{body:"custom",face:"custom"}};
}

export interface GeneratorDifference {
  readonly body:number;
  readonly face:number;
  readonly appearance:number;
  readonly examples:readonly string[];
}
export function compareGeneratedCharacter(before:StudioRecipeV1,
  after:StudioRecipeV1):GeneratorDifference {
  let body=0,face=0;
  const examples:string[]=[];
  for(const control of STUDIO_CONTROLS){
    const previous=controlValue(before.morphology,control);
    const current=controlValue(after.morphology,control);
    if(Math.abs(previous-current)<1e-6)continue;
    if(control.category==="body")body++;else face++;
    if(examples.length<4)examples.push(control.label);
  }
  const appearance=Number(before.appearance.tone!==after.appearance.tone)+
    Number(before.appearance.roughness!==after.appearance.roughness);
  return {body,face,appearance,examples};
}
