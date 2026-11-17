import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {make} from "./helpers/studio-two-hand-fixtures";
import {StudioPosePreview} from "../apps/web/src/studio/StudioPosePreview";

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
});
