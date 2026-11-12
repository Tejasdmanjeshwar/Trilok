import { recipeFingerprint, validateCharacterRecipe } from "./validate";
import { createHumanMorphologyRecipe, validateHumanMorphology,
  type HumanMorphologyV1, HumanMorphologyError } from "./morphology";
import type { CharacterRecipeV1 } from "./schema";

/** C3.2 is opt-in. Older C1/C3.1 recipes remain unchanged and valid. */
export const HUMAN_LOCAL_GENERATOR_VERSION = "c3.2-local-anatomy-v1" as const;
export interface HumanLocalMorphologyV1 extends HumanMorphologyV1 {
  readonly shoulders: number;
  readonly chest: number;
  readonly waist: number;
  readonly hips: number;
  readonly arms: number;
  readonly legs: number;
}
export const DEFAULT_HUMAN_LOCAL_MORPHOLOGY: Readonly<HumanLocalMorphologyV1> =
  Object.freeze({
    stature: 1, breadth: 1, shoulders: 1, chest: 1,
    waist: 1, hips: 1, arms: 1, legs: 1,
  });

const localLimits = {
  shoulders: [0.90, 1.10],
  chest: [0.90, 1.10],
  waist: [0.90, 1.10],
  hips: [0.90, 1.10],
  arms: [0.94, 1.06],
  legs: [0.94, 1.06],
} as const;
const parameterKeys = [
  "body.stature", "body.breadth", "body.shoulders", "body.chest",
  "body.waist", "body.hips", "body.arms", "body.legs",
] as const;

export function validateHumanLocalMorphology(
  value: HumanLocalMorphologyV1,
): void {
  validateHumanMorphology(value);
  for (const key of Object.keys(localLimits) as (keyof typeof localLimits)[]) {
    const n = value?.[key];
    const [min, max] = localLimits[key];
    if (!Number.isFinite(n) || n < min || n > max)
      throw new HumanMorphologyError("LOCAL_RANGE",
        key + " must be finite and between " + min + " and " + max);
  }
}
export function createHumanLocalRecipe(
  shape: HumanLocalMorphologyV1 = DEFAULT_HUMAN_LOCAL_MORPHOLOGY,
  seed = 1,
): CharacterRecipeV1 {
  validateHumanLocalMorphology(shape);
  const base = createHumanMorphologyRecipe(
    {stature: shape.stature, breadth: shape.breadth}, seed);
  const recipe: CharacterRecipeV1 = {
    ...base, generatorVersion: HUMAN_LOCAL_GENERATOR_VERSION,
    parameters: {
      "body.stature": shape.stature, "body.breadth": shape.breadth,
      "body.shoulders": shape.shoulders, "body.chest": shape.chest,
      "body.waist": shape.waist, "body.hips": shape.hips,
      "body.arms": shape.arms, "body.legs": shape.legs,
    },
  };
  validateHumanLocalRecipe(recipe);
  return recipe;
}
export function validateHumanLocalRecipe(
  recipe: CharacterRecipeV1,
): Readonly<HumanLocalMorphologyV1> {
  validateCharacterRecipe(recipe);
  if (recipe.generatorVersion !== HUMAN_LOCAL_GENERATOR_VERSION ||
      recipe.archetypeId !== "human" ||
      recipe.topologyFamilyId !== "humanoid_biped_v1" ||
      recipe.modules.length !== 0 ||
      Object.keys(recipe.parameters).sort().join("|") !==
        [...parameterKeys].sort().join("|"))
    throw new HumanMorphologyError("LOCAL_RECIPE",
      "Unsupported C3.2 generator, anatomy family or parameter schema");
  const p = recipe.parameters;
  const shape: HumanLocalMorphologyV1 = {
    stature: p["body.stature"]!, breadth: p["body.breadth"]!,
    shoulders: p["body.shoulders"]!, chest: p["body.chest"]!,
    waist: p["body.waist"]!, hips: p["body.hips"]!,
    arms: p["body.arms"]!, legs: p["body.legs"]!,
  };
  validateHumanLocalMorphology(shape);
  return Object.freeze(shape);
}
export function humanLocalMorphologyFingerprint(recipe: CharacterRecipeV1): string {
  validateHumanLocalRecipe(recipe);
  return recipeFingerprint(recipe);
}
