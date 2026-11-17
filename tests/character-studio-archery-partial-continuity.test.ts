import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {make} from "./helpers/studio-two-hand-fixtures";
import {StudioPosePreview} from "../apps/web/src/studio/StudioPosePreview";
import {measureStringFingerSkin} from "../apps/web/src/studio/StudioArchery";
import {contactArmFreedoms,supportedContactFreedoms} from
  "../apps/web/src/studio/StudioContactIK";
describe("Shared compliant contact support (no fixed anatomical DOFs)",()=>{
  it.each(["left","right"] as const)(
    "retains a legal bounded search interval on every %s arm channel",side=>{
      const {human,fk}=make();
      try{
        const source=contactArmFreedoms(human.spike.graph,fk,side);
        const reference=source.map(f=>({
          jointId:f.jointId,motion:f.motion,
          radians:(f.min+f.max)/2,
        }));
        const supported=supportedContactFreedoms(source,reference,
          THREE.MathUtils.degToRad(2));
        expect(supported).toHaveLength(9);
        for(let i=0;i<supported.length;i++){
          const f=supported[i]!,original=source[i]!;
          expect(f.min).toBeGreaterThanOrEqual(original.min);
          expect(f.max).toBeLessThanOrEqual(original.max);
          expect(f.max-f.min).toBeGreaterThan(0);
          expect(f.min).toBeCloseTo(Math.max(original.min,
            reference[i]!.radians-THREE.MathUtils.degToRad(2)),8);
          expect(f.max).toBeCloseTo(Math.min(original.max,
            reference[i]!.radians+THREE.MathUtils.degToRad(2)),8);
        }
      }finally{human.dispose();}
    });
  it("clamps compliant support within asymmetric source limits",()=>{
    const {human,fk}=make();
    try{
      const source=contactArmFreedoms(human.spike.graph,fk,"left");
      const reference=source.map(f=>({
        jointId:f.jointId,motion:f.motion,radians:f.max,
      }));
      const adjusted=supportedContactFreedoms(source,reference,.05);
      expect(adjusted.every((f,i)=>f.max===source[i]!.max)).toBe(true);
      expect(adjusted.every((f,i)=>f.min>=source[i]!.min)).toBe(true);
      expect(()=>supportedContactFreedoms(source,reference,0)).toThrow();
    }finally{human.dispose();}
  });
});


/** Source-landmark and skin-contact observations across the actual slider,
 * not inferred from a single 3D elbow number at full draw. These are
 * numerical gates; multi-view owner review is still required. */
