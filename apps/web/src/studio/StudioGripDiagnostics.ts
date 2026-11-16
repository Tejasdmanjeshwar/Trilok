import type {BuildIdentity} from "../build-info";
import type {StudioPose} from "./StudioInspection";
import type {StudioRecipeV1} from "./StudioRecipe";
import type {TwoHandEquipment,TwoHandIKResult} from "./StudioTwoHandGrip";
import type {ArcheryPoseResult,ArcheryState,BowEquipment} from "./StudioArchery";
import type {BowProfile} from "./StudioBowGeometry";

/** Failure-only, portable diagnostics for reproducing a generated character's
 * grip without relying on mutable WebGL objects or browser-local storage.
 * The generator seed alone is insufficient after user edits: retain the
 * entire versioned recipe and the exact Studio pose/equipment selection.
 * No browser, account or device identifiers are collected. */
export interface StudioTwoHandGripFailureReport {
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

/** Same player-facing copy control handles both supported diagnostic kinds.
 * The discriminant preserves the original C5.2 two-hand event unchanged. */
export interface StudioBowGripFailureReport {
  readonly schemaVersion:1;
  readonly event:"trilok.studio.bow_equip_failure";
  readonly build:StudioTwoHandGripFailureReport["build"];
  readonly recipe:StudioRecipeV1;
  readonly pose:StudioPose;
  readonly equipment:BowEquipment;
  readonly archery:Readonly<{
    state:ArcheryState;
    drawControl:number;
    profile:BowProfile;
  }>;
  readonly failure:
    | Readonly<{
        type:"unreachable";
        reason:ArcheryPoseResult["reason"];
        hand:ArcheryPoseResult["hand"];
        iterations:number;
        solverAttempts:number;
        bowHandErrorMeters:number;
        drawHandErrorMeters:number;
        drawingSkinGapsMeters:ArcheryPoseResult["drawingSkinGapsMeters"];
        bodyClearanceMeters:number;
        drawMeters:number;
        actualDrawFraction:number;
        bowSkinContact:ArcheryPoseResult["bowSkinContact"];
        descriptor:ArcheryPoseResult["descriptor"];
        nockWorldMeters:readonly number[];
        drawContactWorldMeters:readonly number[];
      }>
    | Readonly<{type:"exception";name:string;message:string}>;
}

export type StudioGripFailureReport=
  StudioTwoHandGripFailureReport|StudioBowGripFailureReport;

function snapshotRecipe(recipe:StudioRecipeV1):StudioRecipeV1{
  return {
    ...recipe,
    morphology:{
      body:{...recipe.morphology.body},
      face:{...recipe.morphology.face},
      shape:{...recipe.morphology.shape},
    },
    appearance:{...recipe.appearance},
    selectedPresets:{...recipe.selectedPresets},
  };
}

function exceptionFailure(error:unknown):Readonly<{
  type:"exception";name:string;message:string;
}>{
  return {type:"exception",
    name:error instanceof Error?error.name:"UnknownError",
    message:error instanceof Error?error.message:String(error)};
}

/** Bow failure uses the same reproducible recipe/build snapshot as the sword.
 * Geometry and pose matrices are intentionally excluded from copyable JSON. */
export function createStudioBowFailureReport(
  recipe:StudioRecipeV1,pose:StudioPose,equipment:BowEquipment,
  build:StudioTwoHandGripFailureReport["build"],
  state:ArcheryState,drawControl:number,profile:BowProfile,
  result?:ArcheryPoseResult,error?:unknown,
):StudioBowGripFailureReport{
  const failure:StudioBowGripFailureReport["failure"]=error!==undefined?
    exceptionFailure(error):result?{
      type:"unreachable",reason:result.reason,hand:result.hand,
      iterations:result.iterations,solverAttempts:result.solverAttempts,
      bowHandErrorMeters:result.bowHandErrorMeters,
      drawHandErrorMeters:result.drawHandErrorMeters,
      drawingSkinGapsMeters:result.drawingSkinGapsMeters?
        {...result.drawingSkinGapsMeters}:undefined,
      bodyClearanceMeters:result.bodyClearanceMeters,
      drawMeters:result.drawMeters,
      actualDrawFraction:result.actualDrawFraction,
      bowSkinContact:result.bowSkinContact.map(region=>({...region})),
      descriptor:{...result.descriptor},
      nockWorldMeters:result.nockWorld.toArray(),
      drawContactWorldMeters:result.drawContactWorld.toArray(),
    }:exceptionFailure(new Error("The bow preview did not produce an IK result."));
  return {
    schemaVersion:1,event:"trilok.studio.bow_equip_failure",
    build:{commitSha:build.commitSha,buildId:build.buildId,
      builtAtUtc:build.builtAtUtc},
    recipe:snapshotRecipe(recipe),pose,equipment,
    archery:{state,drawControl,profile},failure,
  };
}

export function createStudioGripFailureReport(
  recipe:StudioRecipeV1,pose:StudioPose,equipment:TwoHandEquipment,
  build:Pick<BuildIdentity,"commitSha"|"buildId"|"builtAtUtc">,
  result:TwoHandIKResult|undefined,error?:unknown,
):StudioTwoHandGripFailureReport {
  const failure:StudioTwoHandGripFailureReport["failure"]=error!==undefined?{
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
    recipe:snapshotRecipe(recipe),
    pose,equipment,failure,
  };
}

/** Plain JSON is intentionally copyable from a single browser console line. */
export function serializeStudioGripFailure(report:StudioGripFailureReport):string{
  return JSON.stringify(report);
}
