import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {readFileSync} from "node:fs";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {MakeHumanBodyController,type BodyAtlas} from
  "../apps/web/src/characters/geometry/MakeHumanBodyTargets";
import {AnatomicalFK} from "../apps/web/src/characters/geometry/AnatomicalFK";
import {solveTwoHandIK,StudioTwoHandPreview,twoHandSolvedContactWorld,type HandSide} from "../apps/web/src/studio/StudioTwoHandGrip";
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
      if(lead==="right"){
        // Diagnose the two independent surface-contact channels without
        // changing FK or weapon geometry. This finds why a shaft centered on
        // a palm-bone proxy visually cuts through the source skin.
        for(const hand of ["right","left"] as const){
          const get=(role:string)=>{
            const j=human.spike.graph.joints.find(j=>j.role===role &&
              (role.startsWith("finger_")?j.id.includes("arm["+hand+",0]"):true))!;
            return human.spike.bones.get(j.id)!.getWorldPosition(new THREE.Vector3());
          };
          const forward=get("finger_middle_0").sub(get("wrist_"+hand)).normalize();
          const across=get("finger_index_0").sub(get("finger_little_0"));
          const knuckle=across.clone().addScaledVector(forward,-across.dot(forward)).normalize();
          const normal=forward.clone().negate().cross(knuckle).normalize();
          const offsetY=hand===lead?result.dimensions.primaryGripY:result.dimensions.secondaryGripY;
          const ranked:{forward:number;normal:number;score:number;report:ReturnType<typeof measureStaff>}[]=[];
          for(const x of [-.030,-.015,0,.015,.030])
            for(const z of [-.030,-.015,0,.015,.030]){
              const shifted=result.weaponWorld.clone();
              shifted.setPosition(new THREE.Vector3().setFromMatrixPosition(shifted)
                .addScaledVector(forward,x).addScaledVector(normal,z));
              const report=measureStaff(model,hand,shifted,result.dimensions.radius,offsetY);
              const palm=report.find(d=>d.digit==="palm")!;
              const fingers=report.filter(d=>d.digit!=="palm");
              const score=palm.deepestPenetration*9+
                fingers.reduce((sum,d)=>sum+d.deepestPenetration*4+
                  (Number.isFinite(d.closestGap)?d.closestGap:0)*.25,0)+
                (Math.abs(x)+Math.abs(z))*.08;
              ranked.push({forward:x,normal:z,score,report});
            }
          ranked.sort((a,b)=>a.score-b.score);
          console.log("C52-STAFF-SURFACE-SEARCH",JSON.stringify({
            hand,forward:forward.toArray(),normal:normal.toArray(),
            best:ranked.slice(0,4).map(r=>({
              forward:r.forward,normal:r.normal,score:r.score,
              palm:r.report.find(d=>d.digit==="palm")?.deepestPenetration,
              gaps:r.report.filter(d=>d.digit!=="palm").map(d=>d.closestGap),
              clip:r.report.filter(d=>d.digit!=="palm").map(d=>d.deepestPenetration),
            })),
          }));
        }
      }
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
  ])("requires anatomy-aware reach on $name source model",({name,morph})=>{
    const {human,model,fk}=make(morph);
    try{
      const failed:string[]=[];
      for(const kind of ["longsword","staff"] as const)
        for(const lead of ["left","right"] as const){
          const outcome=solveTwoHandIK(model,fk,[],lead,kind);
          console.log("C52-VARIATION-REACH",JSON.stringify({
            name,kind,lead,reachable:outcome.reachable,
            primaryError:outcome.primaryErrorMeters,
            secondaryError:outcome.secondaryErrorMeters,
            primaryAxis:outcome.primaryAxisDot,
            secondaryAxis:outcome.secondaryAxisDot,
            initialSpan:outcome.initialHandSpanMeters,
            gripSpan:outcome.separationMeters,
            reason:outcome.reason,attempts:outcome.reachDiagnostics,
          }));
          expect(Number.isFinite(outcome.primaryErrorMeters)).toBe(true);
          expect(outcome.weaponWorld.elements.every(Number.isFinite)).toBe(true);
          if(outcome.reachable){
            expect(outcome.primaryErrorMeters).toBeLessThanOrEqual(.023);
            expect(outcome.secondaryErrorMeters).toBeLessThanOrEqual(.023);
            expect(outcome.separationMeters).toBeCloseTo(
              outcome.dimensions.primaryGripY-outcome.dimensions.secondaryGripY,9);
            expect(outcome.dimensions.handleLength/outcome.dimensions.bladeLength>0 ||
              outcome.dimensions.shaftLength>0).toBe(true);
            const preview=new StudioTwoHandPreview(model,kind,lead,outcome);
            try{
              expect(preview.object.children.length).toBeGreaterThan(0);
              expect(preview.descriptor.dimensions).toEqual(outcome.dimensions);
              const axis=new THREE.Vector3(0,1,0).transformDirection(outcome.weaponWorld);
              const primaryGrip=new THREE.Vector3(0,outcome.dimensions.primaryGripY,0)
                .applyMatrix4(preview.object.matrix);
              const secondaryGrip=new THREE.Vector3(0,outcome.dimensions.secondaryGripY,0)
                .applyMatrix4(preview.object.matrix);
              expect(primaryGrip.clone().sub(secondaryGrip).normalize().dot(axis))
                .toBeGreaterThan(.999);
              expect(primaryGrip.distanceTo(
                twoHandSolvedContactWorld(model,lead,outcome))).toBeLessThanOrEqual(.023);
            }finally{preview.dispose();}
          }
          // Report all failures without hiding unsupported anatomies behind
          // a green diagnostic-only test. Never weaken the grip thresholds.
          if(!outcome.reachable)failed.push(
            kind+"/"+lead+": "+outcome.reason+
            " ("+Math.round(outcome.primaryErrorMeters*1000)+"mm, "+
            Math.round(outcome.secondaryErrorMeters*1000)+"mm)");
        }
      expect(failed,"all source anatomies must equip both grips").toEqual([]);
    }finally{human.dispose();}
  },120_000);
});
