import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {make} from "./helpers/studio-two-hand-fixtures";
import {StudioPosePreview} from "../apps/web/src/studio/StudioPosePreview";
import {encodeBowWorkerResult,decodeBowWorkerResult} from
  "../apps/web/src/studio/StudioArcheryWorkerProtocol";

/** The worker is the sole optimizer for a deferred partial draw. Merely
 * selecting the slider state cannot overwrite a previous accepted source pose.
 */
describe("C5.5 deferred source-bow presentation",()=>{
  it("holds the last validated FK and bow pose until external source acceptance",()=>{
    const {human,model}=make();
    const preview=new StudioPosePreview(model);
    try{
      preview.setGrip("bow-left");
      const rest=preview.bowPoseResult!;
      expect(rest.reachable).toBe(true);
      const root=human.spike.character.root.matrixWorld.clone();
      const wrist=human.spike.graph.joints.find(j=>j.role==="wrist_left")!;
      const bone=human.spike.bones.get(wrist.id)!;
      const position=bone.getWorldPosition(new THREE.Vector3());
      preview.stagePartialDraw();
      expect(preview.bowPoseResult).toBe(rest);
      expect(bone.getWorldPosition(new THREE.Vector3()).toArray())
        .toEqual(position.toArray());
      expect(human.spike.character.root.matrixWorld.elements)
        .toEqual(root.elements);
      expect(preview.acceptWorkerPartial(.5,{...rest,state:"partial",
        reachable:false,reason:"draw-unreachable"})).toBe(false);
      expect(preview.bowPoseResult).toBe(rest);
      expect(bone.getWorldPosition(new THREE.Vector3()).toArray())
        .toEqual(position.toArray());
    }finally{preview.dispose();human.dispose();}
  },120_000);
  it("reaccepts a physically solved independent-source draw and rejects a forged nock",()=>{
    // A Web Worker owns an INDEPENDENT generated MakeHuman human. Rebuilding
    // from the same neutral source must yield an identical valid FK result.
    const worker=make(),live=make();
    const fromWorker=new StudioPosePreview(worker.model,{state:"partial",draw:.5});
    const onscreen=new StudioPosePreview(live.model);
    try{
      fromWorker.setGrip("bow-left");
      const result=fromWorker.bowPoseResult!;
      expect(result.reachable).toBe(true);
      onscreen.setGrip("bow-left");
      const held=onscreen.bowPoseResult!;
      expect(held.reachable).toBe(true);
      onscreen.stagePartialDraw();
      const wire=encodeBowWorkerResult(result);
      const parsed=decodeBowWorkerResult(wire);
      expect(parsed.bowWorld).toBeInstanceOf(THREE.Matrix4);
      expect(parsed.nockWorld).toBeInstanceOf(THREE.Vector3);

      // Accepting the literal worker status is insufficient: altered
      // 3D physical contacts MUST fail live-source verification.
      const invalid={...parsed,nockWorld:parsed.nockWorld.clone().add(
        new THREE.Vector3(0,2,0))};
      expect(()=>onscreen.acceptWorkerPartial(.5,invalid))
        .toThrow("Worker source-skin contact rejected");
      expect(onscreen.bowPoseResult).toBe(held);
      expect(onscreen.acceptWorkerPartial(.5,parsed)).toBe(true);
      expect(onscreen.bowPoseResult).toBe(parsed);
      expect(live.human.spike.character.root.matrixWorld.elements)
        .toEqual(worker.human.spike.character.root.matrixWorld.elements);
    }finally{
      fromWorker.dispose();onscreen.dispose();
      worker.human.dispose();live.human.dispose();
    }
  },180_000);
});
