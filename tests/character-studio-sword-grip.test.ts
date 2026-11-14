import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import * as THREE from "three";
import {createSkinningSpike} from "../apps/web/src/characters/geometry/SkinningSpike";
import {AnatomicalFK} from "../apps/web/src/characters/geometry/AnatomicalFK";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import type {SourceRig,SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";
import {StudioSwordPreview,calibrateGripSpreads,swordGripTargets,validateWeaponGrip} from
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
    fk.apply(swordGripTargets(rig.graph,hand,
      calibrateGripSpreads(rig.graph,rig.bones,fk.frames,hand)));
    const weapon=new StudioSwordPreview(model,hand);
    // The blade/handle axis must cross the fist, not run along the wrist
    // toward the fingertips (the visually incorrect prior construction).
    const pos=(role:string):THREE.Vector3=>{
      const joint=rig.graph.joints.find(j=>j.role===role&&
        (role.startsWith("finger_")?j.id.includes("arm["+hand+",0]"):true))!;
      return rig.bones.get(joint.id)!.getWorldPosition(new THREE.Vector3());
    };
    rig.character.root.updateWorldMatrix(true,true);
    const axis=new THREE.Vector3(0,1,0).transformDirection(weapon.object.matrix);
    const fingerDirection=pos("finger_middle_0").sub(pos("wrist_"+hand)).normalize();
    const knuckleLine=pos("finger_index_0").sub(pos("finger_little_0")).normalize();
    expect(Math.abs(axis.dot(fingerDirection))).toBeLessThan(.12);
    expect(axis.dot(knuckleLine)).toBeGreaterThan(.95);
    validateWeaponGrip(weapon.descriptor,rig.graph);
    expect(weapon.object.children.length).toBeGreaterThan(6);
    const initial=weapon.object.matrix.clone();
    const wrist=rig.graph.joints.find(j=>j.role==="wrist_"+hand)!;
    fk.apply([...swordGripTargets(rig.graph,hand,
      calibrateGripSpreads(rig.graph,rig.bones,fk.frames,hand)),
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
  it.each(["left","right"] as const)("measures %s source-skinned finger contact against the actual handle",hand=>{
    const {human,rig,model}=realHand();
    try{
      const fk=new AnatomicalFK(rig.graph,rig.bones,{
        jawTipWorldRest:human.jawTipWorldRest,
        forearmSkinBones:rig.forearmSkinBones,
        shoulderSkinBones:rig.shoulderSkinBones,
      });
      fk.apply(swordGripTargets(rig.graph,hand,
        calibrateGripSpreads(rig.graph,rig.bones,fk.frames,hand)));
      const sword=new StudioSwordPreview(model,hand);
      try{
        rig.character.root.updateWorldMatrix(true,true);
        const center=new THREE.Vector3(),rotation=new THREE.Quaternion(),
          localScale=new THREE.Vector3();
        sword.object.matrix.decompose(center,rotation,localScale);
        const axis=new THREE.Vector3(0,1,0).applyQuaternion(rotation).normalize();
        const skinIds=human.mesh.geometry.getAttribute("skinIndex");
        const skinWeights=human.mesh.geometry.getAttribute("skinWeight");
        const vertex=new THREE.Vector3();
        for(const digit of ["thumb","index","middle","ring","little"]){
          const fingerBones=new Set(rig.graph.joints.filter(j=>
            j.role.startsWith("finger_"+digit+"_")&&
            j.id.includes("arm["+hand+",0]")).map(j=>
            rig.skeleton.bones.indexOf(rig.bones.get(j.id)!)));
          let count=0,near=0,closest=Infinity,deepest=0;
          for(let i=0;i<skinIds.count;i++){
            const influence=[0,1,2,3].reduce((sum,k)=>
              sum+(fingerBones.has(skinIds.getComponent(i,k))?
                skinWeights.getComponent(i,k):0),0);
            if(influence<.6)continue;
            count++;
            const world=human.mesh.getVertexPosition(i,vertex).applyMatrix4(
              human.mesh.matrixWorld);
            const delta=world.clone().sub(center);
            const axial=delta.dot(axis);
            if(Math.abs(axial)>sword.descriptor.handleLengthMeters*.5+.014)continue;
            near++;
            const radial=delta.addScaledVector(axis,-axial).length();
            closest=Math.min(closest,Math.abs(radial-sword.descriptor.handleRadiusMeters));
            deepest=Math.max(deepest,sword.descriptor.handleRadiusMeters-radial);
          }
          console.log("C5-SKIN-HANDLE",hand,digit,
            "vertices",count,"axial-near",near,
            "nearest-residual-m",Number.isFinite(closest)?closest.toFixed(5):"none",
            "deepest-penetration-m",deepest.toFixed(5));
          expect(count).toBeGreaterThan(40);
          expect(Number.isFinite(closest)).toBe(true);
        }
      }finally{sword.dispose();}
    }finally{human.dispose();}
  },60_000);
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
