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
import {createTwoHandDescriptor,twoHandDimensions,TWO_HAND_REFERENCE,solveTwoHandIK,StudioTwoHandPreview,
  type HandSide,type TwoHandWeapon,twoHandSolvedContactWorld} from "../apps/web/src/studio/StudioTwoHandGrip";
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
        delta1:first.primaryDeltaMeters,delta2:first.secondaryDeltaMeters,
        axis1:first.primaryAxisDot,axisAlignment:first.secondaryAxisDot,
        iterations:first.iterations}));
      expect(first.reachable,"both source hands must actually meet on the weapon").toBe(true);
      expect(first.headClearanceMeters).toBeGreaterThan(.19);
      expect(first.elbowMaxHeightMeters).toBeLessThan(first.headHeightMeters-.12);
      expect(first.maximumPalmHeightMeters).toBeLessThan(first.headHeightMeters-.18);
      expect(first.iterations).toBeLessThanOrEqual(24);
      expect(first.primaryErrorMeters).toBeLessThan(.025);
      expect(first.secondaryErrorMeters).toBeLessThan(.025);
      expect(root.matrixWorld.elements).toEqual(original.elements);
      const second=solveTwoHandIK(model,fk,[],primary);
      expect(second.reason).toBe(first.reason);
      expect(second.primaryErrorMeters).toBeCloseTo(first.primaryErrorMeters,8);
      expect(second.secondaryErrorMeters).toBeCloseTo(first.secondaryErrorMeters,8);
      expect(second.commands.map(c=>[c.jointId,c.motion,c.radians]))
        .toEqual(first.commands.map(c=>[c.jointId,c.motion,c.radians]));
      if(first.reachable)for(const kind of ["longsword","staff"] as const){
        fk.apply([]);
        const solved=solveTwoHandIK(model,fk,[],primary,kind);
        expect(solved.reachable,kind+" must solve its own fixed grips").toBe(true);
        const preview=new StudioTwoHandPreview(model,kind,primary,solved);
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
          const lead=twoHandSolvedContactWorld(model,primary,solved);
          const follower=twoHandSolvedContactWorld(model,
            primary==="left"?"right":"left",solved);
          expect(contact(solved.dimensions.primaryGripY).distanceTo(lead)).toBeLessThan(.006);
          expect(contact(solved.dimensions.secondaryGripY).distanceTo(follower))
            .toBeLessThan(.025);
          root.position.set(.23,.12,-.31);root.rotation.y=.34;
          root.updateWorldMatrix(true,true);
          preview.update();
          expect(contact(solved.dimensions.primaryGripY).distanceTo(
            twoHandSolvedContactWorld(model,primary,solved)))
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
          if(!solved!.reachable){
            // Extreme source poses can be unreachable on one lead while
            // reachable on the mirror. Verify only such exceptional poses
            // reject safely instead of forcing bones beyond legal limits.
            expect(id,"only incompatible extreme poses may reject").toBe("whole-extreme");
            expect(solved!.reason).not.toBe("ok");
          }else{
            expect(solved!.primaryErrorMeters).toBeLessThan(.023);
            expect(solved!.secondaryErrorMeters).toBeLessThan(.025);
            expect(solved!.primaryAxisDot).toBeGreaterThan(.42);
            expect(solved!.secondaryAxisDot).toBeGreaterThan(.45);
          }
          expect(root.matrixWorld.elements).toEqual(rootBefore.elements);
        }
        preview.setGrip("none");
        preview.setPose("neutral");
        expect(palm.quaternion.angleTo(restRotation)).toBeLessThan(1e-7);
      }finally{preview.dispose();human.dispose();}
    },120_000);
  it.each([
    ["longsword","left"],["longsword","right"],
    ["staff","left"],["staff","right"],
  ] as const)("equips %s on %s lead in every supported Studio pose",(kind,lead)=>{
    const {human,model}=fixture();
    const pose=new StudioPosePreview(model);
    try{
      const root=human.spike.character.root.matrixWorld.clone();
      pose.setGrip((kind+"-"+lead) as "longsword-left"|"longsword-right"|
        "staff-left"|"staff-right");
      const failures:string[]=[];
      for(const id of Object.keys(STUDIO_POSES) as (keyof typeof STUDIO_POSES)[]){
        pose.setPose(id);
        const solved=pose.twoHandResult;
        if(!solved?.reachable){
          failures.push(id+"/"+(solved?.reason??"missing")+"/"+JSON.stringify(solved?.reachDiagnostics?.slice(-6)));
          continue;
        }
        expect(solved.primaryErrorMeters).toBeLessThanOrEqual(.023);
        expect(solved.secondaryErrorMeters).toBeLessThanOrEqual(.023);
        expect(solved.dimensions.primaryGripY-solved.dimensions.secondaryGripY)
          .toBeCloseTo(solved.separationMeters,8);
        expect(human.spike.character.root.matrixWorld.elements)
          .toEqual(root.elements);
      }
      expect(failures,kind+"/"+lead+" missing Studio poses").toEqual([]);
    }finally{pose.dispose();human.dispose();}
  },120_000);
  it.each(["right","left"] as const)(
    "maintains distinct natural low sword and staff guards (%s lead)",primary=>{
      const {human,model,fk}=fixture();
      try{
        const outcomes=[] as ReturnType<typeof solveTwoHandIK>[];
        for(const kind of ["longsword","staff"] as const){
          const pose=solveTwoHandIK(model,fk,[],primary,kind);
          expect(pose.reachable,kind+" failed source contact").toBe(true);
          expect(pose.secondaryErrorMeters).toBeLessThan(.025);
          expect(pose.secondaryAxisDot).toBeGreaterThan(.45);
          expect(pose.headClearanceMeters).toBeGreaterThan(.19);
          expect(pose.elbowMaxHeightMeters).toBeLessThan(pose.headHeightMeters-.12);
          expect(pose.maximumPalmHeightMeters).toBeLessThan(pose.headHeightMeters-.18);
          expect(pose.separationMeters).toBeCloseTo(pose.dimensions.primaryGripY-pose.dimensions.secondaryGripY,9);
          outcomes.push(pose);
          fk.apply([]);
        }
        // Weapon-specific stance is defined by authored shaft inclination
        // and fixed grip spacing, not an arbitrary 5cm palm-height delta.
        const swordAxis=new THREE.Vector3(0,1,0)
          .transformDirection(outcomes[0]!.weaponWorld);
        const staffAxis=new THREE.Vector3(0,1,0)
          .transformDirection(outcomes[1]!.weaponWorld);
        // Staff is now deliberately an inclined two-hand guard rather than
        // the old near-horizontal presentation. Keep both guards anatomically
        // below the head while requiring a visible upward staff inclination.
        expect(swordAxis.y).toBeGreaterThan(.45);
        expect(staffAxis.y).toBeGreaterThan(.60);
        expect(outcomes[1]!.separationMeters)
          .toBeGreaterThan(outcomes[0]!.separationMeters*2);
      }finally{human.dispose();}
    },120_000);
  it("enforces authoritative weapon dimensions and grip transforms independently of palms",()=>{
    const {human,model,fk}=fixture();
    try{
      for(const kind of ["longsword","staff"] as const){
        const blueprint=TWO_HAND_REFERENCE[kind];
        const before=twoHandDimensions(model,kind);
        for(const side of ["left","right"] as const){
          const answer=solveTwoHandIK(model,fk,[],side,kind);
          const after=twoHandDimensions(model,kind);
          expect(after).toEqual(before);
          expect(answer.dimensions.handleLength).toBeCloseTo(blueprint.handleLength*before.scale,9);
          expect(answer.dimensions.bladeLength).toBeCloseTo(blueprint.bladeLength*before.scale,9);
          expect(answer.dimensions.shaftLength).toBeCloseTo(blueprint.shaftLength*before.scale,9);
          expect(answer.separationMeters).toBeCloseTo(
            (blueprint.primaryGripY-blueprint.secondaryGripY)*before.scale,9);
          expect(answer.weaponWorld.elements.every(Number.isFinite)).toBe(true);
          if(kind==="longsword"){
            expect(after.bladeLength/after.handleLength).toBeGreaterThan(2.8);
            expect(after.primaryGripY).toBeLessThan(after.handleLength/2);
            expect(after.secondaryGripY).toBeGreaterThan(-after.handleLength/2);
          }else expect(after.shaftLength).toBeGreaterThan(answer.separationMeters*2);
          fk.apply([]);
        }
      }
    }finally{human.dispose();}
  },120_000);
  it("diagnoses weapon-specific authored neutral reach without forced root movement",()=>{
    const {human,model,fk}=fixture();
    try{
      for(const kind of ["longsword","staff"] as const)
        for(const side of ["right","left"] as const){
          const result=solveTwoHandIK(model,fk,[],side,kind);
          console.log("C52-NEUTRAL-STANCE",JSON.stringify({kind,side,
            reachable:result.reachable,position:result.secondaryErrorMeters,
            d1:result.primaryDeltaMeters,d2:result.secondaryDeltaMeters,
            axis1:result.primaryAxisDot,
            axis:result.secondaryAxisDot,iterations:result.iterations,
            elbowY:result.elbowMaxHeightMeters,headY:result.headHeightMeters,
            maximumPalmY:result.maximumPalmHeightMeters,
            headClearance:result.headClearanceMeters,reason:result.reason}));
        }
    }finally{human.dispose();}
  },120_000);

});
