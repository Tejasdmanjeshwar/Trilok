import * as THREE from "three";
import {captureHumanRestSockets, calibrateHumanMorphologyAlignment,
  type HumanMorphologyAlignment} from "./HumanMorphologyAlignment";
import { validateHumanMorphologyRecipe, type CharacterRecipeV1,
  type HumanMorphologyV1, HUMAN_LOCAL_GENERATOR_VERSION,
  validateHumanLocalRecipe, HUMAN_HEAD_GENERATOR_VERSION,
  validateHumanHeadRecipe, MAMMAL_HEAD_GENERATORS,
  validateMammalianHeadRecipe, MAMMAL_HEAD_TOPOLOGY_FAMILIES } from "@trilok/character-core";
import { makeHumanLocalTransform, recomputeSourceNormals } from "./HumanLocalDeformation";
import type { AnatomicalHuman } from "./AnatomicalTemplate";
import { inspectAnatomicalMorphologyBaseline } from "./AnatomicalMorphologyContract";
import { validateSkinningSpike } from "./SkinningSpike";
import { makeHumanHeadTransform, calibrateHumanHeadLandmarks,
  type HumanHeadLandmarks } from "./HumanHeadDeformation";
import {replaceVanaraHead} from "./VanaraHeadGeometry";
import {makeMammalianHeadTransform, calibrateMammalianHeadLandmarks,
  type MammalianHeadLandmarks} from "./MammalianHeadDeformation";

/**
 * C3.1/C3.2 opt-in, deterministic, rest-space human shape pass. All source IDs,
 * indexed faces, UV seams, skin ownership and semantic C1 joints are retained.
 * This first narrow affine body model is not a sculpt, corrective morph, head
 * generator, segmented severable mesh, or general-purpose re-targeting API.
 */
const applied = new WeakSet<AnatomicalHuman>();
const alignments = new WeakMap<AnatomicalHuman, HumanMorphologyAlignment>();
const headLandmarks = new WeakMap<AnatomicalHuman, HumanHeadLandmarks>();
const mammalLandmarks = new WeakMap<AnatomicalHuman, MammalianHeadLandmarks>();
/** C3.5 family-specific render reference landmarks, not new C1 joints. */
export const getMammalianHeadLandmarks = (human: AnatomicalHuman):
  MammalianHeadLandmarks | undefined => mammalLandmarks.get(human);
/** C3.4 source-derived facial landmarks follow the posed C1 head joint. */
export const getHumanHeadLandmarks = (human: AnatomicalHuman):
  HumanHeadLandmarks | undefined => headLandmarks.get(human);
/** Optional C3.3 presentation-only socket/IK metadata for a shaped instance. */
export const getHumanMorphologyAlignment = (human: AnatomicalHuman):
  HumanMorphologyAlignment | undefined => alignments.get(human);
const transform = (v: THREE.Vector3, shape: HumanMorphologyV1): THREE.Vector3 =>
  v.set(v.x * shape.breadth, v.y * shape.stature, v.z * shape.breadth);

export interface AppliedHumanMorphologyV1 {
  readonly generatorVersion: string;
  readonly vertices: number;
  readonly joints: number;
  readonly stature: number;
  readonly breadth: number;
}

/**
 * Mutates only one *owned*, bound, neutral-pose AnatomicalHuman instance.
 * Use loadAnatomicalHuman/bindTemplateToSemanticRig to create a fresh instance
 * for each recipe. Validation completes before changing rest positions.
 */
