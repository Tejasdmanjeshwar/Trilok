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
  type ArcheryState,MAX_ARCHERY_AIM_DEVIATION_RADIANS}
  from "../apps/web/src/studio/StudioArchery";
import {measureSourceArrowShaft,sourceIndexRestLandmark,
  validateArrowRestReference} from "../apps/web/src/studio/StudioArrowRest";
import {aimBallisticAt,sampleTrajectory} from "../packages/combat/src/projectile-motion";

describe("Shared anatomical weapon contacts",()=>{
  it("evaluates finite cylinder caps and signed interior, not an infinite axis",()=>{
    expect(signedFiniteCylinderDistance(0,0,0,.01,.1)).toBeCloseTo(-.01);
    expect(signedFiniteCylinderDistance(.013,0,0,.01,.1)).toBeCloseTo(.003);
    expect(signedFiniteCylinderDistance(0,.049,0,.01,.1))
      .toBeCloseTo(-.001);
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
    const {human,model,fk}=make();
    const pose=new StudioPosePreview(model);
    try{
      const root=human.spike.character.root.matrixWorld.clone();
      pose.setGrip(hand==="left"?"bow-left":"bow-right");
      const rest=pose.bowPoseResult!;
      const worldUp=new THREE.Vector3(0,1,0).transformDirection(
        human.spike.character.root.matrixWorld);
      const bowAxis=new THREE.Vector3(0,1,0).transformDirection(rest.bowWorld);
      console.log("C5.4 bow axis alignment",JSON.stringify({
        hand,upDot:bowAxis.dot(worldUp),tiltRadians:Math.acos(
          Math.min(1,Math.abs(bowAxis.dot(worldUp))))}));
      expect(rest).toBeDefined();
      console.log("C5.4 source contact acceptance",JSON.stringify({hand,
        reachable:rest.reachable,regions:rest.bowSkinContact}));
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
          validateArrowRestReference(reference.descriptor.arrowRest);
          expect(reference.object.getObjectByName("BowHandle")).toBeDefined();
          expect(reference.object.getObjectByName("BowStave")).toBeDefined();
          expect(reference.object.getObjectByName("UpperBowNock")).toBeDefined();
          expect(reference.object.getObjectByName("LowerBowNock")).toBeDefined();
          expect(reference.object.children.filter(n=>n.name==="BowString")).toHaveLength(2);
          const first=reference.object.matrix.clone();
          reference.update();
          expect(reference.object.matrix.elements).toEqual(first.elements);
        }finally{reference.dispose();}
      }
      for(const state of ["nock","partial","aim","release"] as ArcheryState[]){
        pose.setArcheryState(state);
        const report=pose.bowPoseResult!;
        const aimAxis=report.arrowDirectionWorld.clone().normalize();
        const avatarForward=new THREE.Vector3(0,0,1).transformDirection(
          human.spike.character.root.matrixWorld);
        const avatarUp=new THREE.Vector3(0,1,0).transformDirection(
          human.spike.character.root.matrixWorld);
        const avatarRight=new THREE.Vector3(1,0,0).transformDirection(
          human.spike.character.root.matrixWorld);
        console.log("C5.4 bow shaft direction",JSON.stringify({hand,state,
          pitchDegrees:THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(
            aimAxis.dot(avatarUp),-1,1))),
          yawDegrees:THREE.MathUtils.radToDeg(Math.atan2(aimAxis.dot(avatarRight),
            aimAxis.dot(avatarForward))),
          forwardDegrees:THREE.MathUtils.radToDeg(aimAxis.angleTo(avatarForward)),
        }));
        console.log("C5.4 coupled string fit status",JSON.stringify({hand,state,
          reachable:report.reachable,reason:report.reason,
          drawError:report.drawHandErrorMeters,bowError:report.bowHandErrorMeters,
          body:report.bodyClearanceMeters,skin:report.drawingSkinGapsMeters,
          attempts:report.solverAttempts}));
        expect(report.reachable,hand+"/"+state+" safe pose").toBe(true);
        if(report.reachable){
          const line=report.stanceAlignment;
          expect(line,"measured source skeletal shooting-line").toBeDefined();
          console.log("C5.4 anatomical shooting-line",JSON.stringify({
            hand,state,alignment:line,
            bowElbowDegrees:THREE.MathUtils.radToDeg(line!.bowElbowInteriorRadians),
            bowElbowTopDegrees:THREE.MathUtils.radToDeg(line!.bowElbowTopViewRadians),
          }));
          // Nocking is a preparation/contact pose, not an expansion
          // posture. Full-draw extension below remains an independent gate.
          expect(Number.isFinite(line!.bowElbowInteriorRadians)).toBe(true);
          expect(line!.bowElbowExtensionDeficitMeters).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(line!.drawElbowBehindHookMeters)).toBe(true);
          expect(Number.isFinite(line!.drawElbowOffAxisMeters)).toBe(true);
          if(state==="aim"){
            const bowElbow=human.spike.graph.joints.find(j=>j.role==="elbow_"+hand)!;
            const command=report.commands.find(c=>c.jointId===bowElbow.id&&
              c.motion==="flexion");
            console.log("C5.4 actual bow elbow FK",JSON.stringify({hand,
              commandRadians:command?.radians,
              calibratedLimit:fk.frames.get(bowElbow.id)?.freedoms.get("flexion"),
              measuredDegrees:THREE.MathUtils.radToDeg(line!.bowElbowInteriorRadians)}));
            // Final draw should have a long, supported bow arm, rather than
            // only a hand that reaches a perfectly accurate bow socket.
            expect(line!.bowElbowInteriorRadians).toBeGreaterThan(
              THREE.MathUtils.degToRad(150));
            // A 3D-straight elbow can still kink severely in an overhead
            // projection. Verify the exact silhouette the user reported.
            expect(line!.bowElbowTopViewRadians).toBeGreaterThan(
              THREE.MathUtils.degToRad(145));
            expect(line!.bowArmForwardReachMeters).toBeGreaterThan(.2);
            expect(line!.bowShoulderLeadMeters).toBeGreaterThan(.1);
            expect(line!.drawElbowBehindHookMeters).toBeGreaterThan(0);
          }
        }
        expect(report.arrowAimDeviationRadians,
          hand+"/"+state+" arrow deviates from avatar-facing aim; "+
          THREE.MathUtils.radToDeg(report.arrowAimDeviationRadians).toFixed(2)+" deg")
          .toBeLessThanOrEqual(MAX_ARCHERY_AIM_DEVIATION_RADIANS+1e-8);
        expect(aimAxis.angleTo(avatarForward))
          .toBeCloseTo(report.arrowAimDeviationRadians,7);
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
              // A finite-radius shaft must clear the *full* posed MakeHuman
              // source hand, not merely its centerline or skeleton pivots.
              const reports=report.arrowShaftClearance!;
              expect(reports).toHaveLength(6);
              for(const region of reports){
                expect(region.vertices,hand+"/"+state+"/"+region.region).toBeGreaterThan(0);
                expect(region.nearestSurfaceClearanceMeters,
                  hand+"/"+state+"/"+region.region+" arrow penetration")
                  .toBeGreaterThanOrEqual(-.001);
              }
              const rest=report.descriptor.arrowRest;
              const local=report.nockWorld.clone().applyMatrix4(
                report.bowWorld.clone().invert());
              const indexSkin=sourceIndexRestLandmark(model,hand,
                sourceHandSamples(model,hand),report.bowWorld);
              expect(local.y).toBeGreaterThanOrEqual(indexSkin.y-.003);
              expect(local.y).toBeGreaterThanOrEqual(
                report.descriptor.handleLengthMeters/2+rest.shaftRadiusMeters-.001);
              const previous=measureSourceArrowShaft(model,
                sourceHandSamples(model,hand),report.bowWorld,
                new THREE.Vector3(0,0,local.z),
                report.descriptor.arrowLengthMeters,rest.shaftRadiusMeters);
              console.log("C5.4 shaft source clearance before/after",
                JSON.stringify({hand,state,
                  originalMm:previous.map(s=>[s.region,
                    Math.round(s.nearestSurfaceClearanceMeters*1000)]),
                  correctedMm:reports.map(s=>[s.region,
                    Math.round(s.nearestSurfaceClearanceMeters*1000)]),
                  restAboveIndexMm:Math.round((local.y-indexSkin.y)*1000)}));
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
