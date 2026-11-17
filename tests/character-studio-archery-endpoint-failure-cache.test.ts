import {describe,expect,it} from "vitest";
import {make} from "./helpers/studio-two-hand-fixtures";
import {generateStudioCharacter} from "../apps/web/src/studio/StudioGenerator";
import {StudioPosePreview} from "../apps/web/src/studio/StudioPosePreview";

describe("C5.5 cached failed archery endpoints",()=>{
  it("keeps all fractions unreachable for the asymmetric failed-aim source",()=>{
    const source=generateStudioCharacter(2929832126);
    const {human,model}=make(source.morphology.body,source.morphology.shape);
    const preview=new StudioPosePreview(model);
    try{
      preview.setGrip("bow-left");
      preview.setArcheryState("aim");
      expect(preview.bowPoseResult?.reachable).toBe(false);
      preview.setArcheryState("partial");
      const initial=preview.bowPoseResult!;
      expect(initial.reachable).toBe(false);
      for(const value of [0,.25,.5,.75,1]){
        preview.setArcheryDraw(value);
        const result=preview.bowPoseResult!;
        expect(result.reachable).toBe(false);
        // Reuse only the endpoint fit result, never accept an unresolved
        // contact; each fraction retains a finite, explicit diagnostic.
        expect(result.reason).not.toBe("ok");
        expect(Number.isFinite(result.bowHandErrorMeters)).toBe(true);
        expect(Number.isFinite(result.drawHandErrorMeters)).toBe(true);
      }
      preview.refresh();
      expect(preview.bowPoseResult?.reachable).toBe(false);
      preview.invalidateSourceContact();
      preview.refresh();
      expect(preview.bowPoseResult?.reachable).toBe(false);
    }finally{
      preview.dispose();
      human.dispose();
    }
  },180_000);
});
