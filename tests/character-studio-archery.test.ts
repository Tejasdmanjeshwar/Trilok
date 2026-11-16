import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {make,measureStaff} from "./helpers/studio-two-hand-fixtures";
import {StudioPosePreview} from "../apps/web/src/studio/StudioPosePreview";
import {handContactTargets} from "../apps/web/src/studio/StudioWeaponGrip";
import {signedFiniteCylinderDistance,sourceHandSamples,measureSourceCylinder}
  from "../apps/web/src/studio/StudioSourceContact";
import {contactArmFreedoms,composeContactPose} from "../apps/web/src/studio/StudioContactIK";
import {StudioBowPreview,archeryDrawFraction,validateBowReference,
  measureStringFingerSkin,
  type ArcheryState} from "../apps/web/src/studio/StudioArchery";
import {aimBallisticAt,sampleTrajectory} from "../packages/combat/src/projectile-motion";

describe("Shared anatomical weapon contacts",()=>{
  it("evaluates finite cylinder caps and signed interior, not an infinite axis",()=>{
    expect(signedFiniteCylinderDistance(0,0,0,.01,.1)).toBeCloseTo(-.01);
    expect(signedFiniteCylinderDistance(.013,0,0,.01,.1)).toBeCloseTo(.003);
    expect(signedFiniteCylinderDistance(0,.055,0,.01,.1)).toBeCloseTo(.005);
    expect(signedFiniteCylinderDistance(.013,.054,0,.01,.1))
      .toBeCloseTo(.005);
  });
  it("separates bow cylinder pressure from the two-finger string hook",()=>{
    const {human,fk}=make();
    try{
      const graph=human.spike.graph;
      for(const hand of ["left","right"] as const){
        const sword=handContactTargets(graph,hand,"sword-handle");
        const bow=handContactTargets(graph,hand,"bow-handle");
        const hook=handContactTargets(graph,hand,"string-two-finger");
        expect(bow).not.toEqual(sword);
        expect(hook).not.toEqual(sword);
        expect(hook).not.toEqual(bow);
        const fingers=new Set(hook.map(x=>x.jointId));
        expect(fingers.size).toBeGreaterThanOrEqual(14);
        expect(bow.every(x=>Number.isFinite(x.radians))).toBe(true);
        for(const command of hook){
          const limits=fk.frames.get(command.jointId)?.freedoms.get(command.motion);
          expect(limits).toBeDefined();
          expect(command.radians).toBeGreaterThanOrEqual(limits!.min);
          expect(command.radians).toBeLessThanOrEqual(limits!.max);
        }
        const axes=contactArmFreedoms(graph,fk,hand);
        expect(axes).toHaveLength(9);
        const zero=axes.map(x=>Math.max(x.min,Math.min(x.max,0)));
        const composed=composeContactPose(hook,axes,zero);
        expect(composed).toHaveLength(hook.length+9);
        expect(hook).toHaveLength(15);
      }
    }finally{human.dispose();}
  });
});

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
      expect(rest.iterations).toBeLessThanOrEqual(56);
      const sampledSource=measureSourceCylinder(model,sourceHandSamples(model,hand),
        rest.bowWorld,rest.descriptor.handleRadiusMeters,
        rest.descriptor.handleLengthMeters);
      console.log("C5.4 finite source-skin bow contact",JSON.stringify({hand,
        sampledSource}));
      expect(sampledSource.every(s=>s.axialVertices>=3&&s.contactVertices>=2))
        .toBe(true);
      for(const region of sampledSource){
        expect(region.maximumPenetrationMeters,hand+"/"+region.region+" signed clip")
          .toBeLessThan(.003);
        expect(region.nearestGapMeters,hand+"/"+region.region+" finite surface gap")
          .toBeLessThan(region.region==="palm"?.004:.005);
      }
      const sourceContact=measureStaff(model,hand,rest.bowWorld,
        rest.descriptor.handleRadiusMeters,0);
      console.log("C5.4 source bow-hand fit",JSON.stringify({hand,
        restError:rest.bowHandErrorMeters,
        contacts:sourceContact.map(x=>({digit:x.digit,gap:x.closestGap,
          penetration:x.deepestPenetration,near:x.nearContact}))}));
      expect(sourceContact.every(x=>x.axialNear>0)).toBe(true);
      // True source-skinned surface fit: do not let a small arm residual
      // disguise a cylinder passing through palm or individual digits.
      // Provisional coarse-source skin gates in meters; browser close-ups
      // still decide whether the contact looks anatomically credible.
      for(const sample of sourceContact){
        expect(sample.deepestPenetration,hand+"/"+sample.digit+" penetrates handle")
          .toBeLessThan(.003);
        expect(sample.closestGap,hand+"/"+sample.digit+" floats off handle")
          .toBeLessThan(sample.digit==="palm"?.004:.005);
      }
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
        expect(report.reachable,hand+"/"+state+" safe pose").toBe(true);
        expect(report.iterations).toBeLessThanOrEqual(56);
        console.log("C5.4 archery reach",JSON.stringify({hand,state,
          reachable:report.reachable,bowError:report.bowHandErrorMeters,
          drawError:report.drawHandErrorMeters,drawMeters:report.drawMeters,
          delta:report.drawContactWorld.clone().sub(report.nockWorld).toArray(),
          bodyClearance:report.bodyClearanceMeters,iterations:report.iterations,
          attempts:report.solverAttempts}));
        if(state==="aim"){
          expect(report.reachable,JSON.stringify({state,hand,error:report.drawHandErrorMeters,body:report.bodyClearanceMeters})).toBe(true);
          expect(report.drawHandErrorMeters).toBeLessThan(.03);
          expect(report.drawMeters).toBeGreaterThan(.15);
        }
        expect(report.commands.every(c=>Number.isFinite(c.radians))).toBe(true);
        expect(root.elements).toEqual(human.spike.character.root.matrixWorld.elements);
        if(report.reachable){
          if(state!=="release"){
            const stringSkin=measureStringFingerSkin(model,
              hand==="left"?"right":"left",report);
            console.log("C5.4 actual posed string-skin gaps",
              JSON.stringify({hand,state,stringSkin}));
            expect(stringSkin.every(sample=>
              sample.skinVertices>0&&Number.isFinite(sample.nearestGapMeters)))
              .toBe(true);
            // The selected two-finger release must contact ACTUAL skinned
            // index and middle fingers, not merely arm-bone landmarks.
            for(const finger of stringSkin.filter(x=>x.digit!=="ring"))
              expect(finger.nearestGapMeters).toBeLessThan(.008);
          }
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
