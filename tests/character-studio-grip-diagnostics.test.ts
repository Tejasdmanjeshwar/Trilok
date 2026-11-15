import {describe,expect,it} from "vitest";
import {createStudioGripFailureReport,serializeStudioGripFailure} from
  "../apps/web/src/studio/StudioGripDiagnostics";
import {initialStudioRecipe,reduceStudioRecipe} from
  "../apps/web/src/studio/StudioRecipe";
import type {TwoHandIKResult} from
  "../apps/web/src/studio/StudioTwoHandGrip";

const build={commitSha:"0123456789abcdef0123456789abcdef01234567",
  buildId:"01234567-20261115T120000Z",builtAtUtc:"2026-11-15T12:00:00Z"};

function failedResult():TwoHandIKResult{
  return {
    reachable:false,commands:[],reason:"secondary-unreachable",
    primaryErrorMeters:.007,secondaryErrorMeters:.064,
    primaryDeltaMeters:[.002,.003,.004],secondaryDeltaMeters:[.02,.03,.04],
    primaryAxisDot:.95,secondaryAxisDot:.82,iterations:14,
    headClearanceMeters:.20,elbowMaxHeightMeters:1.3,
    headHeightMeters:1.7,maximumPalmHeightMeters:1.4,
    separationMeters:.19,initialHandSpanMeters:.35,
    weaponWorld:null as unknown as TwoHandIKResult["weaponWorld"],
    dimensions:{scale:1,handleLength:.28,bladeLength:.86,shaftLength:0,
      guardWidth:.22,radius:.0135,primaryGripY:.095,secondaryGripY:-.095},
    reachDiagnostics:[{seed:6,initialSpan:.35,primaryError:.007,
      secondaryError:.064,primaryAxis:.95,secondaryAxis:.82,
      reason:"secondary-unreachable"}],
  };
}

describe("C5.2 reproducible browser failure reports",()=>{
  it("preserves generator seed, edited morphology and solver metrics as portable JSON",()=>{
    const generated=reduceStudioRecipe(initialStudioRecipe(),
      {type:"generate",seed:1729});
    const edited=reduceStudioRecipe(generated,
      {type:"adjust",id:"body:macro/height",value:.15});
    const result=failedResult();
    const report=createStudioGripFailureReport(edited,"shoulder-combined",
      "longsword-left",build,result);
    const json=serializeStudioGripFailure(report);
    const restored=JSON.parse(json);
    expect(restored.event).toBe("trilok.studio.two_hand_equip_failure");
    expect(restored.build).toEqual(build);
    expect(restored.recipe.seed).toBe(1729);
    expect(restored.recipe.generatorVersion).toBe(edited.generatorVersion);
    expect(restored.recipe.morphology.body["macro/height"]).toBe(.15);
    expect(restored.pose).toBe("shoulder-combined");
    expect(restored.equipment).toBe("longsword-left");
    expect(restored.failure.type).toBe("unreachable");
    expect(restored.failure.secondaryErrorMeters).toBe(.064);
    expect(restored.failure.attempts).toEqual(result.reachDiagnostics);
    expect(json).not.toContain("matrixWorld");
    expect(json).not.toContain("userAgent");
    expect(serializeStudioGripFailure(report)).toBe(json);
    (result.reachDiagnostics as unknown as {seed:number}[])[0]!.seed=99;
    expect(restored.failure.attempts[0].seed).toBe(6);
  });
  it("describes thrown IK errors and a missing solver result without losing seed",()=>{
    const recipe=initialStudioRecipe();
    const thrown=createStudioGripFailureReport(recipe,"neutral","staff-right",
      build,undefined,new Error("Cannot calibrate wrist"));
    expect(thrown.failure).toEqual({
      type:"exception",name:"Error",message:"Cannot calibrate wrist"});
    const missing=createStudioGripFailureReport(recipe,"crouch",
      "longsword-right",build,undefined);
    expect(missing.failure).toEqual({
      type:"exception",name:"MissingSolverResult",
      message:"The grip preview did not produce an IK result."});
    expect(missing.recipe.seed).toBe(1);
  });
});