export function applyHumanMorphology(
  human: AnatomicalHuman,
  recipe: CharacterRecipeV1,
): AppliedHumanMorphologyV1 {
  const mammal = Object.values(MAMMAL_HEAD_GENERATORS).includes(
    recipe.generatorVersion as (typeof MAMMAL_HEAD_GENERATORS)[keyof typeof MAMMAL_HEAD_GENERATORS])
    ? validateMammalianHeadRecipe(recipe) : undefined;
  const headShape = mammal?.shape ?? (
    recipe.generatorVersion === HUMAN_HEAD_GENERATOR_VERSION
      ? validateHumanHeadRecipe(recipe) : undefined);
  const localShape = headShape ?? (recipe.generatorVersion === HUMAN_LOCAL_GENERATOR_VERSION
    ? validateHumanLocalRecipe(recipe) : undefined);
  const shape = localShape ?? validateHumanMorphologyRecipe(recipe);
  if (applied.has(human)) throw new Error("C3 morphology already applied: rebuild from the source");
  inspectAnatomicalMorphologyBaseline(human);
  const {spike, mesh, template} = human;
  if (spike.graph.topologyFamilyId !== recipe.topologyFamilyId ||
      spike.graph.headTopologyFamilyId !== (mammal ?
        MAMMAL_HEAD_TOPOLOGY_FAMILIES[mammal.family] : "head_human_v1") ||
      mesh.geometry !== template.geometry)
    throw new Error("C3 morphology requires the pinned human anatomy/mesh");
  const root = spike.character.root;
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const allBones = spike.skeleton.bones;
  const restSockets = captureHumanRestSockets(human);
  const oldLocalPositions = allBones.map(b =>
    b.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInverse));
  // Reject posed rigs; this API does not alter current animation state or FK.
  for (let i = 0; i < allBones.length; i++) {
    const bone = allBones[i]!;
    const skin = bone.matrixWorld.clone().multiply(spike.skeleton.boneInverses[i]!);
    const e = skin.elements;
    if (e.some((x, j) => Math.abs(x - (j % 5 === 0 ? 1 : 0)) > 1e-5))
      throw new Error("C3 morphology requires a neutral-pose rest skeleton");
  }
  const geometry = mesh.geometry;
  const pos = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  if (!pos || !normal || pos.count !== normal.count ||
      pos.itemSize !== 3 || normal.itemSize !== 3)
    throw new Error("Missing human position/normal attributes");
  // Test all transformed inputs and skeleton targets before the first write.
  for (let i = 0; i < pos.count; i++) {
    if (![pos.getX(i), pos.getY(i), pos.getZ(i),
          normal.getX(i), normal.getY(i), normal.getZ(i)].every(Number.isFinite))
      throw new Error("Nonfinite C3 rest surface");
  }
  const localTransform = localShape ? makeHumanLocalTransform(human, localShape) : undefined;
  const headTransform = mammal
    ? makeMammalianHeadTransform(human, mammal.family, mammal.shape)
    : headShape ? makeHumanHeadTransform(human, headShape) : undefined;
  const mapHead = (p: THREE.Vector3): THREE.Vector3 =>
    headTransform ? headTransform.point(p) : p;
  const mapJoint = (p: THREE.Vector3, index: number): THREE.Vector3 =>
    localTransform ? localTransform.joint(mapHead(p), index) : transform(p, shape);
  const mapVertex = (p: THREE.Vector3, index: number): THREE.Vector3 =>
    localTransform ? localTransform.vertex(mapHead(p), index) : transform(p, shape);
  // C3.4: prepare and validate every computed vertex BEFORE writing geometry,
  // bones or inverse binds. No C1/C3.1/C3.2 code path is rerouted here.
  const stagedPositions = headTransform ? new Float32Array(pos.count * 3) : undefined;
  const stagedColors = mammal ? new Float32Array(pos.count * 3) : undefined;
  const faceAnatomy = mammal ?
    (headTransform as ReturnType<typeof makeMammalianHeadTransform>).anatomy : undefined;
  const bodyColor = new THREE.Color(0xb38b70);
  if (stagedPositions) {
    for (let i=0; i<pos.count; i++) {
      const mapped = mapVertex(new THREE.Vector3().fromBufferAttribute(pos,i),i);
      if (!mapped.toArray().every(Number.isFinite))
        throw new Error("C3.4 head surface produced a nonfinite position");
      stagedPositions[i*3]=mapped.x;
      stagedPositions[i*3+1]=mapped.y;
      stagedPositions[i*3+2]=mapped.z;
      if (stagedColors && faceAnatomy) {
        const original = new THREE.Vector3().fromBufferAttribute(pos,i);
        const color = faceAnatomy.color(original);
        // Source-surface vertex colors make the nasal pad, nostrils, lips and
        // ear bowl legible while the original CC0 body keeps its prior tone.
        const face = THREE.MathUtils.clamp(
          (original.y - (headTransform as ReturnType<typeof makeMammalianHeadTransform>)
            .landmarks.neck.y) / .065,0,1);
        const t = face*face*(3-2*face);
        color.lerp(bodyColor,1-t);
        stagedColors[i*3]=color.r;
        stagedColors[i*3+1]=color.g;
        stagedColors[i*3+2]=color.b;
      }
    }
  }
  const nextBonePositions = oldLocalPositions.map((p, i) => mapJoint(p.clone(), i));
  if (nextBonePositions.some(p => !p.toArray().every(Number.isFinite)))
    throw new Error("Nonfinite C3 morphology bind position");
  const restWorld = root.matrixWorld.clone();
  // The Three.js scale stays exactly one. Bone translations and inverse binds
  // follow the same mapping as surface positions; no root scaling shortcuts.
  for (let i = 0; i < allBones.length; i++) {
    const bone = allBones[i]!;
    const parent = bone.parent;
    if (!parent) throw new Error("Missing anatomical bone parent");
    parent.updateWorldMatrix(true, false);
    const targetWorld = nextBonePositions[i]!.clone().applyMatrix4(restWorld);
    bone.position.copy(parent.worldToLocal(targetWorld));
    bone.updateMatrixWorld(true);
  }
  root.updateMatrixWorld(true);
  spike.skeleton.calculateInverses();
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const mapped = stagedPositions
      ? new THREE.Vector3(stagedPositions[i*3]!,stagedPositions[i*3+1]!,stagedPositions[i*3+2]!)
      : mapVertex(p, i);
    pos.setXYZ(i, mapped.x, mapped.y, mapped.z);
    if (!localTransform) {
      // Inverse transpose of the positive, diagonal anatomical rest transform.
      p.set(normal.getX(i) / shape.breadth,
        normal.getY(i) / shape.stature, normal.getZ(i) / shape.breadth).normalize();
      normal.setXYZ(i, p.x, p.y, p.z);
    }
  }
  pos.needsUpdate = true;
  if(stagedColors) {
    // Vertex colors operate only on this freshly allocated, owned
    // presentation mesh. C1/2 geometry indices, UVs and weights remain intact.
    geometry.setAttribute("color",new THREE.Float32BufferAttribute(stagedColors,3));
    const material=mesh.material as THREE.MeshStandardMaterial;
    material.vertexColors=true;
    material.color.set(0xffffff);
    material.needsUpdate=true;
  }
  if (localTransform) recomputeSourceNormals(human);
  else normal.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  if (human.jawTipWorldRest) {
    const original = human.jawTipWorldRest.clone().applyMatrix4(rootInverse);
    const referenceIndex = spike.graph.joints.findIndex(j =>
      j.role === (headTransform ? "jaw" : "head"));
    human.jawTipWorldRest.copy(mapJoint(original, referenceIndex)
      .applyMatrix4(restWorld));
  }
  validateSkinningSpike(spike);
  const alignment = calibrateHumanMorphologyAlignment(human, restSockets, mapJoint);
  alignments.set(human, alignment);
  if (headTransform) {
    const mapBody = (point:THREE.Vector3,index:number) =>
      localTransform ? localTransform.joint(point,index) : transform(point,shape);
    headLandmarks.set(human, calibrateHumanHeadLandmarks(human, headTransform,mapBody));
    if(mammal) {
      // Only the primate obtains independent head topology in C3.5.
      // The existing bear is an explicitly unaccepted legacy preview (C7).
      const landmarks = mammal.family==="primate"
        ? replaceVanaraHead(human,headTransform,mammal.shape).landmarks
        : calibrateMammalianHeadLandmarks(human,
          headTransform as ReturnType<typeof makeMammalianHeadTransform>,mapBody);
      mammalLandmarks.set(human,landmarks);
    }
  }
  applied.add(human);
  return Object.freeze({
    generatorVersion: recipe.generatorVersion,
    vertices: pos.count,
    joints: spike.graph.joints.length,
    stature: shape.stature,
    breadth: shape.breadth,
  });
}
