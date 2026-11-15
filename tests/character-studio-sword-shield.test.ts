import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import * as THREE from "three";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {AnatomicalFK} from "../apps/web/src/characters/geometry/AnatomicalFK";
import type {SourceRig,SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";
import type {StudioHumanModel} from "../apps/web/src/studio/StudioHumanModel";
import {StudioPosePreview} from "../apps/web/src/studio/StudioPosePreview";
import {SHIELD_STANCES,StudioShieldPreview,shieldSocket,solveIndependentGrips,
  measureSkinnedForearm,validateShieldDescriptor} from
  "../apps/web/src/studio/StudioSwordShield";
import {StudioBodyCollision} from "../apps/web/src/studio/StudioBodyCollision";

const source=(name:string)=>readFileSync("apps/web/public/anatomy/"+name,"utf8");
function fixture(){
  const template=parseAnatomicalOBJ(source("makehuman-base.obj"),{includeGroups:["body"]});
  const human=bindTemplateToSemanticRig(template,{
    rig:JSON.parse(source("makehuman-default.mhskel")) as SourceRig,
    weights:JSON.parse(source("makehuman-default_weights.mhw")) as SourceWeights});
  const model={human,sourceJawOpeningRadians:0} as StudioHumanModel;
  const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
    jawTipWorldRest:human.jawTipWorldRest,
    forearmSkinBones:human.spike.forearmSkinBones,
    shoulderSkinBones:human.spike.shoulderSkinBones});
  return {human,model,fk};
}
describe("independent sword and shield contracts",()=>{
  it("provides mirrored, uniquely owned semantic shield attachment sockets",()=>{
    const {human,model}=fixture();
    try{
      const a=shieldSocket(model,"left"),b=shieldSocket(model,"right");
      expect(a).not.toBe(b);
      expect(human.spike.graph.sockets.filter(s=>s.purpose==="shield")).toHaveLength(2);
    }finally{human.dispose();}
  });
  it.each(["left","right"] as const)(
    "uses deterministic source anatomical IK and skin contact on %s sword hand",hand=>{
    const {human,model,fk}=fixture();
    try{
      const root=human.spike.character.root;
      root.updateWorldMatrix(true,true);
      const initial=root.matrixWorld.clone();
      const first=solveIndependentGrips(model,fk,[],hand,"guard");
      expect(first.iterations).toBeLessThanOrEqual(44);
      expect(first.swordHand).toBe(hand);
      expect(first.shieldHand).not.toBe(hand);
      expect(first.descriptor.contact.hand).toBe(first.shieldHand);
      expect(first.descriptor.widthMeters).toBeGreaterThan(.07);
      expect(first.descriptor.heightMeters).toBeGreaterThan(.12);
      validateShieldDescriptor(first.descriptor,human.spike.graph);
      expect(root.matrixWorld.elements).toEqual(initial.elements);
      expect(first.commands.every(c=>Number.isFinite(c.radians))).toBe(true);
      if(first.reachable){
        expect(first.minimumClearanceMeters).toBeGreaterThan(-.006);
        // A shield is a guarding surface, not a plate edge-on to an opponent.
        const face=new THREE.Vector3(0,0,1).transformDirection(first.shieldWorld);
        const forward=new THREE.Vector3(0,0,1).applyQuaternion(
          root.getWorldQuaternion(new THREE.Quaternion()));
        expect(face.dot(forward)).toBeGreaterThan(.95);
        const shield=new StudioShieldPreview(model,first);
        try{
          expect(shield.object.children.length).toBeGreaterThan(4);
          const prior=shield.object.matrix.clone();
          shield.update();
          expect(shield.object.matrix.elements).toEqual(prior.elements);
          root.position.set(.2,.1,-.25);
          root.rotation.y=.32;
          root.updateWorldMatrix(true,true);
          shield.update();
          const frame=human.spike.character.socketWorld(first.descriptor.contact.socketId);
          expect(frame.determinant()).not.toBe(0);
        }finally{shield.dispose();}
      }else expect(first.reason).not.toBe("ok");
      root.position.set(0,0,0);root.rotation.y=0;
      const second=solveIndependentGrips(model,fk,[],hand,"guard");
      expect(second.reason).toBe(first.reason);
      expect(second.commands).toEqual(first.commands);
    }finally{human.dispose();}
  },120_000);
  it("samples the skinned forearm and morphed torso rather than guessed macros",()=>{
    const {human,model,fk}=fixture();
    try{
      fk.apply([]);
      const sample=measureSkinnedForearm(model,"left",new THREE.Vector3(0,0,1));
      expect(sample.sampleCount).toBeGreaterThan(17);
      expect(sample.radius).toBeGreaterThan(0);
      expect(new StudioBodyCollision(model).sourceTriangleCount).toBeGreaterThan(250);
    }finally{human.dispose();}
  });
  it("keeps preview pose transitions independent and safe to dispose",()=>{
    const {human,model}=fixture();
    const preview=new StudioPosePreview(model);
    try{
      preview.setGrip("sword-shield-right");
      for(const stance of Object.keys(SHIELD_STANCES) as (keyof typeof SHIELD_STANCES)[]){
        preview.setShieldStance(stance);
        expect(preview.independentResult).toBeDefined();
        expect(preview.independentResult!.commands.every(c=>Number.isFinite(c.radians))).toBe(true);
      }
      preview.setGrip("right");
      expect(preview.independentResult).toBeUndefined();
      preview.setGrip("none");
    }finally{preview.dispose();human.dispose();}
  },120_000);
});
