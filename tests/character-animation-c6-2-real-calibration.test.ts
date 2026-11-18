import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Group, Object3D, Float32BufferAttribute, Quaternion, Vector3 } from "three";
import { createAnatomyPreset } from "../packages/character-core/src/presets";
import { createHumanRestDescriptor } from "../packages/character-core/src/retarget-human-frames";
import { createRetargetProfile, retargetWorldPose } from "../packages/character-core/src/retargeting";
import { mapUAL1StandardJoints } from "../apps/web/src/characters/animation/UAL1SkeletonAdapter";
import { createSkinningSpike } from "../apps/web/src/characters/geometry/SkinningSpike";
import { parseAnatomicalOBJ } from "../apps/web/src/characters/geometry/AnatomicalTemplate";
import { calibrateHumanBones, makeSourceLandmarks } from "../apps/web/src/characters/geometry/OfficialHumanRig";
import type { Quat, Vec3 } from "../packages/character-core/src/schema";

const vector=(v:Vector3):Vec3=>[v.x,v.y,v.z];
const quat=(v:Quaternion):Quat=>[v.x,v.y,v.z,v.w];
const hash=(input:Buffer)=>createHash("sha256").update(input).digest("hex");

describe("C6.2 real UAL1 neutral to actual MakeHuman rig calibration",()=>{
  it("constructs a reusable full-frame profile from source rest and the real calibrated C1 bind",()=>{
    const graph=createAnatomyPreset({archetype:"human"});
    const source=JSON.parse(readFileSync(
      "assets/animations/sources/ual1-standard-locomotion-v1.json","utf8")) as {
        sourceGlbSha256:string;
        nodes:{name:string;parent:number|null;
          translation:Vec3;rotation:Quat;scale:Vec3}[];
      };
    const mappings=mapUAL1StandardJoints(graph,source.nodes.map(n=>n.name));
    const nodes=source.nodes.map(n=>{
      const obj=new Object3D();
      obj.name=n.name;
      obj.position.set(...n.translation);
      obj.quaternion.set(...n.rotation);
      obj.scale.set(...n.scale);
      return obj;
    });
    const scene=new Group();
    source.nodes.forEach((n,i)=>
      (n.parent===null?scene:nodes[n.parent]!).add(nodes[i]!));
    scene.updateMatrixWorld(true);
    const nodeByName=new Map(nodes.map(n=>[n.name,n]));
    const sourceSamples=mappings.map(m=>{
      const n=nodeByName.get(m.sourceId)!;
      return {targetJointId:m.targetId,nodeId:m.sourceId,
        worldPosition:vector(n.getWorldPosition(new Vector3())),
        worldRotation:quat(n.getWorldQuaternion(new Quaternion()))};
    });
    const sourceRig=createHumanRestDescriptor(graph,source.sourceGlbSha256,
      sourceSamples,{sourceMapping:mappings});

    const objBytes=readFileSync("apps/web/public/anatomy/makehuman-base.obj");
    const skeletonBytes=readFileSync("apps/web/public/anatomy/makehuman-default.mhskel");
    const template=parseAnatomicalOBJ(objBytes.toString("utf8"),
      {includeGroups:["body"]});
    const spike=createSkinningSpike({forearmSkinning:true,shoulderSkinning:true});
    try{
      const landmarks=makeSourceLandmarks(JSON.parse(skeletonBytes.toString("utf8")),
        template,new Float32BufferAttribute(template.sourcePositions,3));
      const root=spike.skeleton.bones[0]!.parent!;
      calibrateHumanBones(graph,spike.bones,spike.skeleton,root,landmarks,
        spike.forearmSkinBones,spike.shoulderSkinBones);
      root.updateMatrixWorld(true);
      const targetSamples=graph.joints.map(j=>{
        const bone=spike.bones.get(j.id)!;
        return {targetJointId:j.id,nodeId:j.id,
          worldPosition:vector(bone.getWorldPosition(new Vector3())),
          worldRotation:quat(bone.getWorldQuaternion(new Quaternion()))};
      });
      const targetRig=createHumanRestDescriptor(graph,
        hash(Buffer.concat([objBytes,skeletonBytes])),targetSamples);
      const profile=createRetargetProfile(sourceRig,targetRig,mappings);
      expect(profile.calibrations).toHaveLength(mappings.length);
      expect(profile.calibrations.length).toBe(49);
      const sourceRest=new Map(sourceRig.joints.map(j=>[j.id,j.restWorldRotation]));
      const neutral=retargetWorldPose(profile,targetRig,sourceRest,
        sourceRig.identitySha256);
      expect(neutral).toHaveLength(mappings.length);
      for(const pose of neutral){
        expect(new Quaternion(...pose.rotation).angleTo(new Quaternion()))
          .toBeLessThan(1e-6);
      }
    }finally{
      template.geometry.dispose();
      spike.dispose();
    }
  });
});
