import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {createMammalianHeadRecipe} from "../packages/character-core/src/index";
import {parseAnatomicalOBJ,bindTemplateToSemanticRig} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {applyHumanMorphology,getMammalianHeadLandmarks} from
  "../apps/web/src/characters/geometry/HumanMorphology";
import {getVanaraHeadReplacement} from
  "../apps/web/src/characters/geometry/VanaraHeadGeometry";
import {AnatomicalFK} from
  "../apps/web/src/characters/geometry/AnatomicalFK";
import type {SourceRig,SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

const asset=(name:string)=>readFileSync(
  new URL("../apps/web/public/anatomy/"+name,import.meta.url),"utf8");
const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
const create=()=>bindTemplateToSemanticRig(parseAnatomicalOBJ(
  asset("makehuman-base.obj"),{includeGroups:["body"]}),
  {rig,weights,headFamily:"primate"});

describe("C3.5 Vanara independent external head geometry",()=>{
  it("provides a species-specific skinned topology with finite UVs, normalized ownership and nondegenerate faces",()=>{
    const human=create();
    try{
      const baselineTriangles=human.mesh.geometry.getIndex()!.count;
      const sourceIds=Array.from(human.template.sourceVertexIds);
      applyHumanMorphology(human,createMammalianHeadRecipe("primate"));
      const replacement=getVanaraHeadReplacement(human);
      expect(replacement).toBeDefined();
      const {mesh,headVertices,neckCutY,skullWidthMeters}=replacement!;
      const geometry=mesh.geometry;
      expect(mesh.name).toContain("VANARA_INDEPENDENT");
      expect(mesh.skeleton).toBe(human.spike.skeleton);
      expect(headVertices).toBeGreaterThan(3000);
      expect(skullWidthMeters).toBeGreaterThan(.16);
      expect(skullWidthMeters).toBeLessThan(.34);
      expect(neckCutY).toBeGreaterThan(1.4);
      expect(human.mesh.geometry.getIndex()!.count).toBeLessThan(baselineTriangles);
      expect([...human.template.sourceVertexIds]).toEqual(sourceIds);
      const pos=geometry.getAttribute("position");
      const uv=geometry.getAttribute("uv");
      const norm=geometry.getAttribute("normal");
      const color=geometry.getAttribute("color");
      const ids=geometry.getAttribute("skinIndex");
      const weightsAttr=geometry.getAttribute("skinWeight");
      for(let i=0;i<pos.count;i++){
        for(let k=0;k<3;k++){
          expect(Number.isFinite(pos.getComponent(i,k))).toBe(true);
          expect(Number.isFinite(norm.getComponent(i,k))).toBe(true);
          expect(Number.isFinite(color.getComponent(i,k))).toBe(true);
        }
        for(let k=0;k<2;k++)expect(Number.isFinite(uv.getComponent(i,k))).toBe(true);
        let sum=0;
        for(let k=0;k<4;k++){
          const index=ids.getComponent(i,k),w=weightsAttr.getComponent(i,k);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(human.spike.skeleton.bones.length);
          expect(w).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(w)).toBe(true);
          sum+=w;
        }
        expect(sum).toBeCloseTo(1,5);
      }
      const faces=geometry.getIndex()!;
      let degenerate=0;
      const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
      for(let i=0;i<faces.count;i+=3){
        a.fromBufferAttribute(pos,faces.getX(i));
        b.fromBufferAttribute(pos,faces.getX(i+1));
        c.fromBufferAttribute(pos,faces.getX(i+2));
        if(new THREE.Vector3().subVectors(b,a).cross(
          new THREE.Vector3().subVectors(c,a)).lengthSq()<1e-14)degenerate++;
      }
      expect(degenerate).toBe(0);
    }finally{human.dispose();}
  },120_000);

  it("remains deterministic and updates mouth under canonical jaw FK without shifting the cranial nose",()=>{
    const outputs:string[]=[];
    for(let iteration=0;iteration<2;iteration++){
      const human=create();
      try{
        applyHumanMorphology(human,createMammalianHeadRecipe("primate",{
          muzzleLength:1.12,muzzleWidth:1.07,earSize:1.08,
        }));
        const replacement=getVanaraHeadReplacement(human)!;
        const positions=replacement.mesh.geometry.getAttribute("position").array;
        outputs.push(Array.from(positions as ArrayLike<number>).map(x=>x.toFixed(5)).join(","));
        const landmark=getMammalianHeadLandmarks(human)!;
        const mouth=landmark.mouthWorld().clone(),nose=landmark.noseWorld().clone();
        const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
          jawTipWorldRest:human.jawTipWorldRest,
          forearmSkinBones:human.spike.forearmSkinBones,
          shoulderSkinBones:human.spike.shoulderSkinBones,
        });
        const jaw=human.spike.graph.joints.find(j=>j.role==="jaw")!;
        fk.apply([{jointId:jaw.id,motion:"flexion",radians:.40}]);
        expect(landmark.mouthWorld().distanceTo(mouth)).toBeGreaterThan(.001);
        expect(landmark.noseWorld().distanceTo(nose)).toBeLessThan(1e-5);
        fk.apply([]);
        expect(landmark.mouthWorld().distanceTo(mouth)).toBeLessThan(1e-5);
        expect(landmark.noseWorld().distanceTo(nose)).toBeLessThan(1e-5);
        const material=replacement.mesh.material as THREE.Material;
        const geometry=replacement.mesh.geometry;
        human.dispose();
        human.dispose();
        expect(geometry.getAttribute("position")).toBeDefined();
        expect(material).toBeDefined();
      }finally{human.dispose();}
    }
    expect(outputs[0]).toEqual(outputs[1]);
  },120_000);
});
