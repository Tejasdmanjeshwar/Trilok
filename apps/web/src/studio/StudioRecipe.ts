import {
  defaultStudioMorphState, resetStudioSection, STUDIO_PRESETS,
  validateStudioMorphState, withStudioControl, withStudioPreset,
  type StudioMorphState, type StudioSection,
} from "./StudioMorphCatalog";

/** Internal ephemeral character recipe, not a portable file format.
 * Camera/inspector selection are deliberately not part of anatomy history. */
export interface StudioRecipeV1 {
  readonly schemaVersion:1;
  readonly archetypeId:"human";
  readonly topologyFamilyId:"humanoid_biped_v1";
  readonly generatorVersion:"studio-human-v1";
  readonly seed:number;
  readonly morphology:StudioMorphState;
  readonly selectedPresets:Readonly<Record<StudioSection,string>>;
}
export type StudioEditCommand =
  | Readonly<{type:"adjust";id:string;value:number}>
  | Readonly<{type:"preset";section:StudioSection;preset:string}>
  | Readonly<{type:"reset-section";section:StudioSection}>
  | Readonly<{type:"reset-all"}>;

const exactKeys=(value:unknown,keys:readonly string[]):boolean=>
  !!value&&typeof value==="object"&&!Array.isArray(value)&&
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");

export function validateStudioRecipe(recipe:StudioRecipeV1):void {
  if(!exactKeys(recipe,["schemaVersion","archetypeId","topologyFamilyId",
    "generatorVersion","seed","morphology","selectedPresets"])||
    recipe.schemaVersion!==1||recipe.archetypeId!=="human"||
    recipe.topologyFamilyId!=="humanoid_biped_v1"||
    recipe.generatorVersion!=="studio-human-v1"||
    !Number.isSafeInteger(recipe.seed)||recipe.seed<1||recipe.seed>0xffffffff||
    !exactKeys(recipe.selectedPresets,["body","face"])||
    !exactKeys(recipe.morphology,["body","face","shape"]))
    throw new Error("Invalid in-memory character definition");
  for(const section of ["body","face"] as const){
    const preset=recipe.selectedPresets[section];
    if(preset!=="custom"&&!STUDIO_PRESETS[section].some(p=>p.id===preset))
      throw new Error("Unknown character style");
  }
  validateStudioMorphState(recipe.morphology);
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
  });
}
export function initialStudioRecipe():StudioRecipeV1 {
  return freezeRecipe({
    schemaVersion:1,archetypeId:"human",topologyFamilyId:"humanoid_biped_v1",
    generatorVersion:"studio-human-v1",seed:1,
    morphology:defaultStudioMorphState(),
    selectedPresets:{body:"neutral",face:"neutral"},
  });
}
/** Pure command reducer: only source-catalog validators may accept a mutation. */
export function reduceStudioRecipe(recipe:StudioRecipeV1,
  command:StudioEditCommand):StudioRecipeV1 {
  validateStudioRecipe(recipe);
  if(command.type==="reset-all")return initialStudioRecipe();
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
    const section=command.id.startsWith("face:")?"face":
      command.id.startsWith("body:")?"body":
      command.id.startsWith("shape:")?undefined:undefined;
    const target=section??(
      // Local/head shape has no cross-category side effects.
      ["skullWidth","skullHeight","forehead","brow","cheeks","jawWidth",
       "chin","faceDepth","eyeSpacing"].includes(command.id.slice(6))
        ?"face":"body"
    );
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
    sorted(recipe.morphology.shape),recipe.selectedPresets.body,
    recipe.selectedPresets.face]);
}
