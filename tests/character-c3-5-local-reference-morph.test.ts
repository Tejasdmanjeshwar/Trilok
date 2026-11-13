import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {createMammalianHeadRecipe} from "../packages/character-core/src/index";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {applyHumanMorphology} from
  "../apps/web/src/characters/geometry/HumanMorphology";
import {applyLocalVanaraReferenceMorph} from
  "../apps/web/src/characters/geometry/LocalVanaraReferenceMorph";
import {validateSkinningSpike} from
  "../apps/web/src/characters/geometry/SkinningSpike";
import type {SourceRig,SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

const asset=(file:string)=>readFileSync(
  new URL("../apps/web/public/anatomy/"+file,import.meta.url),"utf8");
const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
function makeHuman(){
  return bindTemplateToSemanticRig(parseAnatomicalOBJ(
    asset("makehuman-base.obj"),{includeGroups:["body"]}),
    {rig,weights,headFamily:"primate"});
}
function syntheticReference():THREE.BufferGeometry{
  const vertices:number[]=[];
  const stepsX=48,stepsY=48;
  const surface=(x:number,y:number)=>[
    x,y,2+0.12*Math.exp(-((x-.15)/.34)**2-((y-2.8)/.55)**2)
      +.055*Math.exp(-((x+.7)/.34)**2-((y-3.7)/.45)**2)
  ] as const;
  for(let iy=0;iy<stepsY;iy++)
    for(let ix=0;ix<stepsX;ix++){
      const x0=-2+4*ix/stepsX,x1=-2+4*(ix+1)/stepsX;
      const y0=5*iy/stepsY,y1=5*(iy+1)/stepsY;
      const a=surface(x0,y0),b=surface(x1,y0);
      const c=surface(x0,y1),d=surface(x1,y1);
      vertices.push(...a,...b,...c,...b,...d,...c);
    }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
  return geometry;
}
const options={sourceWindow:{xMin:-2,xMax:2,yMin:0,yMax:5}} as const;

describe("C3.5 private STL-guided continuous C2 morph",()=>{
  it("deforms existing face only, retains the entire indexed skin/neck and regenerates deterministically",()=>{
    const reference=syntheticReference();
    const a=makeHuman(),b=makeHuman();
    try{
      for(const human of [a,b]){
        applyHumanMorphology(human,createMammalianHeadRecipe("primate"));
      }
      const geometry=a.mesh.geometry,positions=geometry.getAttribute("position");
      const sourceIds=Array.from(a.template.sourceVertexIds);
      const indices=Array.from(geometry.getIndex()!.array);
      const uv=Array.from(geometry.getAttribute("uv").array);
      const skinBefore=Array.from(geometry.getAttribute("skinWeight").array);
      const joints=a.spike.graph.joints.map(j=>j.id);
      const before=Float32Array.from(positions.array as ArrayLike<number>);
      const stats=applyLocalVanaraReferenceMorph(a,reference,options);
      const statsB=applyLocalVanaraReferenceMorph(b,reference,options);
      expect(stats.modifiedVertices).toBeGreaterThan(25);
      expect(stats.maximumDisplacementMeters).toBeLessThanOrEqual(.033);
      expect(stats.neckPreservedVertices).toBeGreaterThan(0);
      expect(stats.sourceFaces).toBeGreaterThan(100);
      expect(stats).toEqual(statsB);
      expect(Array.from(geometry.getAttribute("position").array)).toEqual(
        Array.from(b.mesh.geometry.getAttribute("position").array));
      expect(Array.from(a.template.sourceVertexIds)).toEqual(sourceIds);
      expect(Array.from(geometry.getIndex()!.array)).toEqual(indices);
      expect(Array.from(geometry.getAttribute("uv").array)).toEqual(uv);
      expect(Array.from(geometry.getAttribute("skinWeight").array)).toEqual(skinBefore);
      expect(a.spike.graph.joints.map(j=>j.id)).toEqual(joints);
      expect(a.spike.character.root.scale.toArray()).toEqual([1,1,1]);
      let maxDelta=0,unchanged=0;
      for(let i=0;i<positions.count;i++){
        const oldZ=before[3*i+2]!;
        const delta=Math.abs(oldZ-positions.getZ(i));
        maxDelta=Math.max(maxDelta,delta);
        if(delta<1e-8)unchanged++;
        expect(positions.getX(i)).toBeCloseTo(before[3*i]!,7);
        expect(positions.getY(i)).toBeCloseTo(before[3*i+1]!,7);
      }
      expect(maxDelta).toBeGreaterThan(1e-5);
      expect(unchanged).toBeGreaterThan(stats.neckPreservedVertices);
      validateSkinningSpike(a.spike);
    }finally{reference.dispose();a.dispose();b.dispose();}
  },120_000);
  it("rejects insufficient reference topology, unsafe crop and strength",()=>{
    const a=makeHuman(),ref=syntheticReference();
    try{
      applyHumanMorphology(a,createMammalianHeadRecipe("primate"));
      expect(()=>applyLocalVanaraReferenceMorph(a,ref,{
        ...options,strength:1.5,
      })).toThrow(/strength/);
      expect(()=>applyLocalVanaraReferenceMorph(a,ref,{
        sourceWindow:{xMin:1,xMax:1,yMin:0,yMax:5},
      })).toThrow(/window/);
      const bad=new THREE.BufferGeometry();
      expect(()=>applyLocalVanaraReferenceMorph(a,bad)).toThrow();
      bad.dispose();
    }finally{a.dispose();ref.dispose();}
  },120_000);
});
