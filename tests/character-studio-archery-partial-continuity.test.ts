import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {make} from "./helpers/studio-two-hand-fixtures";
import {StudioPosePreview} from "../apps/web/src/studio/StudioPosePreview";
import {measureStringFingerSkin} from "../apps/web/src/studio/StudioArchery";

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
        preview.setArcheryState("aim");
        const full=preview.bowPoseResult!;
        expect(full.reachable).toBe(true);
        const fullBow=full.bowWorld.clone();
        const fullAlignment=full.stanceAlignment!;
        // Full draw is an owner-accepted source-arm pose. Intermediate draw
        // must not re-solve or re-fold the holding clavicle/shoulder/elbow/wrist.
        const role=(part:string)=>{
          const joint=model.human.spike.graph.joints.find(j=>
            j.role===part+"_"+side)!;
          return model.human.spike.bones.get(joint.id)!;
        };
        const holdingParts=["clavicle","shoulder","elbow","wrist","palm"];
        const fullLandmarks=holdingParts.map(part=>
          role(part).getWorldPosition(new THREE.Vector3()));
        preview.setArcheryState("partial");
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
          const a=result.stanceAlignment!;
          for(let i=0;i<holdingParts.length;i++)
            expect(role(holdingParts[i]!).getWorldPosition(new THREE.Vector3())
              .distanceTo(fullLandmarks[i]!),`${side} ${slider} holding ${holdingParts[i]}`)
              .toBeLessThan(1e-5);
          for(let i=0;i<16;i++)
            expect(result.bowWorld.elements[i],`${side} ${slider} bow matrix ${i}`)
              .toBeCloseTo(fullBow.elements[i]!,5);
          expect(a.bowElbowInteriorRadians).toBeCloseTo(
            fullAlignment.bowElbowInteriorRadians,5);
          expect(a.bowElbowTopViewRadians).toBeCloseTo(
            fullAlignment.bowElbowTopViewRadians,5);
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
        // Record the current trajectory without falsely accepting a bent
        // partial elbow: those target angles require owner visual approval
        // and a separate contact-preserving solver correction.
        expect(rows.every(row=>row.forwardReach>0)).toBe(true);
      }finally{preview.dispose();human.dispose();}
    },120_000);
});
