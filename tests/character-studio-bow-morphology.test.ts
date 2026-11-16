import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {StudioPosePreview} from "../apps/web/src/studio/StudioPosePreview";
import {generateStudioCharacter} from "../apps/web/src/studio/StudioGenerator";
import {make} from "./helpers/studio-two-hand-fixtures";

/** C5.4 is not proven by one nominal human: source morphs change the real
 * palm skin, reach, elbow folds and shape-dependent contact radii.
 * An unreachable extreme must report a safe fallback, not a false success.
 */
const variants=[
  {name:"short and light",body:{"macro/height":0,"macro/weight":0,"macro/muscle":0}},
  {name:"tall and muscular",body:{"macro/height":1,"macro/weight":1,"macro/muscle":1}},
  {name:"wide shoulders",body:{"native/torso/torso-scale-horiz-decr-incr":1}},
  {name:"asymmetric hand length",body:{
    "native/armslegs/l-hand-scale-decr-incr":1,
    "native/armslegs/r-hand-scale-decr-incr":-1}},
  {name:"seed 9813",body:Object.fromEntries(
    Object.entries(generateStudioCharacter(9813).morphology.body)
      .filter(([id])=>id.startsWith("macro/")))},
] as const;

describe("C5.4 source-skinned bow morphology and fallback",()=>{
  it.each(variants)("preserves deterministic finite contact on $name source",({name,body})=>{
    const {human,model}=make(body);
    const root=human.spike.character.root;
    root.updateWorldMatrix(true,true);
    const initialRoot=root.matrixWorld.clone();
    const pose=new StudioPosePreview(model);
    try{
      for(const side of ["left","right"] as const){
        pose.setGrip(side==="left"?"bow-left":"bow-right");
        for(const state of ["rest","nock","partial","aim","release"] as const){
          pose.setArcheryState(state);
          const result=pose.bowPoseResult!;
          const original={
            source:name,side,state,reachable:result.reachable,
            reason:result.reason,drawError:result.drawHandErrorMeters,
            skin:result.drawingSkinGapsMeters,
            regions:result.bowSkinContact.map(s=>({
              name:s.region,penetration:s.maximumPenetrationMeters,
              gap:s.nearestGapMeters,contact:s.contactVertices,
            })),
          };
          console.log("C54-MORPH-POSE",JSON.stringify(original));
          expect(result.commands.every(c=>Number.isFinite(c.radians))).toBe(true);
          expect(result.bowWorld.elements.every(Number.isFinite)).toBe(true);
          expect(root.matrixWorld.elements,name+" must preserve character root")
            .toEqual(initialRoot.elements);
          if(result.reachable){
            for(const region of result.bowSkinContact){
              expect(region.maximumPenetrationMeters,
                name+"/"+side+"/"+state+"/"+region.region+" clip").toBeLessThan(.003);
              expect(region.nearestGapMeters,
                name+"/"+side+"/"+state+"/"+region.region+" separation")
                .toBeLessThan(region.region==="palm"?.004:.005);
              expect(region.contactVertices,
                name+"/"+side+"/"+state+"/"+region.region+" patch").toBeGreaterThanOrEqual(2);
            }
            if(state!=="rest"&&state!=="release"){
              expect(result.drawHandErrorMeters).toBeLessThan(.03);
            }
          }else{
            // Intentionally do NOT count unreachable morphologies as valid
            // contacts. The safe fallback must remain bounded and explicit.
            expect(result.reason).not.toBe("ok");
          }
        }
      }
      pose.setArcheryState("aim");
      pose.setGrip("bow-left");
      const first=pose.bowPoseResult!;
      pose.refresh();
      const second=pose.bowPoseResult!;
      expect(second.commands).toEqual(first.commands);
      expect(second.bowWorld.elements).toEqual(first.bowWorld.elements);
    }finally{pose.dispose();human.dispose();}
  },180_000);
});
