/**
 * The current CC0 human has one owned standard skin material and no textures,
 * hair or garment assets. These descriptors only expose real material knobs.
 * Shades are illustrative palette values, not demographic classifications.
 */
export const HUMAN_SKIN_TONES={
  porcelain:{label:"Porcelain",hex:0xf1ccb8},
  light:{label:"Light",hex:0xe2b99f},
  neutral:{label:"Natural",hex:0xc7a38b},
  golden:{label:"Golden",hex:0xc09470},
  olive:{label:"Olive",hex:0x9d775d},
  amber:{label:"Amber",hex:0x98694e},
  deep:{label:"Deep",hex:0x75503d},
  rich:{label:"Rich",hex:0x53372d},
} as const;
export type SkinToneId=keyof typeof HUMAN_SKIN_TONES;
export interface StudioAppearanceV1 {
  readonly tone:SkinToneId;
  /** Physically meaningful Three.js MeshStandardMaterial roughness. */
  readonly roughness:number;
}
export const SKIN_ROUGHNESS_RANGE=Object.freeze({min:.48,max:.95,step:.01});
export const FINISH_PRESETS={
  matte:{label:"Matte",roughness:.9},
  natural:{label:"Natural",roughness:.74},
  satin:{label:"Soft sheen",roughness:.53},
} as const;
export type FinishPresetId=keyof typeof FINISH_PRESETS;
export const DEFAULT_STUDIO_APPEARANCE:Readonly<StudioAppearanceV1>=
  Object.freeze({tone:"neutral",roughness:FINISH_PRESETS.natural.roughness});

export type AppearanceControlDescriptor =
  | Readonly<{id:"tone";label:string;kind:"swatches";
    values:readonly SkinToneId[]}>
  | Readonly<{id:"roughness";label:string;kind:"range";
    min:number;max:number;step:number}>;

export const STUDIO_APPEARANCE_CONTROLS:readonly AppearanceControlDescriptor[]=
  Object.freeze([
    {id:"tone",label:"Skin tone",kind:"swatches",
      values:Object.keys(HUMAN_SKIN_TONES) as SkinToneId[]},
    {id:"roughness",label:"Surface finish",kind:"range",...SKIN_ROUGHNESS_RANGE},
  ]);

export function validateStudioAppearance(value:StudioAppearanceV1):void{
  if(!value||typeof value!=="object"||
    Object.keys(value).sort().join("|")!=="roughness|tone"||
    !Object.prototype.hasOwnProperty.call(HUMAN_SKIN_TONES,value.tone)||
    !Number.isFinite(value.roughness)||
    value.roughness<SKIN_ROUGHNESS_RANGE.min||
    value.roughness>SKIN_ROUGHNESS_RANGE.max)
    throw new Error("Invalid skin appearance");
}
export function withSkinTone(value:StudioAppearanceV1,tone:SkinToneId):StudioAppearanceV1{
  const next={...value,tone};
  validateStudioAppearance(next);
  return Object.freeze(next);
}
export function withSkinRoughness(value:StudioAppearanceV1,roughness:number):
  StudioAppearanceV1{
  const next={...value,roughness};
  validateStudioAppearance(next);
  return Object.freeze(next);
}
export function withFinishPreset(value:StudioAppearanceV1,id:FinishPresetId):
  StudioAppearanceV1{
  if(!Object.prototype.hasOwnProperty.call(FINISH_PRESETS,id))
    throw new Error("Unknown surface finish");
  return withSkinRoughness(value,FINISH_PRESETS[id].roughness);
}
export function matchingFinish(value:StudioAppearanceV1):FinishPresetId|undefined{
  return (Object.keys(FINISH_PRESETS) as FinishPresetId[])
    .find(id=>value.roughness===FINISH_PRESETS[id].roughness);
}

/**
 * Versioned, data-driven extension contract. The list is NOT navigation:
 * only ready modules with verified runtime support are rendered.
 */
export interface StudioModuleDescriptor {
  readonly id:string;
  readonly label:string;
  readonly availability:"ready"|"deferred";
  readonly requires:readonly string[];
  readonly controls:readonly string[];
}
export const STUDIO_MODULES:readonly StudioModuleDescriptor[]=Object.freeze([
  {id:"body",label:"Body",availability:"ready",
    requires:["pinned-human-mesh","source-body-targets"],controls:["native-body"]},
  {id:"face",label:"Face",availability:"ready",
    requires:["pinned-human-mesh","source-facial-targets"],controls:["native-face"]},
  {id:"appearance",label:"Appearance",availability:"ready",
    requires:["standard-skin-material"],controls:STUDIO_APPEARANCE_CONTROLS.map(c=>c.id)},
  {id:"hair",label:"Hair",availability:"deferred",requires:["hair-asset-runtime"],controls:[]},
  {id:"garments",label:"Clothing",availability:"deferred",
    requires:["fitted-garment-runtime"],controls:[]},
  {id:"armor",label:"Armor",availability:"deferred",requires:["armor-fit-runtime"],controls:[]},
  {id:"equipment",label:"Equipment",availability:"deferred",
    requires:["grip-and-equipment-runtime"],controls:[]},
  {id:"extensions",label:"Anatomy extensions",availability:"deferred",
    requires:["modular-anatomy-runtime"],controls:[]},
]);
export function availableStudioModules():readonly StudioModuleDescriptor[]{
  return STUDIO_MODULES.filter(m=>m.availability==="ready");
}
