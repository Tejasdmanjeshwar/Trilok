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
const PACKED = "AAAAAAAAAAAAAAAAAAAAAAAAw8XGyMnJysrKycnIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwMPExsjJycrKysnJx8bEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAu8DCxcbIycrKysrKycjGxMIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsLq/xMbHycvLy8vMysrJx8XEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAChqbO8wcTIyszMzM7Ozs7Oy8fGxMK7sQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACfpK23vsLGycvMzc7Pz8/OzszKx8bCu7atAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACdoKWut8DEyMrMzs7Q0NDQ0M7Oy8rGw763saMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoKCmsL3DxsjKzc/Q0NHR0dDPzs3Kx8TBuLGlAAAAAAAAAAAAAAAAAAAAAAAAAAAAl5yiprO8wcbJy83P0NHR0dHRz87Oy8rEwbyuoZkAAAAAAAAAAAAAAAAAAAAAAAAAk5edoKq0vMHDx8vOz9HR0dHR0dDOzsvJxMG9r6aYkgAAAAAAAAAAAAAAAAAAAAAAkZKVnKCmuLzBxcfLzc/Q0dHR0dHQzs3KyMC/vbGklJGLAAAAAAAAAAAAAAAAAAAAAJCSlJygpLa7vcTIyc3Oz9DR0dHQz83NysfBvrWuoJKPiwAAAAAAAAAAAAAAAAAAAI6PkpScoKa1u7zCx8fHzc/Pz9DQ0M7Ly8nFwb64rpyRjomHAAAAAAAAAAAAAAAAAACPkJGTmZ6orLu/wMbIyczNzc/Q0NDOysrHw769uK6hkYyJhgAAAAAAAAAAAAAAAAAAj5CRk5merK+5vsHFyMjKy83P0NHQzcnIxMLAuriwoZGMiIYAAAAAAAAAAAAAAAAAj4+QkZWZnaywsry/w8fIycrN0NLS0M3JxcPCvrmwsKSZi4eGhQAAAAAAAAAAAAAAAI6PkJGSnKKssbO6wcPFx8jK0NLS0tDMxsTCwr6zsK+jmI2HhYUAAAAAAAAAAAAAAACOj4+Rk52lq7Czt73DxMXGzdLS0tLRzczCwcC7s6+qoZiOh4aFAAAAAAAAAAAAAACJjI6PkZiepquutLa8xMjLzNHS0tLS0M7NysXAvLavqqKWi4eGhYQAAAAAAAAAAAAAiIuNj5Gan6eqr7K1vsXKy87R0tLS0dDOzsvHw7yyrKqgmIyJhoSBAAAAAAAAAAAAAIiKjI+TnKGorK+xtbzEyszO0dLSz8/P0M7LyMa8sa2opJuLiIWCgAAAAAAAAAAAAIaHioyNm5+jqKyvsrO5w8rMz9DRz87Nzs7Oy8nFuLCspqSdlImFgX9+AAAAAAAAAACFh4qLjp6ipKirrrK0t8DIy83Ozs3NzM3MzMrHwLWvrKakoJaPhYB+fQAAAAAAAAAAhYiKjJKfoqWprK+xtLe9w8fKzMzMzMvLy8jHwru0rqyno6CZj4WBfn0AAAAAAAAAAIWIi4+doqOmqautr7K1vMHFx8nLy8rIycjGw7+4s62qp6OgnZSGgX58AAAAAAAAAISFiY+YnaKkpqeqrK2wtLi+w8XEx8nIx8fFxMC8tLGqqKajn5yYjoKAfHoAAAAAAACDhImUm5+hpKSmqKqsrrC1usDCxMTExsbGxL++ubCqp6ajo5+cmpWDgXx5AAAAAAAAgoSJlpqfoaOkpaapqqytsLa9wMLExMTEw8PAvLStqqekoZ+fnJmVioJ8eAAAAAAAAICDipacn6ChoqSmqausra+yubq/wcHDwbu6uLWxq6imo6GfnZqZlY2EfHcAAAAAAAB8goiXnJ6fn6GjpqqrrK2vsra5u7u7vbu6urmxrquopqKfnpuZmJWPhXt1AAAAAAAAAICNl5udnZ6go6irq62usLO4ubu7u7q6urm4s66pqaakoJyZl5aVj4V6AAAAAAAAAAB/iJecnZ2eoaWpq62vsLK5u7u9vbu6urq6ubWysamnpqGdmJaVlZCDeAAAAAAAAAAAgIaUnJ6fn6OnqayvsbW7vb2/wL+9urq8vby5uLWvqaejn5uXlZSQgnYAAAAAAAAAAIGElJyen6Gkq66xs7a3vb6/wMDAvru8vr6+vbq3sq+opKCdmZaUkYNyAAAAAAAAAACChJCcn6GnrLCxs7e3vL2/wMDAwL67vL6+vr27ubSzrqmknpyYlZF4cwAAAAAAAAAAg4WKnJ+kq62xs7a4ury9v7/AwL68u72+vr69u7q2tbGuq6agnJaPeXUAAAAAAAAAAACHiJyfp6yws7W3ubq8vb2+v769vLu7vL28vLu5t7aysK2po56XjXkAAAAAAAAAAAAAh4mYn6mtsLO2uLm6vL29vb28vLu5u7u7vLu6ubi1s7CtrKWdloN8AAAAAAAAAAAAAACMkpiqrbCztbe5ubq7vLy6u7u6ubm5ubq6ubi1tbKvrayknouBAAAAAAAAAAAAAAAAi5KXpK2vs7S3t7i6u7q4ubq6ubi4uLi4t7e3tLOyr62rp5+DgAAAAAAAAAAAAAAAAACQlKGmr7K0tbW3uLe4uLi5ubi4t7i3trW3tLSysa+rp6WdggAAAAAAAAAAAAAAAAAAj5Ogo62usbO0tba2tre4ubi4t7e3t7W1s7Gysa+up6ahjIIAAAAAAAAAAAAAAAAAAACRn6Wqra6xs7S1tba2uLi4uLa2t7e0s7OysLCurKeknYsAAAAAAAAAAAAAAAAAAAAAAJ+jqqutsLCys7S1tre3uLi2tra2tbOysK+trKmkoZkAAAAAAAAAAAAAAAAAAAAAAAAAoqiqrK6xsrO0tLa3t7e3tra1tbSysLCurKqoo6EAAAAAAAAAAAAAAAAAAAAAAAAAAACnqKuusLGys7S2t7e3tra1tbW0srGvrauopaMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKirrbCxsbKytra2tra1tbW1tLKxraypqKQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAqq2tsLGxsrS0tba1tLS0tLOxsK2qqacAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACrrq6vsrK0tLS1tLOzs7Oxr66sqakAAAAAAAAAAAAAAAAAAA==";
// Decode only once; no runtime fetch, third-party model parser or texture allocation.
/** Quantized albedo sampled from the same GLB vertex UVs and CC BY texture.
 * Forehead ceremonial pigment is omitted; chroma is normalized to Trilok skin. */
