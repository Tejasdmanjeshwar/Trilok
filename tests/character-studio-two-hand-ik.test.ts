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
import {StudioPosePreview} from "../apps/web/src/studio/StudioPosePreview";
import {STUDIO_POSES} from "../apps/web/src/studio/StudioInspection";
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
      console.log("C5.2-IK",primary,JSON.stringify({
        reachable:first.reachable,error:first.secondaryErrorMeters,
        axisAlignment:first.secondaryAxisDot,iterations:first.iterations}));
      expect(first.reachable,"both source hands must actually meet on the weapon").toBe(true);
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
          expect(human.spike.graph.sockets.find(x=>
            x.id===preview.descriptor.primarySocket)?.purpose).toBe("primary_grip");
          expect(human.spike.graph.sockets.find(x=>
            x.id===preview.descriptor.secondarySocket)?.purpose).toBe("secondary_grip");
          const current=preview.object.matrix.clone();
          preview.update();
          expect(preview.object.matrix.elements).toEqual(current.elements);
          const contact=(offset:number)=>new THREE.Vector3(
            0,offset,0).applyMatrix4(preview.object.matrix);
          const lead=bone(model,"palm_"+primary).getWorldPosition(new THREE.Vector3());
          const follower=bone(model,"palm_"+(primary==="left"?"right":"left"))
            .getWorldPosition(new THREE.Vector3());
          expect(contact(first.separationMeters/2).distanceTo(lead)).toBeLessThan(.006);
          expect(contact(-first.separationMeters/2).distanceTo(follower))
            .toBeLessThan(.025);
          root.position.set(.23,.12,-.31);root.rotation.y=.34;
          root.updateWorldMatrix(true,true);
          preview.update();
          expect(contact(first.separationMeters/2).distanceTo(
            bone(model,"palm_"+primary).getWorldPosition(new THREE.Vector3())))
            .toBeLessThan(.006);
          root.position.set(0,0,0);root.rotation.y=0;
          root.updateWorldMatrix(true,true);
        }finally{preview.dispose();}
      }
    }finally{human.dispose();}
  },120_000);
  it.each(["right","left"] as const)(
    "holds %s primary across every Studio pose with deterministic rest recovery",primary=>{
      const {human,model}=fixture();
      const preview=new StudioPosePreview(model);
      const root=human.spike.character.root;
      try{
        const rootBefore=root.matrixWorld.clone();
        const palm=bone(model,"palm_"+primary);
        const restRotation=palm.quaternion.clone();
        preview.setGrip(primary==="right"?"longsword-right":"staff-left");
        for(const id of Object.keys(STUDIO_POSES) as (keyof typeof STUDIO_POSES)[]){
          preview.setPose(id);
          const solved=preview.twoHandResult;
          expect(solved,"missing two-hand IK "+id).toBeDefined();
          expect(solved!.reachable,"unreachable Studio pose "+id).toBe(true);
          expect(solved!.secondaryErrorMeters).toBeLessThan(.025);
          expect(solved!.secondaryAxisDot).toBeGreaterThan(.45);
          expect(root.matrixWorld.elements).toEqual(rootBefore.elements);
        }
        preview.setGrip("none");
        preview.setPose("neutral");
        expect(palm.quaternion.angleTo(restRotation)).toBeLessThan(1e-7);
      }finally{preview.dispose();human.dispose();}
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
          expect(result.iterations).toBeLessThanOrEqual(28);
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
  it("diagnoses source FK candidates for low sword and staff authored poses",()=>{
    const {human,model,fk}=fixture();
    try{
      const graph=human.spike.graph;
      const id=(side:"left"|"right",role:string)=>graph.joints.find(j=>j.role===role+"_"+side)!.id;
      const wp=(role:string)=>bone(model,role).getWorldPosition(new THREE.Vector3());
      const c=(side:"left"|"right",role:string,motion:"abduction"|"flexion"|"rotation",radians:number)=>({
        jointId:id(side,role),motion,radians,
      });
      for(const kind of ["sword","staff"] as const){
        for(const hand of ["right","left"] as const){
          const side=hand==="right"?1:-1;
          const targets=kind==="sword"?
            [{x:side*.075,y:1.28,z:.28,mark:"upper"},
              {x:side*.025,y:1.16,z:.29,mark:"lower"}]:
            [{x:side*.19,y:1.32,z:.30,mark:"outer"},
              {x:side*.15,y:1.18,z:.28,mark:"inner"}];
          for(const goal of targets){
            const best:{score:number;v:number[];p:number[];e:number[]}[]=[];
            for(const sa of [.15,.6,1,1.4,1.8,2.3])
              for(const sf of [-.8,-.4,0,.4,.8,1.3,1.8])
                for(const sr of [-1.1,0,1.1])
                  for(const ef of [.4,1.0,1.5,2.0,2.4]){
                    fk.apply([c(hand,"shoulder","abduction",sa),
                      c(hand,"shoulder","flexion",sf),c(hand,"shoulder","rotation",sr),
                      c(hand,"elbow","flexion",ef)]);
                    const p=wp("palm_"+hand),e=wp("elbow_"+hand);
                    const dx=p.x-goal.x,dy=p.y-goal.y,dz=p.z-goal.z;
                    const ep=(
                      Math.max(0,e.y-1.48)*2.0+
                      Math.max(0,-side*e.x+.10)*1.2+
                      Math.max(0,1.02-e.y)*1.0);
                    const score=Math.hypot(dx,dy,dz)+ep;
                    if(best.length<5||score<best[best.length-1]!.score){
                      best.push({score,v:[sa,sf,sr,ef],
                        p:p.toArray(),e:e.toArray()});
                      best.sort((a,b)=>a.score-b.score);
                      if(best.length>5)best.pop();
                    }
                  }
            console.log("C52-AUTHOR-SEARCH",JSON.stringify({kind,hand,mark:goal.mark,
              goal,best:best.map(t=>({...t,score:+t.score.toFixed(4),
                p:t.p.map(x=>+x.toFixed(3)),e:t.e.map(x=>+x.toFixed(3))}))}));
          }
        }
      }
    }finally{human.dispose();}
  },120_000);

});
