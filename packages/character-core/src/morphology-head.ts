import { createHumanLocalRecipe, validateHumanLocalMorphology,
  type HumanLocalMorphologyV1, DEFAULT_HUMAN_LOCAL_MORPHOLOGY } from "./morphology-local";
import { HumanMorphologyError } from "./morphology";
import { recipeFingerprint, validateCharacterRecipe } from "./validate";
import type { CharacterRecipeV1 } from "./schema";

/** C3.4 human-only head channels. A head family is NOT silently interchangeable
 * with a primate/avian/bear topology; those have separately reviewed generators. */
export const HUMAN_HEAD_GENERATOR_VERSION = "c3.4-human-head-v1" as const;
export interface HumanHeadMorphologyV1 extends HumanLocalMorphologyV1 {
  readonly skullWidth: number;
  readonly skullHeight: number;
  readonly forehead: number;
  readonly brow: number;
  readonly cheeks: number;
  readonly jawWidth: number;
  readonly chin: number;
  readonly faceDepth: number;
  readonly eyeSpacing: number;
}
export const DEFAULT_HUMAN_HEAD_MORPHOLOGY: Readonly<HumanHeadMorphologyV1> =
  Object.freeze({
    ...DEFAULT_HUMAN_LOCAL_MORPHOLOGY,
    skullWidth: 1, skullHeight: 1, forehead: 1, brow: 1,
    cheeks: 1, jawWidth: 1, chin: 1, faceDepth: 1, eyeSpacing: 1,
  });
export const HUMAN_HEAD_LIMITS = Object.freeze({
  skullWidth: [0.90, 1.10],
  skullHeight: [0.93, 1.07],
  forehead: [0.93, 1.07],
  brow: [0.92, 1.08],
  cheeks: [0.92, 1.08],
  jawWidth: [0.91, 1.09],
  chin: [0.92, 1.08],
  faceDepth: [0.94, 1.06],
  eyeSpacing: [0.95, 1.05],
} as const);
type HeadKey = keyof typeof HUMAN_HEAD_LIMITS;
const keys = Object.keys(HUMAN_HEAD_LIMITS) as HeadKey[];
const bodyKeys = [
  "stature", "breadth", "shoulders", "chest",
  "waist", "hips", "arms", "legs",
] as const;
const requiredKeys = [
  ...bodyKeys.map(key => "body." + key),
  ...keys.map(key => "head." + key),
].sort().join("|");

export function validateHumanHeadMorphology(shape: HumanHeadMorphologyV1): void {
  validateHumanLocalMorphology(shape);
  for (const key of keys) {
    const value = shape?.[key];
    const [min, max] = HUMAN_HEAD_LIMITS[key];
    if (!Number.isFinite(value) || value < min || value > max)
      throw new HumanMorphologyError("HEAD_RANGE",
        key + " must be finite and between " + min + " and " + max);
  }
}

export function createHumanHeadRecipe(
  shape: HumanHeadMorphologyV1 = DEFAULT_HUMAN_HEAD_MORPHOLOGY,
  seed = 1,
): CharacterRecipeV1 {
  validateHumanHeadMorphology(shape);
  const body = createHumanLocalRecipe(shape, seed);
  const parameters: Record<string, number> = {...body.parameters};
  for (const key of keys) parameters["head." + key] = shape[key];
  const recipe: CharacterRecipeV1 = {
    ...body, generatorVersion: HUMAN_HEAD_GENERATOR_VERSION,
    parameters,
  };
  validateHumanHeadRecipe(recipe);
  return recipe;
}

/** Exact-key, fail-closed schema: C1, C3.1/2 and foreign head families never
 * acquire C3.4 semantics through a generator-version fallthrough. */
export function validateHumanHeadRecipe(recipe: CharacterRecipeV1):
  Readonly<HumanHeadMorphologyV1> {
  validateCharacterRecipe(recipe);
  if (recipe.generatorVersion !== HUMAN_HEAD_GENERATOR_VERSION ||
      recipe.archetypeId !== "human" ||
      recipe.topologyFamilyId !== "humanoid_biped_v1" ||
      recipe.modules.length !== 0 ||
      Object.keys(recipe.parameters).sort().join("|") !== requiredKeys)
    throw new HumanMorphologyError("HEAD_RECIPE",
      "Unsupported C3.4 human head generator/topology/parameter schema");
  const values: Record<string, number> = {};
  for (const key of bodyKeys) values[key] = recipe.parameters["body." + key]!;
  for (const key of keys) values[key] = recipe.parameters["head." + key]!;
  const shape = values as unknown as HumanHeadMorphologyV1;
  validateHumanHeadMorphology(shape);
  return Object.freeze({...shape});
}

export function humanHeadMorphologyFingerprint(recipe: CharacterRecipeV1): string {
  validateHumanHeadRecipe(recipe);
  return recipeFingerprint(recipe);
}
