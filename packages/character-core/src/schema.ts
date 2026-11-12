/** C1: serializable, renderer-independent character contracts. All lengths are meters. */
export const CHARACTER_SCHEMA_VERSION = 1 as const;
export const CHARACTER_COORDINATES = "trilok-y-up-z-forward-meters" as const;
export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];
export type ModuleKind = "humanoid" | "extra_arm" | "extra_leg" | "head" | "tail" | "wing";
export type SocketPurpose =
  | "primary_grip" | "secondary_grip" | "shield" | "bow_nock" | "bow_string"
  | "projectile_origin" | "back" | "hip" | "effect" | "ik_target";

export interface AnatomyModuleV1 {
  readonly id: string;
  readonly kind: ModuleKind;
  readonly topologyFamilyId: string;
  /** Null only for the sole foundational humanoid. */
  readonly attachedToSegment: string | null;
  readonly segmentIds: readonly string[];
  readonly jointIds: readonly string[];
}
export interface AnatomySegmentV1 {
  readonly id: string;
  readonly moduleId: string;
  readonly parentId: string | null;
  readonly proximalJointId: string;
  readonly combatRegionIds: readonly string[];
  readonly capabilityIds: readonly string[];
}
export interface SemanticJointV1 {
  readonly id: string;
  readonly segmentId: string;
  readonly parentId: string | null;
  readonly role: string;
  /** Rest-pose rigid local transform; scale is intentionally forbidden. */
  readonly bindTranslation: Vec3;
  readonly bindQuaternion: Quat;
  /** False for an authoring control that must not enter the exported skin skeleton. */
  readonly exported: boolean;
}
export interface SemanticSocketV1 {
  readonly id: string;
  readonly purpose: SocketPurpose;
  readonly ownerSegmentId: string;
  readonly parentJointId: string;
  readonly localTranslation: Vec3;
  readonly localQuaternion: Quat;
  readonly requiredCapabilityIds: readonly string[];
}
export interface SkinBindingV1 {
  readonly meshId: string;
  readonly jointIds: readonly string[];
  readonly maxInfluencesPerVertex: number;
}
export interface SeverZoneV1 {
  readonly id: string;
  readonly segmentId: string;
  readonly seamLoopId: string;
  readonly capAssetId: string;
}
export interface AnatomicalGraphV1 {
  readonly schemaVersion: typeof CHARACTER_SCHEMA_VERSION;
  readonly coordinates: typeof CHARACTER_COORDINATES;
  readonly topologyFamilyId: string;
  /** Head vertex topology family is distinct from the body family. */
  readonly headTopologyFamilyId: string;
  readonly modules: readonly AnatomyModuleV1[];
  readonly segments: readonly AnatomySegmentV1[];
  readonly joints: readonly SemanticJointV1[];
  readonly sockets: readonly SemanticSocketV1[];
  /** Metadata only in C1; no mesh skinning or cut topology is generated. */
  readonly skinBindings: readonly SkinBindingV1[];
  readonly severZones: readonly SeverZoneV1[];
}
export interface CharacterRecipeModuleV1 {
  readonly id: string;
  readonly familyId: string;
  readonly attachTo: string | null;
}
export interface CharacterRecipeV1 {
  readonly schemaVersion: typeof CHARACTER_SCHEMA_VERSION;
  readonly generatorVersion: string;
  readonly seed: number;
  readonly archetypeId: string;
  readonly topologyFamilyId: string;
  readonly modules: readonly CharacterRecipeModuleV1[];
  readonly parameters: Readonly<Record<string, number>>;
  readonly materialPresetIds: readonly string[];
}
/** Separate per-instance injury record; not a modification of pristine recipe/bake. */
export interface CharacterInjuryStateV1 {
  readonly schemaVersion: typeof CHARACTER_SCHEMA_VERSION;
  readonly characterInstanceId: string;
  readonly missingSegmentIds: readonly string[];
  readonly severEvents: readonly { readonly id: string; readonly zoneId: string; readonly turn: number }[];
  readonly disfigurement: Readonly<Record<string, number>>;
}
