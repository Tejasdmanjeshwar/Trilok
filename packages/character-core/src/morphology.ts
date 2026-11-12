import { recipeFingerprint, validateCharacterRecipe } from "./validate";
import { createCharacterRecipe } from "./presets";
import type { CharacterRecipeV1 } from "./schema";

/** C3.1: isolated human body proportions; neither C1 nor combat defaults change. */
export const HUMAN_MORPHOLOGY_GENERATOR_VERSION = "c3.1-human-proportions-v1" as const;
export interface HumanMorphologyV1 {
  /** Longitudinal anthropometric change, applied to the rest mesh and bind joints. */
  readonly stature: number;
  /** Symmetric lateral/depth change, not an Object3D or root scale. */
  readonly breadth: number;
}
const limits = {
  stature: [0.92, 1.08],
  breadth: [0.90, 1.10],
} as const;

export class HumanMorphologyError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "HumanMorphologyError";
  }
}
export function validateHumanMorphology(value: HumanMorphologyV1): void {
  for (const key of ["stature", "breadth"] as const) {
    const n = value?.[key];
    const [low, high] = limits[key];
    if (!Number.isFinite(n) || n < low || n > high)
      throw new HumanMorphologyError("RANGE", key + " must be between " + low + " and " + high);
  }
}
export function createHumanMorphologyRecipe(
  value: HumanMorphologyV1 = {stature: 1, breadth: 1},
  seed = 1,
): CharacterRecipeV1 {
  validateHumanMorphology(value);
  const base = createCharacterRecipe("human", seed);
  const recipe: CharacterRecipeV1 = {
    ...base,
    generatorVersion: HUMAN_MORPHOLOGY_GENERATOR_VERSION,
    parameters: {"body.stature": value.stature, "body.breadth": value.breadth},
  };
  validateHumanMorphologyRecipe(recipe);
  return recipe;
}
/** Fail closed: C1 recipes are valid contracts, but not implicitly C3 morph requests. */
export function validateHumanMorphologyRecipe(recipe: CharacterRecipeV1): HumanMorphologyV1 {
  validateCharacterRecipe(recipe);
  if (recipe.generatorVersion !== HUMAN_MORPHOLOGY_GENERATOR_VERSION ||
      recipe.archetypeId !== "human" ||
      recipe.topologyFamilyId !== "humanoid_biped_v1" ||
      recipe.modules.length !== 0 ||
      Object.keys(recipe.parameters).sort().join("|") !== "body.breadth|body.stature")
    throw new HumanMorphologyError("RECIPE", "Unsupported C3.1 morphology recipe/family");
  const value: HumanMorphologyV1 = {
    stature: recipe.parameters["body.stature"]!,
    breadth: recipe.parameters["body.breadth"]!,
  };
  validateHumanMorphology(value);
  return Object.freeze(value);
}
export function humanMorphologyFingerprint(recipe: CharacterRecipeV1): string {
  validateHumanMorphologyRecipe(recipe);
  return recipeFingerprint(recipe);
}