const PACKED_PIGMENT = "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";
const pigments = Uint8Array.from(atob(PACKED_PIGMENT), c => c.charCodeAt(0));
const depths = Uint8Array.from(atob(PACKED), c => c.charCodeAt(0));
if (depths.length !== N * N) throw new Error("Invalid licensed Vanara facial atlas");
if (pigments.length !== N * N * 3) throw new Error("Invalid licensed Vanara face albedo");

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
  /** Average UV-textured source pigmentation, rescaled to the existing body
   * color. Only valid face-depth cells contribute; never darken the neck or
   * introduce a detached material. */
  const pigment = (x: number, y: number): readonly [number, number, number] | undefined => {
    if (x < X_MIN || x > X_MAX || y < Y_MIN || y > Y_MAX) return undefined;
    const fx = (x - X_MIN) / (X_MAX - X_MIN) * (N - 1);
    const fy = (y - Y_MIN) / (Y_MAX - Y_MIN) * (N - 1);
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const dx = fx - ix, dy = fy - iy;
    const result = [0, 0, 0];
    let coverage = 0;
    for (const [xx, yy, weight] of [
      [ix, iy, (1 - dx) * (1 - dy)],
      [Math.min(N - 1, ix + 1), iy, dx * (1 - dy)],
      [ix, Math.min(N - 1, iy + 1), (1 - dx) * dy],
      [Math.min(N - 1, ix + 1), Math.min(N - 1, iy + 1), dx * dy],
    ]) {
      if (depths[yy * N + xx] === 0) continue;
      coverage += weight;
      for (let channel = 0; channel < 3; channel++)
        result[channel]! += weight * pigments[(yy * N + xx) * 3 + channel]!;
    }
    return coverage > 1e-5
      ? [result[0]! / coverage, result[1]! / coverage, result[2]! / coverage]
      : undefined;
  };
  const bodyColor = new THREE.Color(0xb38b70);
  const color = (original: THREE.Vector3): THREE.Color => {
    const hit = reference(original);
    if (!hit) return bodyColor.clone();
    // Source UV albedo carries real eye, nasal and lip tonal boundaries. Blend
    // only the relative pigmentation into the existing C2 body skin palette.
    const albedo = pigment(hit.sx, hit.sy);
    if (!albedo) return bodyColor.clone();
    const gate = smooth((original.z - metrics.faceZ + .050) / .075) *
      smooth((original.y - neck.y) / .085) * hit.sample.coverage;
    const color = bodyColor.clone();
    for (let c = 0; c < 3; c++) {
      const baseline = [158, 108, 85][c]!;
      const ratio = THREE.MathUtils.clamp(
        Math.pow((albedo[c]! + 1) / (baseline + 1), .70), .64, 1.24);
      const channel = (["r", "g", "b"] as const)[c]!;
      color[channel] = bodyColor[channel] * (1 + (ratio - 1) * gate * .88);
    }
    return color;
  };
  // Keep existing diagnostic fields/landmark API, but never use its Gaussian
  // feature geometry for the primate head. Bear is intentionally unchanged.
  return Object.freeze({metrics, fields: legacy.fields, point, color});
}