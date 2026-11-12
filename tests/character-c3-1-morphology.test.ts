import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { canonicalRecipeJSON, createHumanMorphologyRecipe,
  humanMorphologyFingerprint, validateHumanMorphologyRecipe,
} from "../packages/character-core/src/index";
import { parseAnatomicalOBJ, bindTemplateToSemanticRig } from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import { applyHumanMorphology } from
  "../apps/web/src/characters/geometry/HumanMorphology";
import { inspectAnatomicalMorphologyBaseline } from
  "../apps/web/src/characters/geometry/AnatomicalMorphologyContract";
import { AnatomicalFK } from
  "../apps/web/src/characters/geometry/AnatomicalFK";
import { validateSkinningSpike } from
  "../apps/web/src/characters/geometry/SkinningSpike";
import type { SourceRig, SourceWeights } from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

const asset = (name:string) => readFileSync(
  new URL("../apps/web/public/anatomy/" + name, import.meta.url), "utf8");
const rig = JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
const weights = JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
function realHuman() {
  const template = parseAnatomicalOBJ(asset("makehuman-base.obj"),
    {includeGroups:["body"]});
  return bindTemplateToSemanticRig(template, {rig,weights});
}
const shape = {stature:1.06,breadth:0.94} as const;

describe("C3.1 deterministic bounded human morphology", () => {
  it("uses explicit generator identity, stable recipe hashes and fail-closed bounds", () => {
    const a = createHumanMorphologyRecipe(shape, 42);
    const b = createHumanMorphologyRecipe({breadth:0.94,stature:1.06},42);
    expect(canonicalRecipeJSON(a)).toBe(canonicalRecipeJSON(b));
    expect(humanMorphologyFingerprint(a)).toBe(humanMorphologyFingerprint(b));
    expect(validateHumanMorphologyRecipe(a)).toEqual(shape);
    expect(() => createHumanMorphologyRecipe({stature:1.081,breadth:1})).toThrow();
    expect(() => createHumanMorphologyRecipe({stature:1,breadth:0.899})).toThrow();
    expect(() => createHumanMorphologyRecipe({stature:NaN,breadth:1})).toThrow();
    expect(() => validateHumanMorphologyRecipe({...a,
      parameters:{...a.parameters, "head.unknown":1}})).toThrow();
    expect(() => validateHumanMorphologyRecipe({...a,generatorVersion:"c1-contract-v1"})).toThrow();
    expect(humanMorphologyFingerprint(createHumanMorphologyRecipe(shape,43)))
      .not.toBe(humanMorphologyFingerprint(a));
  });

  it("preserves pinned topology, seam ownership, C1 IDs, binding and rest skin through extremes", () => {
    for (const bounds of [
      {stature:0.92,breadth:0.90},
      {stature:1.08,breadth:1.10},
      shape,
    ]) {
      const human=realHuman();
      try {
        const {mesh,spike,template}=human;
        const before=inspectAnatomicalMorphologyBaseline(human);
        const ids=Array.from(template.sourceVertexIds);
        const faces=Array.from(mesh.geometry.getIndex()!.array);
        const uv=Array.from(mesh.geometry.getAttribute("uv").array);
        const initial=mesh.geometry.getAttribute("position");
        const vertices=[0,Math.floor(initial.count/2),initial.count-1];
        const rest=vertices.map(i=>new THREE.Vector3().fromBufferAttribute(initial,i));
        const jointIds=spike.graph.joints.map(j=>j.id);
        const baselineJointPositions=spike.graph.joints.map(j=>
          spike.bones.get(j.id)!.getWorldPosition(new THREE.Vector3()).clone());
        const result=applyHumanMorphology(human,createHumanMorphologyRecipe(bounds));
        expect(result.vertices).toBe(before.renderVertices);
        expect(result.joints).toBe(jointIds.length);
        expect(spike.graph.joints.map(j=>j.id)).toEqual(jointIds);
        expect(Array.from(template.sourceVertexIds)).toEqual(ids);
        expect(Array.from(mesh.geometry.getIndex()!.array)).toEqual(faces);
        expect(Array.from(mesh.geometry.getAttribute("uv").array)).toEqual(uv);
        expect(spike.character.root.scale.toArray()).toEqual([1,1,1]);
        expect(mesh.scale.toArray()).toEqual([1,1,1]);
        for(let n=0;n<vertices.length;n++){
          const i=vertices[n]!;
          const expected=rest[n]!.clone().multiply(new THREE.Vector3(
            bounds.breadth,bounds.stature,bounds.breadth));
          expect(new THREE.Vector3().fromBufferAttribute(
            mesh.geometry.getAttribute("position"),i).distanceTo(expected))
            .toBeLessThan(1e-6);
          expect(mesh.getVertexPosition(i,new THREE.Vector3()).distanceTo(expected))
            .toBeLessThan(0.00015);
        }
        for (let n=0;n<jointIds.length;n++){
          const actual=spike.bones.get(jointIds[n]!)!.getWorldPosition(new THREE.Vector3());
          const source=baselineJointPositions[n]!;
          expect(actual.distanceTo(new THREE.Vector3(
            source.x*bounds.breadth,source.y*bounds.stature,source.z*bounds.breadth)))
            .toBeLessThan(1e-5);
        }
        validateSkinningSpike(spike);
        expect(inspectAnatomicalMorphologyBaseline(human).canonicalJointIds)
          .toEqual(jointIds);
        const fk=new AnatomicalFK(spike.graph,spike.bones,{
          jawTipWorldRest:human.jawTipWorldRest,
          forearmSkinBones:spike.forearmSkinBones,
          shoulderSkinBones:spike.shoulderSkinBones,
        });
        const elbow=spike.graph.joints.find(j=>j.role==="elbow_left")!;
        fk.apply([{jointId:elbow.id,motion:"flexion",radians:0.9}]);
        expect(vertices.every(i=>mesh.getVertexPosition(i,new THREE.Vector3())
          .toArray().every(Number.isFinite))).toBe(true);
        fk.apply([]);
        for(let n=0;n<vertices.length;n++)
          expect(mesh.getVertexPosition(vertices[n]!,new THREE.Vector3())
            .distanceTo(rest[n]!.clone().multiply(new THREE.Vector3(
              bounds.breadth,bounds.stature,bounds.breadth))))
            .toBeLessThan(.00015);
        expect(() => applyHumanMorphology(human,createHumanMorphologyRecipe(shape)))
          .toThrow(/already applied/);
      } finally {human.dispose();human.dispose();}
    }
  }, 120_000);

  it("rejects posing before deformation without mutating the mesh", () => {
    const human=realHuman();
    try{
      const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
        jawTipWorldRest:human.jawTipWorldRest,
        forearmSkinBones:human.spike.forearmSkinBones,
        shoulderSkinBones:human.spike.shoulderSkinBones,
      });
      const elbow=human.spike.graph.joints.find(j=>j.role==="elbow_left")!;
      const original=human.mesh.geometry.getAttribute("position").getY(0);
      fk.apply([{jointId:elbow.id,motion:"flexion",radians:0.4}]);
      expect(() => applyHumanMorphology(human,createHumanMorphologyRecipe(shape)))
        .toThrow(/neutral-pose/);
      expect(human.mesh.geometry.getAttribute("position").getY(0)).toBe(original);
      fk.apply([]);
    } finally {human.dispose();}
  },60_000);
});
