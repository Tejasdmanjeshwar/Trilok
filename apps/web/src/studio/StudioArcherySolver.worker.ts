import * as THREE from "three";
import {buildStudioHuman,type StudioHumanModel} from "./StudioHumanModel";
import {StudioPosePreview} from "./StudioPosePreview";
import {previewExpression} from "./StudioInspection";
import {encodeBowWorkerResult,type BowWorkerRequest,
  type BowWorkerResponse,type BowWorkerInit} from "./StudioArcheryWorkerProtocol";

let model:StudioHumanModel|undefined;
let preview:StudioPosePreview|undefined;
let config:BowWorkerInit|undefined;
const respond=(value:BowWorkerResponse)=>self.postMessage(value);
const prepare=async(input:BowWorkerInit)=>{
  preview?.dispose();preview=undefined;
  model?.dispose();model=undefined;
  config=input;
  model=await buildStudioHuman(input.morphology);
  if(input.expression!=="neutral"){
    await model.setFace(previewExpression(input.morphology.face,input.expression),
      ()=>true);
  }
  respond({type:"ready"});
};
const solve=(id:number,draw:number,rootWorld:readonly number[])=>{
  if(!model||!config)throw new Error("Uninitialized source bow solver");
  if(!Number.isSafeInteger(id)||id<=0||
     !Number.isFinite(draw)||draw<0||draw>1||
     rootWorld.length!==16||!rootWorld.every(Number.isFinite))
    throw new Error("Invalid background IK request");
  const root=model.human.spike.character.root;
  const matrix=new THREE.Matrix4().fromArray(rootWorld);
  matrix.decompose(root.position,root.quaternion,root.scale);
  root.updateWorldMatrix(true,true);
  if(!preview){
    preview=new StudioPosePreview(model,{state:"partial",draw});
    // Set the unarmed preview pose before the initial expensive fit.
    preview.setPose(config.pose);
    preview.setGrip(config.equipment);
  }else {
    // Root transforms may change even for an unchanged draw. The worker
    // updates the source model and re-solves rather than reusing posed skin.
    preview.setArcheryDraw(draw);
  }
  const result=preview.bowPoseResult;
  if(!result)throw new Error("No validated source-skinned bow result");
  respond({type:"solved",id,draw,rootWorld:[...rootWorld],
    result:encodeBowWorkerResult(result)});
};
/** This module is a CPU-only Three.js scene/skin replica, not a renderer.
 * The main thread owns the live scene, visuals, diagnostics and disposal.
 * Terminating the worker interrupts a stale synchronous solve immediately.
 */
self.onmessage=(event:MessageEvent<BowWorkerRequest>)=>{
  const data=event.data;
  if(data.type==="init"){
    void prepare(data).catch(error=>
      respond({type:"error",id:0,message:String(error)}));
  }else if(data.type==="solve"){
    try{solve(data.id,data.draw,data.rootWorld);}
    catch(error){respond({type:"error",id:data.id,message:String(error)});}
  }
};
