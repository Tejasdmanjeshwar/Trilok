import * as THREE from "three";
import type {StudioMorphState} from "./StudioMorphCatalog";
import type {StudioExpression,StudioPose} from "./StudioInspection";
import type {BowEquipment,ArcheryPoseResult} from "./StudioArchery";

/** Exact generated human and posed source are rebuilt in a worker. The
 * worker never receives live meshes or writes to the render character.
 * Every result carries a monotonically increasing request ownership token.
 */
export type BowWorkerInit=Readonly<{
  type:"init"; morphology:StudioMorphState;expression:StudioExpression;
  pose:StudioPose;equipment:BowEquipment;
}>;
export type BowWorkerSolve=Readonly<{
  type:"solve";id:number;draw:number;rootWorld:readonly number[];
}>;
export type BowWorkerRequest=BowWorkerInit|BowWorkerSolve;
export type BowResultWire=Omit<ArcheryPoseResult,
  "bowWorld"|"nockWorld"|"drawContactWorld"|"arrowDirectionWorld"|
  "arrowShaftClearance"> & Readonly<{
    bowWorld:readonly number[];
    nockWorld:readonly number[];
    drawContactWorld:readonly number[];
    arrowDirectionWorld:readonly number[];
    arrowShaftClearance?:readonly (Omit<
      NonNullable<ArcheryPoseResult["arrowShaftClearance"]>[number],
      "closestPointLocal"> & Readonly<{closestPointLocal:readonly number[]}>)[]; 
  }>;
export type BowWorkerResponse=
  |Readonly<{type:"ready"}>
  |Readonly<{type:"solved";id:number;draw:number;
    rootWorld:readonly number[];result:BowResultWire}>
  |Readonly<{type:"error";id:number;message:string}>;

export function encodeBowWorkerResult(result:ArcheryPoseResult):BowResultWire{
  return {...result,bowWorld:result.bowWorld.toArray(),
    nockWorld:result.nockWorld.toArray(),
    drawContactWorld:result.drawContactWorld.toArray(),
    arrowDirectionWorld:result.arrowDirectionWorld.toArray(),
    arrowShaftClearance:result.arrowShaftClearance?.map(s=>({
      ...s,closestPointLocal:s.closestPointLocal.toArray(),
    }))};
}
export function decodeBowWorkerResult(result:BowResultWire):ArcheryPoseResult{
  const vector=(values:readonly number[])=>{
    if(values.length!==3||!values.every(Number.isFinite))
      throw new Error("Nonfinite worker bow vector");
    return new THREE.Vector3().fromArray(values);
  };
  if(result.bowWorld.length!==16||!result.bowWorld.every(Number.isFinite))
    throw new Error("Nonfinite worker bow frame");
  if(!["left","right"].includes(result.hand)||
    result.state!=="partial"||!Number.isFinite(result.bowHandErrorMeters)||
    !Number.isFinite(result.drawHandErrorMeters)||
    !result.commands.every(c=>Number.isFinite(c.radians)))
    throw new Error("Invalid worker anatomical result");
  return Object.freeze({...result,bowWorld:new THREE.Matrix4().fromArray(result.bowWorld),
    nockWorld:vector(result.nockWorld),
    drawContactWorld:vector(result.drawContactWorld),
    arrowDirectionWorld:vector(result.arrowDirectionWorld),
    arrowShaftClearance:result.arrowShaftClearance?.map(s=>
      ({...s,closestPointLocal:vector(s.closestPointLocal)})),
  });
}
