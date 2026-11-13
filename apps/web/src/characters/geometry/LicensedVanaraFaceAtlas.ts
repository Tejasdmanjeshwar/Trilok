import * as THREE from "three";
import type { MammalianHeadMorphologyV1 } from "@trilok/character-core";
import type { HumanHeadTransform } from "./HumanHeadDeformation";
import type { MammalianFaceAnatomy } from "./MammalianFaceAnatomy";

/**
 * Face-only relief transferred from the actual GLB vertices of:
 * Lord Hanuman by iRahulRajput, https://sketchfab.com/3d-models/lord-hanuman-dbe8eabbe65d442e92a6e056c9bd41f8
 * CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ — adaptation, attribution required.
 * Original GLB SHA-256: 361cd7ee30f349b9baf8d1e856167e607adc82561c384bebb288dd7132a0786c
 * Depths are original model-space +Z vertex coordinates, quantized to millimeters.
 * Empty cells = 0. Hair, beard, crown, clothing and accessories are not transferred.
 * This atlas is NOT a replacement head, texture decal, floating component or source of skin weights.
 */
export const VANARA_ATLAS_SOURCE = Object.freeze({
  creator: "iRahulRajput", model: "Lord Hanuman",
  url: "https://sketchfab.com/3d-models/lord-hanuman-dbe8eabbe65d442e92a6e056c9bd41f8",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  glbSHA256: "361cd7ee30f349b9baf8d1e856167e607adc82561c384bebb288dd7132a0786c",
  measuredVertices: 6681, sampledCells: 1660,
});

const N = 49;
const X_MIN = -.088, X_MAX = .088;
const Y_MIN = .639, Y_MAX = .783;
const SOURCE_EYE_Y = .743;
const SOURCE_NOSE_Y = .704;
const SOURCE_MOUTH_Y = .665;
const SOURCE_EYE_HALF_SPAN = .04;
const SOURCE_EYE_DEPTH = .177;
const PACKED = "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";
// Decode only once; no runtime fetch, third-party model parser or texture allocation.
const depths = Uint8Array.from(atob(PACKED), c => c.charCodeAt(0));
if (depths.length !== N * N) throw new Error("Invalid licensed Vanara facial atlas");

export interface VanaraSurfaceSample {
  /** Original source +Z coordinate in its model coordinate system, meters. */
  readonly depth: number;
  /** Fraction of populated bilinear neighbors (0..1). */
  readonly coverage: number;
}
/** Bilinear sampling of face vertex depths, not a Gaussian feature generator. */
export function sampleLicensedVanaraFace(x: number, y: number): VanaraSurfaceSample | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < X_MIN || x > X_MAX ||
      y < Y_MIN || y > Y_MAX) return undefined;
  const fx = (x - X_MIN) / (X_MAX - X_MIN) * (N - 1);
  const fy = (y - Y_MIN) / (Y_MAX - Y_MIN) * (N - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(N - 1, x0 + 1), y1 = Math.min(N - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const entries = [
    [x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)],
    [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty],
  ] as const;
  let depth = 0, coverage = 0;
  for (const [ix, iy, weight] of entries) {
    const sample = depths[iy * N + ix]!;
    if (sample) { depth += sample * weight; coverage += weight; }
  }
  if (coverage < 1e-5) return undefined;
  return { depth: depth / coverage / 1000, coverage };
}
const smooth = (v: number): number => {
  const t = THREE.MathUtils.clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Source-derived 2.5D relief applied *only* to the old, continuous C2 rest head.
 * Eye/nose/mouth correspondence is calibrated from the reference's own vertex
 * positions; points outside the licensed face mask or inside the skull stay on
 * the existing C3.4 head. Jaw and skin ownership remain C1/C2 authoritative.
 */
export function makeLicensedVanaraFaceAnatomy(
  base: HumanHeadTransform,
  shape: MammalianHeadMorphologyV1,
  legacy: MammalianFaceAnatomy,
): MammalianFaceAnatomy {
  const { neck, eyeLeft, eyeRight } = base.landmarks;
  const metrics = legacy.metrics;
  const cx = (eyeLeft.x + eyeRight.x) * .5;
  const eyeY = (eyeLeft.y + eyeRight.y) * .5;
  const eyeHalf = (eyeRight.x - eyeLeft.x) * .5;
  if (eyeHalf < .012 || eyeY <= metrics.noseY || metrics.noseY <= metrics.mouthY)
    throw new Error("Invalid C3.5 licensed facial landmark registration");

  const reference = (original: THREE.Vector3): {
    readonly sample: VanaraSurfaceSample;
    readonly sx: number;
    readonly sy: number;
  } | undefined => {
    const sx = (original.x - cx) * SOURCE_EYE_HALF_SPAN /
      (eyeHalf * shape.muzzleWidth);
    // Three reference vertex bands anchor the face without inflating the skull.
    const sy = original.y >= eyeY
      ? SOURCE_EYE_Y + (original.y - eyeY) * .35
      : original.y >= metrics.noseY
        ? SOURCE_NOSE_Y + (original.y - metrics.noseY) *
          (SOURCE_EYE_Y - SOURCE_NOSE_Y) / (eyeY - metrics.noseY)
        : SOURCE_MOUTH_Y + (original.y - metrics.mouthY) *
          (SOURCE_NOSE_Y - SOURCE_MOUTH_Y) / (metrics.noseY - metrics.mouthY);
    const sample = sampleLicensedVanaraFace(sx, sy);
    return sample ? {sample, sx, sy} : undefined;
  };
  const point = (original: THREE.Vector3): THREE.Vector3 => {
    const surface = base.point(original.clone());
    const hit = reference(original);
    if (!hit) return surface;
    const {sample, sy} = hit;
    const neckGate = smooth((original.y - neck.y - .012) / .105);
    const frontGate = smooth((original.z - metrics.faceZ + .060) / .070);
    const faceBorder = smooth((sy - Y_MIN) / .012) *
      smooth((Y_MAX - sy) / .013);
    const mask = sample.coverage * neckGate * frontGate * faceBorder;
    if (mask <= 0) return surface;
    const anatomicalBand = sy < SOURCE_MOUTH_Y + .016 ? shape.jawMass
      : sy > SOURCE_EYE_Y ? shape.browMass : shape.muzzleHeight;
    const reach = THREE.MathUtils.clamp(
      shape.muzzleLength * anatomicalBand, .75, 1.35);
    const targetZ = metrics.faceZ +
      (sample.depth - SOURCE_EYE_DEPTH) * .80 * reach;
    // No abrupt monster snout or inner-skull movement: <= 34mm per face vertex.
    const offset = THREE.MathUtils.clamp(targetZ - surface.z, -.034, .034);
    surface.z += offset * mask * .92;
    return surface;
  };
  const bodyColor = new THREE.Color(0xb38b70);
  const color = (original: THREE.Vector3): THREE.Color => {
    const hit = reference(original);
    if (!hit) return bodyColor.clone();
    // Restrained vertex shading from sampled physical relief. The source hair,
    // beard and decorated textures are deliberately excluded from the product.
    const t = THREE.MathUtils.clamp((hit.sample.depth - .16) * .9, -.048, .048);
    const gate = smooth((original.z - metrics.faceZ + .050) / .075) *
      smooth((original.y - neck.y) / .085) * hit.sample.coverage;
    return bodyColor.clone().multiplyScalar(1 + t * gate);
  };
  // Keep existing diagnostic fields/landmark API, but never use its Gaussian
  // feature geometry for the primate head. Bear is intentionally unchanged.
  return Object.freeze({metrics, fields: legacy.fields, point, color});
}