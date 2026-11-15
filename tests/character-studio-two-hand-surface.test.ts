import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {readFileSync} from "node:fs";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {MakeHumanBodyController,type BodyAtlas} from
  "../apps/web/src/characters/geometry/MakeHumanBodyTargets";
import {AnatomicalFK} from "../apps/web/src/characters/geometry/AnatomicalFK";
import {solveTwoHandIK,type HandSide} from "../apps/web/src/studio/StudioTwoHandGrip";
import type {StudioHumanModel} from "../apps/web/src/studio/StudioHumanModel";
import type {SourceRig,SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

const load=(name:string)=>readFileSync("apps/web/public/anatomy/"+name,"utf8");
const atlas=JSON.parse(readFileSync("assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
function make(body:Readonly<Record<string,number>>={}){
  const human=bindTemplateToSemanticRig(
    parseAnatomicalOBJ(load("makehuman-base.obj"),{includeGroups:["body"]}),{
      rig:JSON.parse(load("makehuman-default.mhskel")) as SourceRig,
      weights:JSON.parse(load("makehuman-default_weights.mhw")) as SourceWeights});
  if(Object.keys(body).length){
    const morph=new MakeHumanBodyController(human,atlas);
    try{expect(morph.apply(body).finiteFailures).toBe(0);}
    finally{morph.dispose();}
  }
  const model={human,sourceJawOpeningRadians:0} as StudioHumanModel;
  const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
    jawTipWorldRest:human.jawTipWorldRest,
    forearmSkinBones:human.spike.forearmSkinBones,
    shoulderSkinBones:human.spike.shoulderSkinBones,
  });
  return {human,model,fk};
}
/** Measure the ACTUAL skinned MakeHuman finger / palm geometry against
 * the staff cylinder. A palm-bone or knuckle-axis dot is not a collision test.
 * Measurements intentionally remain diagnostics until the candidate is
 * validated against rendered reference images. */
function measureStaff(model:StudioHumanModel,hand:HandSide,
  weapon:THREE.Matrix4,radius:number,gripY:number){
  const {mesh,spike}=model.human;
  spike.character.root.updateWorldMatrix(true,true);
  const indices=mesh.geometry.getAttribute("skinIndex");
  const weights=mesh.geometry.getAttribute("skinWeight");
  const fingers=["thumb","index","middle","ring","little"];
  const groups=[...fingers,"palm"] as const;
  const boneSets=groups.map(digit=>new Set(spike.graph.joints.filter(j=>
    digit==="palm"?j.role==="palm_"+hand:
      j.role.startsWith("finger_"+digit+"_")&&j.id.includes("arm["+hand+",0]"))
    .map(j=>spike.skeleton.bones.indexOf(spike.bones.get(j.id)!))));
  const results=groups.map(digit=>({
    digit,eligible:0,axialNear:0,closestGap:Infinity,
    deepestPenetration:0,nearContact:0,
  }));
  const inverse=weapon.clone().invert();
  const vertex=new THREE.Vector3();
  const unique=new Set<number>();
  for(let i=0;i<indices.count;i++){
    const source=model.human.template.sourceVertexIds[i]!;
    if(unique.has(source))continue;
    unique.add(source);
    const influences=boneSets.map(set=>{
      let total=0;
      for(let k=0;k<4;k++)
        if(set.has(indices.getComponent(i,k)))
          total+=weights.getComponent(i,k);
      return total;
    });
    if(influences.every(w=>w<.6))continue;
    mesh.getVertexPosition(i,vertex).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
    const along=Math.abs(vertex.y-gripY);
    const radial=Math.hypot(vertex.x,vertex.z);
    for(let d=0;d<groups.length;d++){
      if(influences[d]!<.6)continue;
      const report=results[d]!;
      report.eligible++;
      // Nearby shaft segment, not the entire weapon length.
      if(along>.065)continue;
      report.axialNear++;
      report.closestGap=Math.min(report.closestGap,Math.abs(radial-radius));
      report.deepestPenetration=Math.max(report.deepestPenetration,
        Math.max(0,radius-radial));
      if(Math.abs(radial-radius)<.003)report.nearContact++;
    }
  }
  return results;
}
describe("C5.2 staff source-skinned contact diagnostics",()=>{
  it.each(["right","left"] as const)("measures source skin against one staff (%s)",lead=>{
    const {human,model,fk}=make();
    try{
      const result=solveTwoHandIK(model,fk,[],lead,"staff");
      expect(result.reachable).toBe(true);
      const contacts=[lead,lead==="right"?"left":"right"] as const;
      for(let i=0;i<contacts.length;i++){
        const hand=contacts[i]!;
        const report=measureStaff(model,hand,result.weaponWorld,
          result.dimensions.radius,i===0?result.dimensions.primaryGripY:
            result.dimensions.secondaryGripY);
        console.log("C52-STAFF-SKIN",JSON.stringify({hand,lead,report}));
        for(const digit of report){
          expect(digit.eligible).toBeGreaterThan(0);
          expect(Number.isFinite(digit.deepestPenetration)).toBe(true);
        }
      }
    }finally{human.dispose();}
  },120_000);
  it.each([
    {name:"short",morph:{"macro/height":0}},
    {name:"tall",morph:{"macro/height":1}},
  ])("diagnoses anatomy-aware reach on $name source model",({name,morph})=>{
    const {human,model,fk}=make(morph);
    try{
      for(const kind of ["longsword","staff"] as const)
        for(const lead of ["left","right"] as const){
          const outcome=solveTwoHandIK(model,fk,[],lead,kind);
          console.log("C52-VARIATION-REACH",JSON.stringify({
            name,kind,lead,reachable:outcome.reachable,
            primaryError:outcome.primaryErrorMeters,
            secondaryError:outcome.secondaryErrorMeters,
            primaryAxis:outcome.primaryAxisDot,
            secondaryAxis:outcome.secondaryAxisDot,
            reason:outcome.reason,
          }));
          expect(Number.isFinite(outcome.primaryErrorMeters)).toBe(true);
        }
    }finally{human.dispose();}
  },120_000);
});
