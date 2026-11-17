import {describe,expect,it} from "vitest";
import * as THREE from "three";
import type {ArcheryPoseResult} from "../apps/web/src/studio/StudioArchery";
import {createStudioGripFailureReport,createStudioBowFailureReport,
  serializeStudioGripFailure} from
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
    bodyClearanceMeters:-.011,
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
    expect(restored.failure.bodyClearanceMeters).toBe(-.011);
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

describe("C5.4 bow failures share the exact copyable Studio diagnostic path",()=>{
  it("reports a failed generated left-bow full draw with source skin, nock and morphology",()=>{
    const recipe=reduceStudioRecipe(reduceStudioRecipe(initialStudioRecipe(),
      {type:"generate",seed:9813}),
      {type:"adjust",id:"body:macro/height",value:.15});
    const result:ArcheryPoseResult={
      reachable:false,reason:"draw-unreachable",hand:"left",state:"aim",
      commands:[],iterations:44,solverAttempts:6,
      bowHandErrorMeters:.012,drawHandErrorMeters:.041,
      drawingSkinGapsMeters:{index:.009,middle:.002,ring:.022},
      bodyClearanceMeters:-.003,drawMeters:.21,actualDrawFraction:.75,
      arrowAimDeviationRadians:.4,
      bowSkinContact:[{region:"palm",sampledVertices:120,axialVertices:95,
        contactVertices:2,nearestGapMeters:.002,thirdNearestGapMeters:.003,
        maximumPenetrationMeters:.001}],
      descriptor:{schemaVersion:1,id:"bow/left",kind:"bow",hand:"left",
        socketId:"grip-left",limbLengthMeters:.64,handleRadiusMeters:.01,
        handleLengthMeters:.09,arrowLengthMeters:.7,
        stringRestMeters:.07,maximumDrawMeters:.28,
        arrowRest:{schemaVersion:1,kind:"hand-supported",
          support:"index-knuckle",shaftRadiusMeters:.006,
          supportGapMeters:.002,lateralOffsetMeters:0}},
      bowWorld:new THREE.Matrix4(),
      nockWorld:new THREE.Vector3(1,2,3),
      drawContactWorld:new THREE.Vector3(1.03,2.01,3),
      arrowDirectionWorld:new THREE.Vector3(0,0,1),
    };
    const report=createStudioBowFailureReport(recipe,"neutral","bow-left",
      build,"aim",.75,"recurve",result);
    const json=serializeStudioGripFailure(report);
    const data=JSON.parse(json);
    expect(data.event).toBe("trilok.studio.bow_equip_failure");
    expect(data.build).toEqual(build);
    expect(data.recipe.seed).toBe(9813);
    expect(data.recipe.morphology.body["macro/height"]).toBe(.15);
    expect(data.equipment).toBe("bow-left");
    expect(data.archery).toEqual({state:"aim",drawControl:.75,profile:"recurve"});
    expect(data.failure.type).toBe("unreachable");
    expect(data.failure.reason).toBe("draw-unreachable");
    expect(data.failure.drawHandErrorMeters).toBe(.041);
    expect(data.failure.arrowAimDeviationRadians).toBe(.4);
    expect(data.failure.bowSkinContact[0].maximumPenetrationMeters).toBe(.001);
    expect(data.failure.drawingSkinGapsMeters.index).toBe(.009);
    expect(data.failure.nockWorldMeters).toEqual([1,2,3]);
    expect(json).not.toContain("matrixWorld");
    expect(json).not.toContain("userAgent");
    expect(json).not.toContain("elements");
    (result.bowSkinContact as unknown as {contactVertices:number}[])[0]!.contactVertices=99;
    expect(data.failure.bowSkinContact[0].contactVertices).toBe(2);
  });
  it("reports thrown pose exceptions and missing results for the right bow",()=>{
    const recipe=initialStudioRecipe();
    const thrown=createStudioBowFailureReport(recipe,"neutral","bow-right",
      build,"partial",.5,"simple",undefined,new Error("Source IK failed"));
    expect(thrown.failure).toEqual({
      type:"exception",name:"Error",message:"Source IK failed",
    });
    expect(thrown.archery).toEqual({
      state:"partial",drawControl:.5,profile:"simple",
    });
    const missing=createStudioBowFailureReport(recipe,"neutral","bow-right",
      build,"rest",1,"recurve");
    expect(missing.failure.type).toBe("exception");
    expect(missing.recipe.seed).toBe(recipe.seed);
    expect(serializeStudioGripFailure(missing)).toContain("bow_equip_failure");
  });
});
