import {expect} from "vitest";
import * as THREE from "three";
import {readFileSync} from "node:fs";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from
  "../../apps/web/src/characters/geometry/AnatomicalTemplate";
import {MakeHumanBodyController,type BodyAtlas} from
  "../../apps/web/src/characters/geometry/MakeHumanBodyTargets";
import {AnatomicalFK} from "../../apps/web/src/characters/geometry/AnatomicalFK";
import {generateStudioCharacter} from "../../apps/web/src/studio/StudioGenerator";
import {applyHumanMorphology} from "../../apps/web/src/characters/geometry/HumanMorphology";
import {createHumanHeadRecipe} from "../../packages/character-core/src/index";
import {solveTwoHandIK,type HandSide} from "../../apps/web/src/studio/StudioTwoHandGrip";
import type {StudioHumanModel} from "../../apps/web/src/studio/StudioHumanModel";
import type {SourceRig,SourceWeights} from
  "../../apps/web/src/characters/geometry/OfficialHumanRig";

const load=(name:string)=>readFileSync("apps/web/public/anatomy/"+name,"utf8");
const atlas=JSON.parse(readFileSync("assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
export function make(body:Readonly<Record<string,number>>={},shape?:ReturnType<typeof generateStudioCharacter>["morphology"]["shape"]){
  const human=bindTemplateToSemanticRig(
    parseAnatomicalOBJ(load("makehuman-base.obj"),{includeGroups:["body"]}),{
      rig:JSON.parse(load("makehuman-default.mhskel")) as SourceRig,
      weights:JSON.parse(load("makehuman-default_weights.mhw")) as SourceWeights});
  if(shape)applyHumanMorphology(human,createHumanHeadRecipe(shape));
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
export function measureStaff(model:StudioHumanModel,hand:HandSide,
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
export function diagnoseArmReach(model:StudioHumanModel,result:ReturnType<typeof solveTwoHandIK>){
  const root=model.human.spike.character.root;
  root.updateWorldMatrix(true,true);
  const points=Object.fromEntries((["right","left"] as const).map(hand=>{
    const at=(role:string)=>{
      const id=model.human.spike.graph.joints.find(j=>j.role===role+"_"+hand)!.id;
      return model.human.spike.bones.get(id)!.getWorldPosition(new THREE.Vector3());
    };
    const shoulder=at("shoulder"),elbow=at("elbow"),wrist=at("wrist"),palm=at("palm");
    const reach=shoulder.distanceTo(elbow)+elbow.distanceTo(wrist)+wrist.distanceTo(palm);
    const target=new THREE.Vector3(0,hand==="right"?
      result.dimensions.primaryGripY:result.dimensions.secondaryGripY,0)
      .applyMatrix4(result.weaponWorld);
    return [hand,{shoulder:shoulder.toArray(),elbow:elbow.toArray(),
      wrist:wrist.toArray(),palm:palm.toArray(),
      upper:shoulder.distanceTo(elbow),lower:elbow.distanceTo(wrist),
      reach,targetDistance:shoulder.distanceTo(target)}];
  }));
  return points;
}
