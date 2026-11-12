import * as THREE from "three";
import type { AnatomicalHuman } from "./AnatomicalTemplate";

/**
 * C2.5 read-only contract audit before introducing any C3 morphology operations.
 * No sliders, geometry mutations, rebinds, or implicit source reconstruction.
 * The pinned source's origin/scale and source IDs remain authoritative.
 */
export const ANATOMICAL_MORPHOLOGY_CONTRACT_VERSION = 1 as const;
export interface MorphologyBaselineV1 {
  readonly version: typeof ANATOMICAL_MORPHOLOGY_CONTRACT_VERSION;
  readonly sourceVertices: number;
  readonly renderVertices: number;
  readonly triangles: number;
  readonly uvDuplicatedVertices: number;
  readonly canonicalJointIds: readonly string[];
  readonly presentationOnlySkinBoneCount: number;
  readonly units: "meters";
  readonly upAxis: "+Y";
  readonly forwardAxis: "+Z";
  readonly rootScale: readonly [1, 1, 1];
  readonly inputSourceUnitsToMeters: number;
  readonly inputOrigin: readonly [number, number, number];
  readonly boundsMinMeters: readonly [number, number, number];
  readonly boundsMaxMeters: readonly [number, number, number];
}
export class AnatomicalContractError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AnatomicalContractError";
  }
}
const fail = (code: string, reason: string): never => {
  throw new AnatomicalContractError(code, reason);
};
const finite = (value: number): boolean => Number.isFinite(value);
const equals = (a: number, b: number, eps = 1e-6): boolean =>
  Math.abs(a - b) <= eps;

/** Validates the pinned, calibrated rest mesh without altering resource ownership.
 * Export metadata only; never expose mutable GPU attributes as a C3 recipe. */
export function inspectAnatomicalMorphologyBaseline(
  human: AnatomicalHuman): MorphologyBaselineV1 {
  const { template, spike, mesh } = human;
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const skinWeight = geometry.getAttribute("skinWeight");
  const skinIndex = geometry.getAttribute("skinIndex");
  const topology = geometry.getIndex();
  if (topology === null) {
    throw new AnatomicalContractError("INDEX", "Missing indexed anatomical surface");
  }
  if (!position || !uv || !skinWeight || !skinIndex ||
      position.itemSize !== 3 || uv.itemSize !== 2 ||
      skinWeight.itemSize !== 4 || skinIndex.itemSize !== 4 ||
      position.count !== template.sourceVertexIds.length ||
      position.count !== uv.count || position.count !== skinWeight.count ||
      position.count !== skinIndex.count || topology.count % 3 !== 0)
    fail("ATTRIBUTES", "Missing or inconsistent indexed C2 source/skin attributes");
  if (!Number.isSafeInteger(template.sourceVertexCount) ||
      template.sourcePositions.length !== template.sourceVertexCount * 3 ||
      template.sourceVertexCount <= 0 ||
      !finite(template.conversionMetersPerSourceUnit) ||
      template.conversionMetersPerSourceUnit <= 0 ||
      template.sourceOrigin.length !== 3 || !template.sourceOrigin.every(finite))
    fail("SOURCE", "Invalid source origin, coordinates or unit conversion");
  if (spike.graph.joints.length > spike.skeleton.bones.length ||
      spike.graph.joints.some((joint, index) =>
        spike.bones.get(joint.id) !== spike.skeleton.bones[index]))
    fail("SEMANTIC_JOINTS", "C1 semantic joint mapping changed");
  if (!spike.character.root.scale.toArray().every(v => equals(v, 1)) ||
      !mesh.scale.toArray().every(v => equals(v, 1)))
    fail("ROOT_SCALE", "Morphology must not rely on non-unit character scale");
  if (spike.skeleton.boneInverses.length !== spike.skeleton.bones.length ||
      spike.skeleton.boneInverses.some(m =>
        !m.elements.every(finite) || Math.abs(m.determinant()) < 1e-10))
    fail("INVERSE_BINDS", "Missing, nonfinite or singular inverse bind matrices");
  const sourceToFirst = new Map<number, number>();
  const boundsMin = new THREE.Vector3(Infinity, Infinity, Infinity);
  const boundsMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const p = new THREE.Vector3();
  let duplicates = 0;
  for (let i = 0; i < position.count; i++) {
    const sourceId = template.sourceVertexIds[i]!;
    if (sourceId >= template.sourceVertexCount)
      fail("SOURCE_ID", "Out-of-range original source vertex " + sourceId);
    p.fromBufferAttribute(position, i);
    if (!p.toArray().every(finite)) fail("POSITION", "Nonfinite rest vertex " + i);
    boundsMin.min(p); boundsMax.max(p);
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const weight = skinWeight.getComponent(i, k);
      const bone = skinIndex.getComponent(i, k);
      if (!finite(weight) || weight < 0 || !Number.isInteger(bone) ||
          bone < 0 || bone >= spike.skeleton.bones.length)
        fail("SKIN_INFLUENCE", "Invalid four-weight influence " + i + "/" + k);
      sum += weight;
    }
    if (!equals(sum, 1, 2e-5))
      fail("SKIN_NORMALIZATION", "Unnormalized source skin " + i);
    for (let k = 0; k < 2; k++)
      if (!finite(uv.getComponent(i, k))) fail("UV", "Nonfinite UV " + i);
    const first = sourceToFirst.get(sourceId);
    if (first === undefined) sourceToFirst.set(sourceId, i);
    else {
      duplicates++;
      for (let k = 0; k < 3; k++)
        if (!equals(position.getComponent(first, k),
          position.getComponent(i, k), 1e-7))
          fail("SEAM_POSITION", "Source UV duplicate rest positions diverged");
      for (let k = 0; k < 4; k++) {
        if (skinIndex.getComponent(first, k) !== skinIndex.getComponent(i, k) ||
            !equals(skinWeight.getComponent(first, k),
              skinWeight.getComponent(i, k), 1e-7))
          fail("SEAM_SKIN", "Source UV duplicate weights diverged");
      }
    }
  }
  for (let i = 0; i < topology.count; i++) {
    const index = topology.getX(i);
    if (!Number.isInteger(index) || index < 0 || index >= position.count)
      fail("TOPOLOGY", "Out-of-range indexed triangle corner " + i);
  }
  if (sourceToFirst.size <= 0 || duplicates === 0)
    fail("SOURCE_CORRESPONDENCE", "Missing source vertices or UV seam duplicates");
  if (template.connectedComponents !== 1 ||
      template.nonManifoldEdgeCount !== 0 || template.boundaryEdgeCount !== 0)
    fail("SOURCE_TOPOLOGY", "Anatomical body source has open/nonmanifold edges");
  const scale = template.conversionMetersPerSourceUnit;
  return Object.freeze({
    version: ANATOMICAL_MORPHOLOGY_CONTRACT_VERSION,
    sourceVertices: template.sourceVertexCount,
    renderVertices: position.count,
    triangles: topology.count / 3,
    uvDuplicatedVertices: duplicates,
    canonicalJointIds: Object.freeze(spike.graph.joints.map(j => j.id)),
    presentationOnlySkinBoneCount: spike.skeleton.bones.length - spike.graph.joints.length,
    units: "meters", upAxis: "+Y", forwardAxis: "+Z",
    rootScale: [1, 1, 1] as const,
    inputSourceUnitsToMeters: scale,
    inputOrigin: [...template.sourceOrigin] as [number, number, number],
    boundsMinMeters: boundsMin.toArray() as [number, number, number],
    boundsMaxMeters: boundsMax.toArray() as [number, number, number],
  });
}
