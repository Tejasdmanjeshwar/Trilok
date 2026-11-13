import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import * as THREE from "three";
import {createHumanLocalRecipe, DEFAULT_HUMAN_LOCAL_MORPHOLOGY} from "../packages/character-core/src/index";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {applyHumanMorphology,getHumanMorphologyAlignment} from
  "../apps/web/src/characters/geometry/HumanMorphology";
import {HumanPoseCorrectives} from
  "../apps/web/src/characters/geometry/HumanPoseCorrectives";
import {AnatomicalFK} from
  "../apps/web/src/characters/geometry/AnatomicalFK";
import type {SourceRig,SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

const asset=(name:string)=>readFileSync(
  new URL("../apps/web/public/anatomy/"+name,import.meta.url),"utf8");
const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
const create=()=>bindTemplateToSemanticRig(parseAnatomicalOBJ(
  asset("makehuman-base.obj"),{includeGroups:["body"]}),{rig,weights});
const pose=(human:ReturnType<typeof create>)=>new AnatomicalFK(
  human.spike.graph,human.spike.bones,{jawTipWorldRest:human.jawTipWorldRest,
    shoulderSkinBones:human.spike.shoulderSkinBones,
    forearmSkinBones:human.spike.forearmSkinBones});

describe("C3.3 optional pose-space correction and socket/IK calibration",()=>{
  it("preserves neutral source skin, seam correspondence, and opt-in correction lifecycle",()=>{
    const human=create();
    try {
      const recipe=createHumanLocalRecipe({...DEFAULT_HUMAN_LOCAL_MORPHOLOGY,shoulders:1.10,hips:1.10,arms:1.06,
        legs:1.06});
      applyHumanMorphology(human,recipe);
      const positions=new Float32Array(human.mesh.geometry.getAttribute("position").array);
      const index=new Uint32Array(human.template.sourceVertexIds);
      const correction=new HumanPoseCorrectives(human);
      try {
        const attrs=human.mesh.geometry.morphAttributes.position;
        expect(attrs).toHaveLength(4);
        expect(human.mesh.geometry.morphTargetsRelative).toBe(true);
        expect(human.mesh.morphTargetInfluences).toEqual([0,0,0,0]);
        expect(() => new HumanPoseCorrectives(human)).toThrow();
        const ids=human.template.sourceVertexIds;
        const first=new Map<number,number>();
        for(let i=0;i<ids.length;i++){
          const previous=first.get(ids[i]!);
          if(previous===undefined){first.set(ids[i]!,i);continue;}
          for(const attr of attrs!)for(let k=0;k<3;k++)
            expect(attr!.getComponent(i,k)).toBe(attr!.getComponent(previous,k));
        }
        const fk=pose(human);
        const joint=human.spike.graph.joints.find(j=>j.role==="shoulder_left")!;
        const target={jointId:joint.id,motion:"abduction" as const,radians:1.2};
        fk.apply([target]);correction.apply([target]);
        expect(human.mesh.morphTargetInfluences![0]).toBeGreaterThan(.5);
        expect(human.mesh.morphTargetInfluences!.slice(1)).toEqual([0,0,0]);
        const vertex=human.mesh.getVertexPosition(100,new THREE.Vector3());
        expect(vertex.toArray().every(Number.isFinite)).toBe(true);
        fk.apply([]);correction.apply([]);
        expect(human.mesh.morphTargetInfluences).toEqual([0,0,0,0]);
        expect([...human.mesh.geometry.getAttribute("position").array]).toEqual([...positions]);
        expect([...human.template.sourceVertexIds]).toEqual([...index]);
        expect(() => correction.apply([{...target,radians:NaN}])).toThrow();
      }finally {correction.dispose();correction.dispose();}
      expect(human.mesh.geometry.morphAttributes.position).toHaveLength(0);
    }finally{human.dispose();}
  },120_000);

  it("derives shaped bilateral lengths and socket frames with deterministic restoration",()=>{
    for(const params of [
      {stature:1.08,breadth:1.05,shoulders:1.10,hips:1.10,arms:1.06,legs:1.06},
      {stature:.92,breadth:.95,shoulders:.90,hips:.90,arms:.94,legs:.94},
    ]) {
      const human=create();
      try {
        const originalSocketIds=human.spike.graph.sockets.map(s=>s.id);
        applyHumanMorphology(human,createHumanLocalRecipe({...DEFAULT_HUMAN_LOCAL_MORPHOLOGY,...params}));
        const alignment=getHumanMorphologyAlignment(human)!;
        expect(alignment).toBeDefined();
        expect([...alignment.sockets.keys()]).toEqual(originalSocketIds);
        expect(alignment.chains.size).toBe(4);
        for(const [id,chain] of alignment.chains){
          const centers=alignment.chainWorld(id);
          expect(centers[0].distanceTo(centers[1])).toBeCloseTo(chain.upperMeters,6);
          expect(centers[1].distanceTo(centers[2])).toBeCloseTo(chain.lowerMeters,6);
          expect(chain.maxReachMeters).toBeCloseTo(
            chain.upperMeters+chain.lowerMeters,9);
        }
        for(const socket of human.spike.graph.sockets){
          const matrix=alignment.socketWorld(socket.id);
          expect(matrix.elements.every(Number.isFinite)).toBe(true);
          const expected=new THREE.Vector3(...alignment.sockets.get(socket.id)!)
            .applyMatrix4(human.spike.bones.get(socket.parentJointId)!.matrixWorld);
          expect(new THREE.Vector3().setFromMatrixPosition(matrix)
            .distanceTo(expected)).toBeLessThan(1e-6);
        }
        const fk=pose(human);
        const targetJoint=human.spike.graph.joints.find(j=>j.role==="elbow_left")!;
        const grip=human.spike.graph.sockets.find(s=>
          s.purpose==="primary_grip" && s.id.includes("left"))!;
        const initial=alignment.socketWorld(grip.id).clone();
        fk.apply([{jointId:targetJoint.id,motion:"flexion",radians:1}]);
        expect(alignment.socketWorld(grip.id).elements).not.toEqual(initial.elements);
        fk.apply([]);
        expect(alignment.socketWorld(grip.id).elements).toEqual(initial.elements);
      }finally{human.dispose();}
    }
  },120_000);
});
