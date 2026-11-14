import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import * as THREE from "three";
import {createSkinningSpike} from "../apps/web/src/characters/geometry/SkinningSpike";
import {AnatomicalFK} from "../apps/web/src/characters/geometry/AnatomicalFK";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import type {SourceRig,SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";
import {StudioSwordPreview,swordGripTargets,validateWeaponGrip} from
  "../apps/web/src/studio/StudioWeaponGrip";
import type {StudioHumanModel} from "../apps/web/src/studio/StudioHumanModel";

const asset=(file:string)=>readFileSync(
  new URL("../apps/web/public/anatomy/"+file,import.meta.url),"utf8");
function realHand(){
  const template=parseAnatomicalOBJ(asset("makehuman-base.obj"),
    {includeGroups:["body"]});
  const sourceRig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
  const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
  const human=bindTemplateToSemanticRig(template,{rig:sourceRig,weights});
  const rig=human.spike;
  return {human,rig,model:{human} as StudioHumanModel};
}
describe("single-hand sword contracts",()=>{
  it.each(["left","right"] as const)("resolves %s hand source-calibrated finger joints",hand=>{
    const rig=createSkinningSpike();
    const commands=swordGripTargets(rig.graph,hand);
    expect(commands).toHaveLength(15);
    expect(new Set(commands.map(c=>c.jointId+"/"+c.motion)).size).toBe(commands.length);
    expect(commands.every(c=>c.jointId.includes("arm["+hand+",0]"))).toBe(true);
    const fk=new AnatomicalFK(rig.graph,rig.bones);
    fk.apply(commands);
    for(const c of commands){
      const bounds=fk.frames.get(c.jointId)?.freedoms.get(c.motion);
      expect(bounds).toBeDefined();
      expect(c.radians).toBeGreaterThanOrEqual(bounds!.min);
      expect(c.radians).toBeLessThanOrEqual(bounds!.max);
    }
    rig.dispose();
  });
  it.each(["left","right"] as const)("keeps %s sword on live semantic socket during FK and root movement",hand=>{
    const {human,rig,model}=realHand();
    const fk=new AnatomicalFK(rig.graph,rig.bones,{
      jawTipWorldRest:human.jawTipWorldRest,
      forearmSkinBones:rig.forearmSkinBones,
      shoulderSkinBones:rig.shoulderSkinBones,
    });
    fk.apply(swordGripTargets(rig.graph,hand));
    const weapon=new StudioSwordPreview(model,hand);
    validateWeaponGrip(weapon.descriptor,rig.graph);
    expect(weapon.object.children.length).toBeGreaterThan(6);
    const initial=weapon.object.matrix.clone();
    const wrist=rig.graph.joints.find(j=>j.role==="wrist_"+hand)!;
    fk.apply([...swordGripTargets(rig.graph,hand),
      {jointId:wrist.id,motion:"flexion",radians:.32}]);
    weapon.update();
    expect(weapon.object.matrix.equals(initial)).toBe(false);
    const reference=weapon.object.matrix.clone();
    weapon.update();
    expect(weapon.object.matrix.elements).toEqual(reference.elements);
    rig.character.root.position.set(.2,.13,-.4);
    rig.character.root.rotation.y=.45;
    weapon.update();
    expect(weapon.object.matrix.equals(reference)).toBe(false);
    expect(weapon.object.matrix.elements.every(Number.isFinite)).toBe(true);
    weapon.dispose();
    expect(weapon.object.parent).toBeNull();
    human.dispose();
  });
  it("rejects invalid socket ownership and unsafe handle dimensions",()=>{
    const rig=createSkinningSpike();
    const hand="right" as const;
    const socket=rig.graph.sockets.find(s=>s.purpose==="primary_grip"&&
      s.id.includes("arm[right,0]"))!;
    const valid={schemaVersion:1 as const,id:"sword/right",weaponKind:"sword" as const,
      hand,socketId:socket.id,handleRadiusMeters:.012,handleLengthMeters:.11};
    expect(()=>validateWeaponGrip(valid,rig.graph)).not.toThrow();
    expect(()=>validateWeaponGrip({...valid,handleRadiusMeters:Infinity},rig.graph)).toThrow();
    expect(()=>validateWeaponGrip({...valid,hand:"left"},rig.graph)).toThrow();
    rig.dispose();
  });
});
