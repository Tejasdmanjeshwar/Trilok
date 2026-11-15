import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {readFileSync} from "node:fs";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {AnatomicalFK} from "../apps/web/src/characters/geometry/AnatomicalFK";
import {MakeHumanBodyController,type BodyAtlas} from
  "../apps/web/src/characters/geometry/MakeHumanBodyTargets";
import type {SourceRig,SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";
import {createTwoHandDescriptor,solveTwoHandIK,StudioTwoHandPreview,
  type HandSide,type TwoHandWeapon} from "../apps/web/src/studio/StudioTwoHandGrip";
import type {StudioHumanModel} from "../apps/web/src/studio/StudioHumanModel";
const source=(name:string)=>readFileSync("apps/web/public/anatomy/"+name,"utf8");
const atlas=JSON.parse(readFileSync("assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
function fixture(body:Readonly<Record<string,number>>={}){
  const template=parseAnatomicalOBJ(source("makehuman-base.obj"),{includeGroups:["body"]});
  const human=bindTemplateToSemanticRig(template,{
    rig:JSON.parse(source("makehuman-default.mhskel")) as SourceRig,
    weights:JSON.parse(source("makehuman-default_weights.mhw")) as SourceWeights});
  if(Object.keys(body).length){
    const morph=new MakeHumanBodyController(human,atlas);
    try{expect(morph.apply(body).finiteFailures).toBe(0);}finally{morph.dispose();}
  }
  const model={human,sourceJawOpeningRadians:0} as StudioHumanModel;
  const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
    jawTipWorldRest:human.jawTipWorldRest,
    forearmSkinBones:human.spike.forearmSkinBones,
    shoulderSkinBones:human.spike.shoulderSkinBones});
  return {human,model,fk};
}
function bone(model:StudioHumanModel,role:string):THREE.Bone{
  const j=model.human.spike.graph.joints.find(j=>j.role===role)!;
  return model.human.spike.bones.get(j.id)!;
}
describe("C5.2 two-hand source-anatomical reach",()=>{
  it.each(["right","left"] as const)("solves mirrored %s lead deterministically",primary=>{
    const {human,model,fk}=fixture();
    try{
      const root=human.spike.character.root;
      const original=root.matrixWorld.clone();
      const first=solveTwoHandIK(model,fk,[],primary);
      console.log("C5.2-IK",primary,JSON.stringify(first));
      expect(first.iterations).toBeLessThanOrEqual(24);
      expect(first.primaryErrorMeters).toBeLessThan(.15);
      expect(first.secondaryErrorMeters).toBeLessThan(.15);
      expect(root.matrixWorld.elements).toEqual(original.elements);
      const second=solveTwoHandIK(model,fk,[],primary);
      expect(second.reason).toBe(first.reason);
      expect(second.primaryErrorMeters).toBeCloseTo(first.primaryErrorMeters,8);
      expect(second.secondaryErrorMeters).toBeCloseTo(first.secondaryErrorMeters,8);
      expect(second.commands.map(c=>[c.jointId,c.motion,c.radians]))
        .toEqual(first.commands.map(c=>[c.jointId,c.motion,c.radians]));
      if(first.reachable)for(const kind of ["longsword","staff"] as const){
        const preview=new StudioTwoHandPreview(model,kind,primary,first);
        try{
          expect(preview.object.children.length).toBeGreaterThan(4);
          expect(preview.descriptor.primary).toBe(primary);
          expect(preview.descriptor.secondary).not.toBe(primary);
          const current=preview.object.matrix.clone();
          preview.update();
          expect(preview.object.matrix.elements).toEqual(current.elements);
        }finally{preview.dispose();}
      }
    }finally{human.dispose();}
  },120_000);
  it("adapts socket spacing to native hand proportions",()=>{
    const samples:Readonly<Record<string,number>>[]=[{},{"macro/height":0},{"macro/height":1},
      {"native/armslegs/l-hand-scale-decr-incr":1},
      {"native/armslegs/r-hand-scale-decr-incr":-1}];
    for(const weights of samples){
      const {human,model,fk}=fixture(weights);
      try{
        for(const primary of ["left","right"] as const){
          const result=solveTwoHandIK(model,fk,[],primary);
          console.log("C5.2-MORPH",JSON.stringify({weights,primary,
            reachable:result.reachable,primaryError:result.primaryErrorMeters,
            secondaryError:result.secondaryErrorMeters,
            reason:result.reason}));
          expect(result.iterations).toBeLessThanOrEqual(24);
          expect(Number.isFinite(result.primaryErrorMeters)).toBe(true);
          expect(Number.isFinite(result.secondaryErrorMeters)).toBe(true);
          if(result.reachable){
            const desc=createTwoHandDescriptor(model,"staff",primary,result.separationMeters);
            expect(desc.primarySocket).not.toBe(desc.secondarySocket);
          }else expect(result.commands).toHaveLength(0);
        }
      }finally{human.dispose();}
    }
  },120_000);
});
