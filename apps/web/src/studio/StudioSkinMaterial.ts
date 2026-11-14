import * as THREE from "three";
import {
  HUMAN_SKIN_TONES,validateStudioAppearance,type StudioAppearanceV1,
} from "./StudioAppearance";

/** Mutates only the owned MakeHuman skin material. No textures or geometry
 * are fabricated; presentation light, tone mapping and camera are untouched. */
export function applyStudioSkinMaterial(
  mesh:THREE.SkinnedMesh,appearance:StudioAppearanceV1,
):void{
  validateStudioAppearance(appearance);
  const material=mesh.material;
  if(!(material instanceof THREE.MeshStandardMaterial))
    throw new Error("The current character does not support skin adjustments");
  material.color.setHex(HUMAN_SKIN_TONES[appearance.tone].hex);
  material.roughness=appearance.roughness;
  material.metalness=0;
}
