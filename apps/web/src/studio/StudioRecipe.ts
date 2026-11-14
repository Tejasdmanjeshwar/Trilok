import {generateStudioCharacter,validateGeneratorSeed,
  STUDIO_GENERATOR_VERSION} from "./StudioGenerator";
import {DEFAULT_STUDIO_APPEARANCE,validateStudioAppearance,withSkinTone,withSkinRoughness,withFinishPreset,type StudioAppearanceV1,type SkinToneId,type FinishPresetId} from "./StudioAppearance";
import { DEFAULT_HUMAN_HEAD_MORPHOLOGY } from "@trilok/character-core";
import {
  defaultStudioMorphState, resetStudioSection, STUDIO_PRESETS,
  STUDIO_CONTROL_BY_ID,
  validateStudioMorphState, withStudioControl, withStudioPreset,
  type StudioMorphState, type StudioSection,
} from "./StudioMorphCatalog";

/** Internal ephemeral character recipe, not a portable file format.
 * Camera/inspector selection are deliberately not part of anatomy history. */
export interface StudioRecipeV1 {
  readonly schemaVersion:1;
  readonly archetypeId:"human";
  readonly topologyFamilyId:"humanoid_biped_v1";
  readonly generatorVersion:typeof STUDIO_GENERATOR_VERSION;
  readonly seed:number;
  readonly morphology:StudioMorphState;
  readonly appearance:StudioAppearanceV1;
  readonly selectedPresets:Readonly<Record<StudioSection,string>>;
}
export type StudioEditCommand =
  | Readonly<{type:"adjust";id:string;value:number}>
  | Readonly<{type:"preset";section:StudioSection;preset:string}>
  | Readonly<{type:"reset-section";section:StudioSection}>
  | Readonly<{type:"reset-all"}>
  | Readonly<{type:"appearance-tone";tone:SkinToneId}>
  | Readonly<{type:"appearance-roughness";roughness:number}>
  | Readonly<{type:"appearance-finish";preset:FinishPresetId}>
  | Readonly<{type:"reset-appearance"}>
  | Readonly<{type:"generate";seed:number}>;

const exactKeys=(value:unknown,keys:readonly string[]):boolean=>
  !!value&&typeof value==="object"&&!Array.isArray(value)&&
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");

export function validateStudioRecipe(recipe:StudioRecipeV1):void {
  if(!exactKeys(recipe,["schemaVersion","archetypeId","topologyFamilyId",
    "generatorVersion","seed","morphology","appearance","selectedPresets"])||
    recipe.schemaVersion!==1||recipe.archetypeId!=="human"||
    recipe.topologyFamilyId!=="humanoid_biped_v1"||
    recipe.generatorVersion!==STUDIO_GENERATOR_VERSION||
    !Number.isSafeInteger(recipe.seed)||recipe.seed<1||recipe.seed>0xffffffff||
    !exactKeys(recipe.selectedPresets,["body","face"])||
    !exactKeys(recipe.morphology,["body","face","shape"])||
    !exactKeys(recipe.morphology.shape,Object.keys(DEFAULT_HUMAN_HEAD_MORPHOLOGY)))
    throw new Error("Invalid in-memory character definition");
  for(const section of ["body","face"] as const){
    const preset=recipe.selectedPresets[section];
    if(preset!=="custom"&&!STUDIO_PRESETS[section].some(p=>p.id===preset))
      throw new Error("Unknown character style");
  }
  validateStudioMorphState(recipe.morphology);
  validateStudioAppearance(recipe.appearance);
}
function freezeRecipe(recipe:StudioRecipeV1):StudioRecipeV1 {
  validateStudioRecipe(recipe);
  return Object.freeze({
    ...recipe,
    morphology:Object.freeze({
      body:Object.freeze({...recipe.morphology.body}),
      face:Object.freeze({...recipe.morphology.face}),
      shape:Object.freeze({...recipe.morphology.shape}),
    }),
    selectedPresets:Object.freeze({...recipe.selectedPresets}),
    appearance:Object.freeze({...recipe.appearance}),
  });
}
export function initialStudioRecipe():StudioRecipeV1 {
  return freezeRecipe({
    schemaVersion:1,archetypeId:"human",topologyFamilyId:"humanoid_biped_v1",
    generatorVersion:STUDIO_GENERATOR_VERSION,seed:1,
    morphology:defaultStudioMorphState(),
    appearance:DEFAULT_STUDIO_APPEARANCE,
    selectedPresets:{body:"neutral",face:"neutral"},
  });
}
/** Pure command reducer: only source-catalog validators may accept a mutation. */
export function reduceStudioRecipe(recipe:StudioRecipeV1,
  command:StudioEditCommand):StudioRecipeV1 {
  validateStudioRecipe(recipe);
  if(command.type==="reset-all")return initialStudioRecipe();
  if(command.type==="generate"){
    validateGeneratorSeed(command.seed);
    const result=generateStudioCharacter(command.seed);
    return freezeRecipe({
      ...recipe,...result,
      generatorVersion:STUDIO_GENERATOR_VERSION,
    });
  }
  if(command.type==="reset-appearance")return freezeRecipe({...recipe,appearance:DEFAULT_STUDIO_APPEARANCE});
  if(command.type==="appearance-tone")return freezeRecipe({...recipe,appearance:withSkinTone(recipe.appearance,command.tone)});
  if(command.type==="appearance-roughness")return freezeRecipe({...recipe,appearance:withSkinRoughness(recipe.appearance,command.roughness)});
  if(command.type==="appearance-finish")return freezeRecipe({...recipe,appearance:withFinishPreset(recipe.appearance,command.preset)});
  if(command.type==="reset-section"){
    const section=command.section;
    if(section!=="body"&&section!=="face")throw new Error("Unknown character section");
    return freezeRecipe({
      ...recipe,morphology:resetStudioSection(recipe.morphology,section),
      selectedPresets:{...recipe.selectedPresets,[section]:"neutral"},
    });
  }
  if(command.type==="preset"){
    const {section,preset}=command;
    if(section!=="body"&&section!=="face")throw new Error("Unknown character section");
    return freezeRecipe({
      ...recipe,morphology:withStudioPreset(recipe.morphology,section,preset),
      selectedPresets:{...recipe.selectedPresets,[section]:preset},
    });
  }
  if(command.type==="adjust"){
    const target=STUDIO_CONTROL_BY_ID.get(command.id)?.category;
    if(!target)throw new Error("Unknown character feature");
    return freezeRecipe({
      ...recipe,morphology:withStudioControl(recipe.morphology,command.id,command.value),
      selectedPresets:{...recipe.selectedPresets,[target]:"custom"},
    });
  }
  throw new Error("Unknown character edit");
}
/** Fingerprints are stable even if source-channel records were populated in a
 * different insertion order. Used only in memory for equality/determinism. */
export function studioRecipeFingerprint(recipe:StudioRecipeV1):string {
  validateStudioRecipe(recipe);
  const sorted=(record:Readonly<Record<string,number>>)=>
    Object.entries(record).sort(([a],[b])=>a.localeCompare(b));
  return JSON.stringify([recipe.schemaVersion,recipe.archetypeId,
    recipe.topologyFamilyId,recipe.generatorVersion,recipe.seed,
    sorted(recipe.morphology.body),sorted(recipe.morphology.face),
    sorted(recipe.morphology.shape),recipe.appearance.tone,
    recipe.appearance.roughness,recipe.selectedPresets.body,
    recipe.selectedPresets.face]);
}
