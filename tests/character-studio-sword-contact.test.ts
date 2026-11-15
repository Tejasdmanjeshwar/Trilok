import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import * as THREE from "three";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ,type AnatomicalHuman} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {MakeHumanBodyController,validateBodyWeights,type BodyAtlas,type BodyWeights}
  from "../apps/web/src/characters/geometry/MakeHumanBodyTargets";
import {AnatomicalFK} from "../apps/web/src/characters/geometry/AnatomicalFK";
import {calibrateGripSpreads,swordGripTargets,StudioSwordPreview}
  from "../apps/web/src/studio/StudioWeaponGrip";
import {StudioPosePreview} from "../apps/web/src/studio/StudioPosePreview";
import type {StudioHumanModel} from "../apps/web/src/studio/StudioHumanModel";
import type {SourceRig,SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

type Hand="left"|"right";
type Digit="thumb"|"index"|"middle"|"ring"|"little";
const DIGITS:readonly Digit[]=["thumb","index","middle","ring","little"];
const asset=(file:string)=>readFileSync(
  new URL("../apps/web/public/anatomy/"+file,import.meta.url),"utf8");
const template=()=>parseAnatomicalOBJ(asset("makehuman-base.obj"),{includeGroups:["body"]});
const sourceRig=()=>JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
const sourceWeights=()=>JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
const atlas=JSON.parse(readFileSync("assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
function create(weights:BodyWeights={}):{human:AnatomicalHuman;model:StudioHumanModel}{
  validateBodyWeights(weights);
  const human=bindTemplateToSemanticRig(template(),
    {rig:sourceRig(),weights:sourceWeights()});
  if(Object.keys(weights).length){
    const ctrl=new MakeHumanBodyController(human,atlas);
    try{
      const result=ctrl.apply(weights);
      expect(result.finiteFailures).toBe(0);
      expect(result.seamMismatches).toBe(0);
    }finally{ctrl.dispose();}
  }
  return {human,model:{human,sourceJawOpeningRadians:0} as StudioHumanModel};
}

interface DigitMeasure {
  readonly eligible:number;
  readonly axialNear:number;
  readonly closestGap:number;
  readonly deepestPenetration:number;
  readonly contactVertices:number;
}
interface GripGeometryReport {
  readonly radius:number;
  readonly length:number;
  readonly digits:Readonly<Record<Digit,DigitMeasure>>;
  readonly guardSkinClearance:number;
  readonly guardPenetration:number;
  readonly wristGuardClearance:number;
  readonly wristGuardPenetration:number;
}
/** Conservative geometric regression gate, measured in meters.
 * Prevents lost digits, entire-finger displacement through a handle, and
 * guard/wrist intersections. It is NOT a 1-2mm physical-contact guarantee:
 * the visually accepted source-handle poses have larger thumb residuals. */
function assertGripRegression(report:GripGeometryReport):void{
  finiteReport(report);
  const nearLimit=Math.max(.010,report.radius*.75);
  const penetrationLimit=Math.max(.005,report.radius*.85);
  let contacts=0;
  for(const digit of DIGITS){
    const d=report.digits[digit];
    expect(d.closestGap, digit+" exceeds calibrated handle proximity")
      .toBeLessThan(nearLimit);
    expect(d.deepestPenetration,digit+" clips through calibrated handle")
      .toBeLessThan(penetrationLimit);
    contacts+=d.contactVertices;
  }
  expect(contacts,"no source fingers contact the handle").toBeGreaterThan(3);
  expect(report.guardPenetration,"finger intersects solid crossguard").toBeLessThan(.003);
  expect(report.wristGuardPenetration,"wrist intersects crossguard").toBeLessThan(.003);
  expect(report.wristGuardClearance,"crossguard too near wrist").toBeGreaterThan(.002);
}
function finiteReport(report:GripGeometryReport):void {
  for(const value of [report.radius,report.length,report.guardSkinClearance,
    report.guardPenetration,report.wristGuardClearance,report.wristGuardPenetration])
    expect(Number.isFinite(value)).toBe(true);
  for(const d of DIGITS){
    const m=report.digits[d];
    expect(m.eligible,d+" source skin").toBeGreaterThan(40);
    expect(m.axialNear,d+" near handle").toBeGreaterThan(0);
    expect(Number.isFinite(m.closestGap),d+" gap").toBe(true);
    expect(Number.isFinite(m.deepestPenetration),d+" penetration").toBe(true);
  }
}
/** CPU-skinned source mesh vs actual local handle cylinder / crossguard box.
 * These are vertex probes, not triangle-swept continuous collision detection.
 * They are sampled after source FK and morphology on the real MakeHuman hand. */
function measure(human:AnatomicalHuman,sword:StudioSwordPreview,hand:Hand):GripGeometryReport{
  const {spike,mesh}=human;
  spike.character.root.updateWorldMatrix(true,true);
  const skinned=mesh.geometry;
  const skinIndex=skinned.getAttribute("skinIndex");
  const skinWeight=skinned.getAttribute("skinWeight");
  const inverse=sword.object.matrix.clone().invert();
  const transformScale=new THREE.Vector3(),quaternion=new THREE.Quaternion();
  const center=new THREE.Vector3();
  sword.object.matrix.decompose(center,quaternion,transformScale);
  const scale=transformScale.x;
  const radius=sword.descriptor.handleRadiusMeters/scale;
  const length=sword.descriptor.handleLengthMeters/scale;
  const groupBones=new Map<string,Set<number>>();
  const roles=[...DIGITS,"wrist"] as const;
  for(const role of roles){
    const ids=spike.graph.joints.filter(j=>
      role==="wrist"?j.role==="wrist_"+hand:
        j.role.startsWith("finger_"+role+"_")&&j.id.includes("arm["+hand+",0]"));
    groupBones.set(role,new Set(ids.map(j=>
      spike.skeleton.bones.indexOf(spike.bones.get(j.id)!))));
  }
  const output=new Map<Digit,{eligible:number;axialNear:number;
    closestGap:number;deepestPenetration:number;contactVertices:number}>();
  for(const digit of DIGITS)output.set(digit,{
    eligible:0,axialNear:0,closestGap:Infinity,
    deepestPenetration:0,contactVertices:0,
  });
  let guardSkinClearance=Infinity,guardPenetration=0;
  let wristGuardClearance=Infinity,wristGuardPenetration=0;
  const guardY=length*.57;
  const half=[.145/2,.018/2,.024/2] as const;
  const v=new THREE.Vector3();
  const evaluated=new Set<number>();
  for(let i=0;i<skinIndex.count;i++){
    const sourceId=human.template.sourceVertexIds[i]!;
    if(evaluated.has(sourceId))continue;
    evaluated.add(sourceId);
    const membership=roles.map(role=>{
      let total=0;
      const joints=groupBones.get(role)!;
      for(let k=0;k<4;k++)
        if(joints.has(skinIndex.getComponent(i,k)))total+=skinWeight.getComponent(i,k);
      return total;
    });
    const wrist=membership[5]!>=.6;
    const finger=membership.slice(0,5).some(n=>n>=.6);
    if(!wrist&&!finger)continue;
    mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
    const dx=Math.abs(v.x)-half[0];
    const dy=Math.abs(v.y-guardY)-half[1];
    const dz=Math.abs(v.z)-half[2];
    const external=Math.hypot(Math.max(dx,0),Math.max(dy,0),Math.max(dz,0));
    const penetrating=Math.max(0,Math.min(-dx,-dy,-dz));
    if(finger){
      guardSkinClearance=Math.min(guardSkinClearance,external);
      guardPenetration=Math.max(guardPenetration,penetrating);
    }
    if(wrist){
      wristGuardClearance=Math.min(wristGuardClearance,external);
      wristGuardPenetration=Math.max(wristGuardPenetration,penetrating);
    }
    for(let d=0;d<DIGITS.length;d++){
      if(membership[d]!<.6)continue;
      const digit=DIGITS[d]!,m=output.get(digit)!;
      m.eligible++;
      if(Math.abs(v.y)>length/2+.012/scale)continue;
      m.axialNear++;
      const radial=Math.hypot(v.x,v.z);
      m.closestGap=Math.min(m.closestGap,Math.abs(radial-radius)*scale);
      m.deepestPenetration=Math.max(m.deepestPenetration,Math.max(0,radius-radial)*scale);
      if(Math.abs(radial-radius)*scale<=.003)m.contactVertices++;
    }
  }
  return {
    radius:sword.descriptor.handleRadiusMeters,
    length:sword.descriptor.handleLengthMeters,
    digits:Object.fromEntries(output) as unknown as Readonly<Record<Digit,DigitMeasure>>,
    guardSkinClearance:guardSkinClearance*scale,
    guardPenetration:guardPenetration*scale,
    wristGuardClearance:wristGuardClearance*scale,
    wristGuardPenetration:wristGuardPenetration*scale,
  };
}
function pose(human:AnatomicalHuman,hand:Hand):void{
  const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
    jawTipWorldRest:human.jawTipWorldRest,
    forearmSkinBones:human.spike.forearmSkinBones,
    shoulderSkinBones:human.spike.shoulderSkinBones,
  });
  const spreads=calibrateGripSpreads(human.spike.graph,human.spike.bones,fk.frames,hand);
  fk.apply(swordGripTargets(human.spike.graph,hand,spreads));
}
const cases:readonly {id:string;weights:BodyWeights}[]=[
  {id:"unmodified source",weights:{}},
  {id:"female",weights:{"macro/sex":0}},
  {id:"male",weights:{"macro/sex":1}},
  {id:"short",weights:{"macro/height":0}},
  {id:"tall",weights:{"macro/height":1}},
  {id:"light",weights:{"macro/weight":0}},
  {id:"heavy",weights:{"macro/weight":1}},
  {id:"low muscle",weights:{"macro/muscle":0}},
  {id:"high muscle",weights:{"macro/muscle":1}},
  {id:"left hand wide",weights:{"native/armslegs/l-hand-scale-decr-incr":1}},
  {id:"right hand narrow",weights:{"native/armslegs/r-hand-scale-decr-incr":-1}},
  {id:"short fingers",weights:{"native/armslegs/l-hand-fingers-length-decr-incr":-1}},
  {id:"long fingers",weights:{"native/armslegs/r-hand-fingers-length-decr-incr":1}},
  {id:"infant",weights:{"macro/age":.06}},
  {id:"supported mixed",weights:{"macro/age":.5,"macro/height":1,
    "macro/weight":1,"macro/muscle":1,
    "native/armslegs/l-hand-scale-decr-incr":1,
    "native/armslegs/r-hand-scale-decr-incr":-1}},
];

describe("C5.1 actual MakeHuman grip geometry",()=>{
  it.each(["left","right"] as const)(
    "measures %s source skin and guard with geometric bounds",hand=>{
      const {human,model}=create();
      try{
        pose(human,hand);
        const sword=new StudioSwordPreview(model,hand);
        try{
          const report=measure(human,sword,hand);
          console.log("C5.1-CONTACT",JSON.stringify({case:"unmodified source",hand,...report}));
          finiteReport(report);
          // Distances are physical meters, and assertions are deliberately
          // separate from the strict art/contact tolerances still being calibrated.
          expect(report.guardPenetration).toBeLessThan(.003);
          expect(report.wristGuardPenetration).toBeLessThan(.003);
          expect(report.wristGuardClearance).toBeGreaterThan(.002);
        }finally{sword.dispose();}
      }finally{human.dispose();}
    },120_000);
  it.each(cases)("covers source morphology: $id",({id,weights})=>{
    for(const hand of ["left","right"] as const){
      // Each imported MakeHuman skeleton must be calibrated in neutral rest.
      // This also prevents a posed hand leaking into the opposite-side case.
      const {human,model}=create(weights);
      try{
        pose(human,hand);
        const sword=new StudioSwordPreview(model,hand);
        try{
          const report=measure(human,sword,hand);
          console.log("C5.1-MORPHOLOGY",JSON.stringify({case:id,hand,...report}));
          assertGripRegression(report);
        }finally{sword.dispose();}
      }finally{human.dispose();}
    }
  },120_000);
});