describe("C5.4 partial-draw source-kinematic progression",()=>{
  it.each(["left","right"] as const)(
    "maintains legal source contact and measures the %s overhead trajectory",
    side=>{
      const {human,model}=make();
      const preview=new StudioPosePreview(model);
      try{
        preview.setGrip(side==="left"?"bow-left":"bow-right");
        preview.setArcheryState("nock");
        const nock=preview.bowPoseResult!;
        expect(nock.reachable).toBe(true);
        preview.setArcheryState("aim");
        const aim=preview.bowPoseResult!;
        expect(aim.reachable).toBe(true);
        const maxEndpointLateral=Math.max(
          nock.stanceAlignment!.bowArmLateralOffsetMeters,
          aim.stanceAlignment!.bowArmLateralOffsetMeters);
        preview.setArcheryState("partial");
        const holdingJoints=new Set(human.spike.graph.joints.filter(j=>
          ["clavicle_","shoulder_","elbow_","wrist_"].some(prefix=>
            j.role===prefix+side)).map(j=>j.id));
        const holdingStates:Map<string,number>[]=[];
        const rows=[] as Array<{
          slider:number;elbow3d:number;elbowOverhead:number;
          forwardReach:number;lateralOffset:number;shoulderLead:number;
          elbowBehindHook:number;elbowOffAxis:number;
          drawError:number;bowError:number;skinIndex:number;skinMiddle:number;
          attempts:number;
        }>;
        for(const slider of [0,.25,.5,.75,1]){
          preview.setArcheryDraw(slider);
          const result=preview.bowPoseResult!;
          expect(result.reachable,`${side} draw ${slider}: ${result.reason}`)
            .toBe(true);
          expect(result.stanceAlignment).toBeDefined();
          // A skinned-hand contact that parks the bow arm 300 mm sideways
          // is NOT a coherent intermediate pose, even when it passes IK.
          expect(result.stanceAlignment!.bowArmLateralOffsetMeters)
            .toBeLessThan(maxEndpointLateral+.09);
          const support=new Map(result.commands.filter(c=>
            holdingJoints.has(c.jointId)).map(c=>
            [c.jointId+"/"+c.motion,c.radians]));
          expect(support.size).toBeGreaterThanOrEqual(9);
          holdingStates.push(support);
          const a=result.stanceAlignment!;
          const gaps=measureStringFingerSkin(model,
            side==="left"?"right":"left",result);
          const index=gaps.find(g=>g.digit==="index")!;
          const middle=gaps.find(g=>g.digit==="middle")!;
          expect(index.nearestGapMeters).toBeLessThan(.008);
          expect(middle.nearestGapMeters).toBeLessThan(.008);
          expect(result.drawHandErrorMeters).toBeLessThan(.03);
          expect(result.arrowAimDeviationRadians).toBeLessThanOrEqual(
            THREE.MathUtils.degToRad(15)+1e-8);
          rows.push({
            slider,elbow3d:THREE.MathUtils.radToDeg(a.bowElbowInteriorRadians),
            elbowOverhead:THREE.MathUtils.radToDeg(a.bowElbowTopViewRadians),
            forwardReach:a.bowArmForwardReachMeters,
            lateralOffset:a.bowArmLateralOffsetMeters,
            shoulderLead:a.bowShoulderLeadMeters,
            elbowBehindHook:a.drawElbowBehindHookMeters,
            elbowOffAxis:a.drawElbowOffAxisMeters,
            drawError:result.drawHandErrorMeters,
            bowError:result.bowHandErrorMeters,
            skinIndex:index.nearestGapMeters,
            skinMiddle:middle.nearestGapMeters,
            attempts:result.solverAttempts,
          });
        }
        console.log("C5.4 PARTIAL-DRAW PROGRESSION",JSON.stringify({side,rows}));
        for(const row of rows){
          expect(Number.isFinite(row.elbow3d)).toBe(true);
          expect(Number.isFinite(row.elbowOverhead)).toBe(true);
          expect(Number.isFinite(row.forwardReach)).toBe(true);
          expect(Number.isFinite(row.lateralOffset)).toBe(true);
          expect(Number.isFinite(row.elbowBehindHook)).toBe(true);
        }
        // The soft support DOFs must actually participate in the coupled
        // optimization, without allowing a wild postural excursion. This
        // detects accidentally returning to the former []-freedoms lock.
        const starting=holdingStates[0]!;
        const changes=holdingStates.slice(1).flatMap(state=>
          [...starting].map(([key,angle])=>Math.abs(
            (state.get(key)??angle)-angle)));
        expect(Math.max(...changes)).toBeGreaterThan(1e-6);
        // The old 4-degree total-motion gate enforced the wrong constant
        // sideways support pose. Replace it with a neighboring-frame
        // continuity limit while allowing the nock->aim pose to progress.
        const neighbors=holdingStates.slice(1).flatMap((state,i)=>
          [...holdingStates[i]!].map(([key,angle])=>Math.abs(
            (state.get(key)??angle)-angle)));
        expect(Math.max(...neighbors)).toBeLessThan(
          THREE.MathUtils.degToRad(20));
        // Record the current trajectory without falsely accepting a bent
        // partial elbow: those target angles require owner visual approval
        // and a separate contact-preserving solver correction.
        expect(rows.every(row=>row.forwardReach>0)).toBe(true);
      }finally{preview.dispose();human.dispose();}
    },120_000);
});
