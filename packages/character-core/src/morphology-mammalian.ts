import {createHumanHeadRecipe, validateHumanHeadMorphology,
  type HumanHeadMorphologyV1, DEFAULT_HUMAN_HEAD_MORPHOLOGY} from "./morphology-head";
import {HumanMorphologyError} from "./morphology";
import {recipeFingerprint, validateCharacterRecipe} from "./validate";
import type {CharacterRecipeV1} from "./schema";

/** C3.5 family-specific shape generators, not a C1 anatomy schema revision.
 * Both families have the C1 animal_head graph and its existing head family ID. */
export type MammalianHeadFamilyV1 = "primate" | "bear";
export const MAMMAL_HEAD_GENERATORS = Object.freeze({
  primate: "c3.5-primate-head-v1",
  bear: "c3.5-bear-head-v1",
} as const);
export const MAMMAL_HEAD_TOPOLOGY_FAMILIES = Object.freeze({
  primate: "head_primate_v1",
  bear: "head_bear_v1",
} as const);

/** Dimensionless adjustments around the species-specific source-derived
 * cranial and muzzle profile (1.0 = calibrated family default, NOT human). */
export interface MammalianHeadMorphologyV1 extends HumanHeadMorphologyV1 {
  readonly muzzleLength: number;
  readonly muzzleWidth: number;
  readonly muzzleHeight: number;
  readonly earSize: number;
  readonly browMass: number;
  readonly jawMass: number;
}
export const DEFAULT_MAMMALIAN_HEAD_MORPHOLOGY:
  Readonly<MammalianHeadMorphologyV1> = Object.freeze({
    ...DEFAULT_HUMAN_HEAD_MORPHOLOGY,
    muzzleLength: 1, muzzleWidth: 1, muzzleHeight: 1,
    earSize: 1, browMass: 1, jawMass: 1,
  });
const bounds = Object.freeze({
  muzzleLength: [0.85, 1.15],
  muzzleWidth: [0.88, 1.12],
  muzzleHeight: [0.90, 1.10],
  earSize: [0.85, 1.15],
  browMass: [0.88, 1.12],
  jawMass: [0.88, 1.12],
} as const);
type MammalKey = keyof typeof bounds;
const keys = Object.keys(bounds) as MammalKey[];
const bodyKeys = ["stature","breadth","shoulders","chest","waist",
  "hips","arms","legs"] as const;
const humanKeys = ["skullWidth","skullHeight","forehead","brow","cheeks",
  "jawWidth","chin","faceDepth","eyeSpacing"] as const;
const required = [...bodyKeys.map(k=>"body."+k),...humanKeys.map(k=>"head."+k),
  ...keys.map(k=>"mammal."+k)].sort().join("|");

export function validateMammalianHeadMorphology(shape:MammalianHeadMorphologyV1):void{
  validateHumanHeadMorphology(shape);
  for (const key of keys) {
    const v=shape?.[key];
    const [min,max]=bounds[key];
    if(!Number.isFinite(v)||v<min||v>max)
      throw new HumanMorphologyError("MAMMAL_RANGE",
        key+" must be finite and between "+min+" and "+max);
  }
}
export function createMammalianHeadRecipe(family:MammalianHeadFamilyV1,
  shape:MammalianHeadMorphologyV1=DEFAULT_MAMMALIAN_HEAD_MORPHOLOGY,
  seed=1):CharacterRecipeV1 {
  if(family!=="primate"&&family!=="bear")
    throw new HumanMorphologyError("MAMMAL_FAMILY","Unsupported mammalian head family");
  validateMammalianHeadMorphology(shape);
  const base=createHumanHeadRecipe(shape,seed);
  const parameters:Record<string,number>={...base.parameters};
  for(const key of keys)parameters["mammal."+key]=shape[key];
  const recipe:CharacterRecipeV1={
    ...base,archetypeId:"animal_head",generatorVersion:MAMMAL_HEAD_GENERATORS[family],
    parameters,
  };
  validateMammalianHeadRecipe(recipe);
  return recipe;
}
export interface ValidMammalianHeadRecipeV1 {
  readonly family:MammalianHeadFamilyV1;
  readonly shape:Readonly<MammalianHeadMorphologyV1>;
}
/** Reject unknown strings, old recipe versions, nonhuman topology and extra
 * parameters before any geometry or rig mutation. */
export function validateMammalianHeadRecipe(recipe:CharacterRecipeV1):
  ValidMammalianHeadRecipeV1 {
  validateCharacterRecipe(recipe);
  const family=(Object.keys(MAMMAL_HEAD_GENERATORS) as MammalianHeadFamilyV1[])
    .find(k=>MAMMAL_HEAD_GENERATORS[k]===recipe.generatorVersion);
  if(!family||recipe.archetypeId!=="animal_head"||
    recipe.topologyFamilyId!=="humanoid_biped_v1"||
    recipe.modules.length!==0||
    Object.keys(recipe.parameters).sort().join("|")!==required)
    throw new HumanMorphologyError("MAMMAL_RECIPE",
      "Unsupported C3.5 head recipe generator, topology or parameters");
  const p=recipe.parameters,values:Record<string,number>={};
  for(const key of bodyKeys)values[key]=p["body."+key]!;
  for(const key of humanKeys)values[key]=p["head."+key]!;
  for(const key of keys)values[key]=p["mammal."+key]!;
  const shape=values as unknown as MammalianHeadMorphologyV1;
  validateMammalianHeadMorphology(shape);
  return Object.freeze({family,shape:Object.freeze({...shape})});
}
export function mammalianHeadFingerprint(recipe:CharacterRecipeV1):string {
  validateMammalianHeadRecipe(recipe);
  return recipeFingerprint(recipe);
}
