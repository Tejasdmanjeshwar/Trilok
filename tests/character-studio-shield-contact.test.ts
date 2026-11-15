import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import * as THREE from "three";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {MakeHumanBodyController,type BodyAtlas} from
  "../apps/web/src/characters/geometry/MakeHumanBodyTargets";
import type {SourceRig,SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";
import type {StudioHumanModel} from "../apps/web/src/studio/StudioHumanModel";
import {StudioPosePreview} from "../apps/web/src/studio/StudioPosePreview";
import {StudioSwordPreview} from "../apps/web/src/studio/StudioWeaponGrip";
import {StudioShieldPreview,validateShieldAttachment,shieldHand}
  from "../apps/web/src/studio/StudioShieldGrip";

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
  return {human,model};
}
describe("sword and shield source-skin attachments",()=>{
  it.each(["right","left"] as const)("mirrored %s sword and opposite shield share one source rig",side=>{
    const {human,model}=fixture();
    const pose=new StudioPosePreview(model);
    const root=human.spike.character.root;
    try{
      const original=root.matrixWorld.clone();
      pose.setGrip(("sword-shield-"+side) as "sword-shield-left"|"sword-shield-right");
      const result=pose.shieldPoseResult;
      expect(result).toBeDefined();
      expect(result!.reachable,"mirrored shield guard must be attainable").toBe(true);
      expect(result!.iterations).toBeLessThanOrEqual(32);
      expect(result!.commands.length).toBeGreaterThan(15);
      const sword=new StudioSwordPreview(model,side);
      const shield=new StudioShieldPreview(model,shieldHand(side));
      try{
        validateShieldAttachment(shield.descriptor,human.spike.graph);
        expect(shield.descriptor.hand).toBe(shieldHand(side));
        expect(sword.descriptor.hand).toBe(side);
        expect(shield.contact.sourceHandVertices).toBeGreaterThan(30);
        expect(shield.contact.sourceForearmVertices).toBeGreaterThan(30);
        expect(shield.contact.plateSkinClearanceMeters).toBeGreaterThan(-.005);
        expect(shield.contact.forearmStrapClearanceMeters.every(d=>d>.001)).toBe(true);
        expect(shield.contact.gripGapMeters).toBeLessThan(.04);
        expect(shield.contact.torsoClearanceMeters).toBeGreaterThan(-.005);
        expect(root.matrixWorld.elements).toEqual(original.elements);
        const a=shield.object.matrix.clone(),b=sword.object.matrix.clone();
        shield.update();sword.update();
        expect(shield.object.matrix.elements).toEqual(a.elements);
        expect(sword.object.matrix.elements).toEqual(b.elements);
        root.position.set(.23,.1,-.31);root.rotation.y=.37;
        shield.update();sword.update();
        expect(shield.object.matrix.equals(a)).toBe(false);
        expect(sword.object.matrix.equals(b)).toBe(false);
        root.position.set(0,0,0);root.rotation.y=0;
        root.updateWorldMatrix(true,true);
      }finally{shield.dispose();sword.dispose();}
      pose.setGrip("none");pose.setPose("neutral");
      expect(pose.shieldPoseResult).toBeUndefined();
    }finally{pose.dispose();human.dispose();}
  },120_000);
  it.each(["guard","attack-ready","parry"] as const)(
    "uses independently bounded arm pose for %s stance",stance=>{
      const {human,model}=fixture();
      const pose=new StudioPosePreview(model);
      try{
        pose.setGrip("sword-shield-right");
        pose.setShieldStance(stance);
        const first=pose.shieldPoseResult!;
        expect(first).toBeDefined();
        expect(first.reachable,stance+" shield must have legal arm reach").toBe(true);
        expect(Number.isFinite(first.wristErrorMeters)).toBe(true);
        const stable=first.commands.map(c=>[c.jointId,c.motion,c.radians]);
        pose.refresh();
        expect(pose.shieldPoseResult!.commands.map(c=>[c.jointId,c.motion,c.radians]))
          .toEqual(stable);
      }finally{pose.dispose();human.dispose();}
    },120_000);
  it.each([
    {"macro/weight":1},
    {"macro/height":0},
    {"macro/height":1},
    {"macro/muscle":1},
  ])("measures source body skin for shield contact: %j",body=>{
    const {human,model}=fixture(Object.fromEntries(Object.entries(body).filter(([,v])=>v!==undefined)));
    const pose=new StudioPosePreview(model);
    try{
      pose.setGrip("sword-shield-right");
      expect(pose.shieldPoseResult?.reachable,"extreme morphology requires shield reach").toBe(true);
      const shield=new StudioShieldPreview(model,"left");
      try{
        expect(shield.contact.plateSkinClearanceMeters).toBeGreaterThan(-.005);
        expect(shield.contact.torsoClearanceMeters).toBeGreaterThan(-.005);
        const skin=human.mesh.geometry.getAttribute("skinIndex");
        expect(skin.count).toBeGreaterThan(1000);
      }finally{shield.dispose();}
    }finally{pose.dispose();human.dispose();}
  },120_000);
});
