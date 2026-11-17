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
        expect(rows[4]!.forwardReach).toBeGreaterThan(rows[0]!.forwardReach);
        expect(rows[4]!.elbow3d).toBeGreaterThan(rows[0]!.elbow3d);
      }finally{preview.dispose();human.dispose();}
    },120_000);
});
