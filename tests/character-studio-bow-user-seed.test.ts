import {describe,expect,it} from "vitest";
import {generateStudioCharacter} from
  "../apps/web/src/studio/StudioGenerator";
import {StudioPosePreview} from
  "../apps/web/src/studio/StudioPosePreview";
import {make} from "./helpers/studio-two-hand-fixtures";

/** Actual user-submitted C5.4 diagnostic on build a5fbe394:
 * seed 2929832126, bow-left, recurve, rest. The nominal 8.23 mm
 * handle penetrated the thumb by 4.576 mm and failed reachability.
 * Test the generated SOURCE skin, never a fabricated failure result.
 */
describe("C5.4 exact generated bow grip reproduction",()=>{
  it("seed 2929832126 holds a real bow within unchanged skin contact limits",()=>{
    const generated=generateStudioCharacter(2929832126);
    expect(generated.morphology.body["macro/sex"]).toBe(.252077);
    expect(generated.morphology.body["macro/weight"]).toBe(.732012);
    expect(generated.morphology.body["macro/height"]).toBe(.129402);
    expect(generated.morphology.body["native/armslegs/r-hand-fingers-length-decr-incr"])
      .toBe(.899863);
    const {human,model}=make(generated.morphology.body,generated.morphology.shape);
    const pose=new StudioPosePreview(model);
    try{
      pose.setGrip("bow-left");
      const rest=pose.bowPoseResult!;
      const measurements=rest.bowSkinContact.map(s=>({
        region:s.region,clip:s.maximumPenetrationMeters,
        gap:s.nearestGapMeters,contacts:s.contactVertices,
      }));
      console.log("C54-BOW-USER-SEED",JSON.stringify({
        seed:generated.seed,reachable:rest.reachable,reason:rest.reason,
        radius:rest.descriptor.handleRadiusMeters,measurements,
      }));
      expect(rest.reachable,JSON.stringify({measurements,reason:rest.reason}))
        .toBe(true);
      expect(rest.bowHandErrorMeters).toBeLessThan(.1);
      for(const sample of rest.bowSkinContact){
        expect(sample.axialVertices).toBeGreaterThanOrEqual(3);
        expect(sample.contactVertices).toBeGreaterThanOrEqual(2);
        expect(sample.maximumPenetrationMeters).toBeLessThan(.003);
        expect(sample.nearestGapMeters)
          .toBeLessThan(sample.region==="palm"?.004:.005);
      }
      pose.refresh();
      expect(pose.bowPoseResult!.descriptor.handleRadiusMeters)
        .toBe(rest.descriptor.handleRadiusMeters);
      expect(pose.bowPoseResult!.bowSkinContact).toEqual(rest.bowSkinContact);
    }finally{pose.dispose();human.dispose();}
  },180_000);
});
