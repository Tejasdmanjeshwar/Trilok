import {describe, expect, it} from "vitest";
import * as THREE from "three";
import {createSkinningSpike} from "../apps/web/src/characters/geometry/SkinningSpike";
import {AnatomicalFK} from "../apps/web/src/characters/geometry/AnatomicalFK";

describe("C6.2 calibrated animation deformation bridge", () => {
  it("keeps skin-only shoulder/forearm siblings synchronized and resets presentation pelvis motion", () => {
    const human = createSkinningSpike({forearmSkinning:true,shoulderSkinning:true});
    try {
      const fk = new AnatomicalFK(human.graph,human.bones,{
        forearmSkinBones: human.forearmSkinBones,
        shoulderSkinBones: human.shoulderSkinBones,
      });
      const id = (role:string) => human.graph.joints.find(j=>j.role===role)!.id;
      const root=human.bones.get(id("pelvis"))!;
      const elbow=human.bones.get(id("elbow_left"))!;
      const shoulder=human.bones.get(id("shoulder_left"))!;
      const forearm=human.forearmSkinBones!.get("left")!;
      const connector=human.shoulderSkinBones!.get("left")!;
      const originalRoot=root.position.clone();
      const originalConnector=connector.quaternion.clone();
      const angle=(axis:THREE.Vector3,amount:number)=>{
        const q=new THREE.Quaternion().setFromAxisAngle(axis,amount);
        return [q.x,q.y,q.z,q.w] as [number,number,number,number];
      };
      const elbowAxis=fk.frames.get(id("elbow_left"))!.freedoms.get("rotation")!.axis;
      fk.applyRestDeltas([
        {jointId:id("pelvis"),translation:[.012,.03,0]},
        {jointId:id("shoulder_left"),rotation:angle(new THREE.Vector3(0,0,1),.45)},
        {jointId:id("elbow_left"),rotation:angle(elbowAxis,.7)},
      ]);
      expect(root.position.y).toBeCloseTo(originalRoot.y+.03,7);
      expect(shoulder.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(.2);
      expect(connector.quaternion.angleTo(originalConnector)).toBeGreaterThan(.1);
      expect(elbow.quaternion.angleTo(forearm.quaternion)).toBeGreaterThan(.5);
      fk.applyRestDeltas([{jointId:id("pelvis"),translation:[.012,.03,0]}]);
      expect(root.position.y).toBeCloseTo(originalRoot.y+.03,7);
      expect(connector.quaternion.angleTo(originalConnector)).toBeLessThan(1e-7);
      expect(elbow.quaternion.angleTo(forearm.quaternion)).toBeLessThan(1e-7);
      fk.apply([]);
      expect(root.position.distanceTo(originalRoot)).toBeLessThan(1e-7);
    } finally {
      human.dispose();
    }
  });
  it("rejects unsupported animation joints before mutating any bone",()=>{
    const human=createSkinningSpike({forearmSkinning:true,shoulderSkinning:true});
    try{
      const fk=new AnatomicalFK(human.graph,human.bones,{
        forearmSkinBones:human.forearmSkinBones,shoulderSkinBones:human.shoulderSkinBones});
      const before=human.skeleton.bones.map(b=>b.quaternion.clone());
      expect(()=>fk.applyRestDeltas([{jointId:"invalid",rotation:[0,0,0,1]}])).toThrow();
      expect(()=>fk.applyRestDeltas([{jointId:human.graph.joints[0]!.id,rotation:[0,0,0,2]}])).toThrow();
      human.skeleton.bones.forEach((b,i)=>
        expect(b.quaternion.angleTo(before[i]!)).toBeLessThan(1e-7));
    }finally{human.dispose();}
  });
});
