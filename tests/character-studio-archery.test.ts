import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {make} from "./helpers/studio-two-hand-fixtures";
import {StudioPosePreview} from "../apps/web/src/studio/StudioPosePreview";
import {StudioBowPreview,archeryDrawFraction,validateBowReference,
  type ArcheryState} from "../apps/web/src/studio/StudioArchery";
import {aimBallisticAt,sampleTrajectory} from "../packages/combat/src/projectile-motion";

describe("Studio bow and visual nock contract",()=>{
  it.each(["left","right"] as const)("source-skinned mirrored bow %s uses constrained IK",hand=>{
    const {human,model}=make();
    const pose=new StudioPosePreview(model);
    try{
      const root=human.spike.character.root.matrixWorld.clone();
      pose.setGrip(hand==="left"?"bow-left":"bow-right");
      const rest=pose.bowPoseResult!;
      expect(rest).toBeDefined();
      expect(rest.reachable,"source bow-hand must reach reference grip: "+JSON.stringify({error:rest.bowHandErrorMeters,body:rest.bodyClearanceMeters})).toBe(true);
      expect(rest.iterations).toBeLessThanOrEqual(48);
      expect(rest.bowHandErrorMeters).toBeLessThan(.12);
      expect(root.elements).toEqual(human.spike.character.root.matrixWorld.elements);
      if(rest.reachable){
        const reference=new StudioBowPreview(model,rest);
        try{
          validateBowReference(reference.descriptor,human.spike.graph);
          expect(reference.object.getObjectByName("BowHandle")).toBeDefined();
          expect(reference.object.getObjectByName("UpperBowLimb")).toBeDefined();
          expect(reference.object.getObjectByName("LowerBowLimb")).toBeDefined();
          expect(reference.object.children.filter(n=>n.name==="BowString")).toHaveLength(2);
          const first=reference.object.matrix.clone();
          reference.update();
          expect(reference.object.matrix.elements).toEqual(first.elements);
        }finally{reference.dispose();}
      }
      for(const state of ["nock","partial","aim","release"] as ArcheryState[]){
        pose.setArcheryState(state);
        const report=pose.bowPoseResult!;
        expect(report.iterations).toBeLessThanOrEqual(48);
        if(state==="aim")expect(report.reachable,JSON.stringify({state,hand,error:report.drawHandErrorMeters,body:report.bodyClearanceMeters})).toBe(true);
        expect(report.commands.every(c=>Number.isFinite(c.radians))).toBe(true);
        expect(root.elements).toEqual(human.spike.character.root.matrixWorld.elements);
        if(report.reachable){
          const bow=new StudioBowPreview(model,report);
          try{
            if(state!=="release"){
              expect(bow.object.getObjectByName("ArrowNock")).toBeDefined();
              expect(new THREE.Vector3().copy(bow.nockLocal)
                .applyMatrix4(bow.object.matrix).distanceTo(report.nockWorld))
                .toBeLessThan(1e-6);
              expect(bow.tipLocal.clone().sub(bow.nockLocal)
                .normalize().dot(new THREE.Vector3(0,0,1))).toBeCloseTo(1,8);
            }
          }finally{bow.dispose();}
        }
      }
      pose.setArcheryState("aim");
      const first=pose.bowPoseResult!;
      pose.refresh();
      const second=pose.bowPoseResult!;
      expect(second.commands).toEqual(first.commands);
      expect(second.bowHandErrorMeters).toBeCloseTo(first.bowHandErrorMeters,8);
    }finally{pose.dispose();human.dispose();}
  },120_000);

  it("validates draw parameters and leaves authoritative ballistics untouched",()=>{
    expect(archeryDrawFraction("nock",1)).toBeCloseTo(.08);
    expect(archeryDrawFraction("rest",1)).toBe(0);
    expect(archeryDrawFraction("release",1)).toBe(0);
    expect(archeryDrawFraction("partial",.5)).toBeCloseTo(.325);
    expect(()=>archeryDrawFraction("aim",1.1)).toThrow();
    const trajectory=aimBallisticAt(100,{x:0,y:1,z:0},{x:5,y:1,z:2},
      400,{x:0,y:-9.81,z:0});
    const before=sampleTrajectory(trajectory,140);
    const {human,model}=make();
    const studio=new StudioPosePreview(model);
    try{
      studio.setGrip("bow-left");
      studio.setArcheryState("release");
      expect(sampleTrajectory(trajectory,140)).toEqual(before);
    }finally{studio.dispose();human.dispose();}
  },120_000);
});
