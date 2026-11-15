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
      const side=primary==="right"?"left":"right";
      const v=(role:string)=>bone(model,role).getWorldPosition(new THREE.Vector3())
        .toArray().map(x=>Number(x.toFixed(4)));
      console.log("C5.2-REST",primary,JSON.stringify({
        chest:v("chest"),shoulder:v("shoulder_"+primary),
        primaryPalm:v("palm_"+primary),secondaryPalm:v("palm_"+side),
      }));
      const graph=human.spike.graph;
      const angles=(side:"left"|"right",shoulder:number,abduct:number,
        elbow:number):readonly {jointId:string;motion:"flexion"|"abduction";radians:number}[]=>{
        const j=(role:string)=>graph.joints.find(j=>j.role===role+"_"+side)!.id;
        return [
          {jointId:j("shoulder"),motion:"flexion" as const,radians:shoulder},
          {jointId:j("shoulder"),motion:"abduction" as const,radians:abduct},
          {jointId:j("elbow"),motion:"flexion" as const,radians:elbow},
        ];
      };
      for(const [sf,sa,ef] of [[1,.4,1.2],[1.5,.6,1.5],[.7,1.2,1.8],
        [1.9,.3,1.2]]){
        fk.apply([...angles("left",sf!,sa!,ef!),...angles("right",sf!,sa!,ef!)]);
        console.log("C5.2-SEED",primary,sf,sa,ef,JSON.stringify({
          left:v("palm_left"),right:v("palm_right"),
          distance:bone(model,"palm_left").getWorldPosition(new THREE.Vector3())
            .distanceTo(bone(model,"palm_right").getWorldPosition(new THREE.Vector3())),
        }));
      }
      let bestSeed={distance:Infinity,description:"",y:0,z:0};
      for(const abduct of [-.3,.4,1,1.6,2.2])
        for(const flex of [-.5,.5,1.5])
          for(const rotation of [-1.2,0,1.2])
            for(const elbow of [.6,1.5,2.35]){
              const joint=(hand:"left"|"right",role:string)=>
                graph.joints.find(j=>j.role===role+"_"+hand)!.id;
              const trial=(hand:"left"|"right")=>[
                {jointId:joint(hand,"shoulder"),motion:"abduction" as const,radians:abduct},
                {jointId:joint(hand,"shoulder"),motion:"flexion" as const,radians:flex},
                {jointId:joint(hand,"shoulder"),motion:"rotation" as const,radians:rotation},
                {jointId:joint(hand,"elbow"),motion:"flexion" as const,radians:elbow}];
              fk.apply([...trial("left"),...trial("right")]);
              const a=bone(model,"palm_left").getWorldPosition(new THREE.Vector3());
              const b=bone(model,"palm_right").getWorldPosition(new THREE.Vector3());
              const distance=a.distanceTo(b);
              if(a.y<1.15||a.y>1.85||Math.abs(a.z)>.42)continue;
              if(distance<bestSeed.distance)bestSeed={
                distance,description:[abduct,flex,rotation,elbow].join(","),
                y:a.y,z:a.z};
            }
      console.log("C5.2-BEST-SEED",primary,JSON.stringify(bestSeed));
      fk.apply([]);
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
