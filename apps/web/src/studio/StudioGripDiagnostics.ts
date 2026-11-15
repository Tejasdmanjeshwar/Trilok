import type {BuildIdentity} from "../build-info";
import type {StudioPose} from "./StudioInspection";
import type {StudioRecipeV1} from "./StudioRecipe";
import type {TwoHandEquipment,TwoHandIKResult} from "./StudioTwoHandGrip";

/** Failure-only, portable diagnostics for reproducing a generated character's
 * grip without relying on mutable WebGL objects or browser-local storage.
 * The generator seed alone is insufficient after user edits: retain the
 * entire versioned recipe and the exact Studio pose/equipment selection.
 * No browser, account or device identifiers are collected. */
export interface StudioGripFailureReport {
  readonly schemaVersion:1;
  readonly event:"trilok.studio.two_hand_equip_failure";
  readonly build:Pick<BuildIdentity,"commitSha"|"buildId"|"builtAtUtc">;
  readonly recipe:StudioRecipeV1;
  readonly pose:StudioPose;
  readonly equipment:TwoHandEquipment;
  readonly failure:
    | Readonly<{
        type:"unreachable";
        reason:TwoHandIKResult["reason"];
        primaryErrorMeters:number;
        secondaryErrorMeters:number;
        primaryDeltaMeters:readonly number[];
        secondaryDeltaMeters:readonly number[];
        primaryAxisDot:number;
        secondaryAxisDot:number;
        headClearanceMeters:number;
        bodyClearanceMeters:number;
        elbowMaxHeightMeters:number;
        headHeightMeters:number;
        maximumPalmHeightMeters:number;
        separationMeters:number;
        initialHandSpanMeters:number;
        dimensions:TwoHandIKResult["dimensions"];
        attempts:NonNullable<TwoHandIKResult["reachDiagnostics"]>;
      }>
    | Readonly<{type:"exception";name:string;message:string}>;
}

export function createStudioGripFailureReport(
  recipe:StudioRecipeV1,pose:StudioPose,equipment:TwoHandEquipment,
  build:Pick<BuildIdentity,"commitSha"|"buildId"|"builtAtUtc">,
  result:TwoHandIKResult|undefined,error?:unknown,
):StudioGripFailureReport {
  const failure:StudioGripFailureReport["failure"]=error!==undefined?{
    type:"exception",
    name:error instanceof Error?error.name:"UnknownError",
    message:error instanceof Error?error.message:String(error),
  }:result?{
    type:"unreachable",reason:result.reason,
    primaryErrorMeters:result.primaryErrorMeters,
    secondaryErrorMeters:result.secondaryErrorMeters,
    primaryDeltaMeters:[...result.primaryDeltaMeters],
    secondaryDeltaMeters:[...result.secondaryDeltaMeters],
    primaryAxisDot:result.primaryAxisDot,
    secondaryAxisDot:result.secondaryAxisDot,
    headClearanceMeters:result.headClearanceMeters,
    bodyClearanceMeters:result.bodyClearanceMeters,
    elbowMaxHeightMeters:result.elbowMaxHeightMeters,
    headHeightMeters:result.headHeightMeters,
    maximumPalmHeightMeters:result.maximumPalmHeightMeters,
    separationMeters:result.separationMeters,
    initialHandSpanMeters:result.initialHandSpanMeters,
    dimensions:{...result.dimensions},
    attempts:(result.reachDiagnostics??[]).map(attempt=>({...attempt})),
  }:{
    type:"exception",name:"MissingSolverResult",
    message:"The grip preview did not produce an IK result.",
  };
  return {
    schemaVersion:1,event:"trilok.studio.two_hand_equip_failure",
    build:{commitSha:build.commitSha,buildId:build.buildId,
      builtAtUtc:build.builtAtUtc},
    recipe:{
      ...recipe,
      morphology:{
        body:{...recipe.morphology.body},
        face:{...recipe.morphology.face},
        shape:{...recipe.morphology.shape},
      },
      appearance:{...recipe.appearance},
      selectedPresets:{...recipe.selectedPresets},
    },
    pose,equipment,failure,
  };
}

/** Plain JSON is intentionally copyable from a single browser console line. */
export function serializeStudioGripFailure(report:StudioGripFailureReport):string{
  return JSON.stringify(report);
}
