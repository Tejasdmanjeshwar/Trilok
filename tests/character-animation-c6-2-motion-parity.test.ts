import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import * as THREE from "three";
import {createAnatomyPreset} from "../packages/character-core/src/presets";
import {parseAnimationClip,createAnimationSampler} from "../packages/character-core/src/animation";
import {AnatomicalFK} from "../apps/web/src/characters/geometry/AnatomicalFK";
import {createSkinningSpike} from "../apps/web/src/characters/geometry/SkinningSpike";
import {parseAnatomicalOBJ} from "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {makeSourceLandmarks,calibrateHumanBones} from "../apps/web/src/characters/geometry/OfficialHumanRig";

type Node={name:string;parent:number|null;translation:number[];rotation:number[];scale:number[]};
type SourceClip={id:string;timesSeconds:number[];
  tracks:Record<string,{rotation?:number[][];translation?:number[][]}>};
const source=JSON.parse(readFileSync(
  "assets/animations/sources/ual1-standard-locomotion-v1.json","utf8")) as
  {nodes:Node[];clips:SourceClip[]};
const graph=createAnatomyPreset({archetype:"human"});

describe("C6.2 source-versus-real-MakeHuman anatomical trajectory",()=>{
  it("keeps shaft directions aligned across original UAL1 motion frames",()=>{
    const objects=source.nodes.map(n=>{
      const obj=new THREE.Object3D();
      obj.name=n.name;obj.position.fromArray(n.translation);
      obj.quaternion.fromArray(n.rotation);obj.scale.fromArray(n.scale);
      return obj;
    });
    const scene=new THREE.Group();
    source.nodes.forEach((n,i)=>
      (n.parent===null?scene:objects[n.parent]!).add(objects[i]!));
    const bySource=new Map(objects.map(obj=>[obj.name,obj]));
    const spike=createSkinningSpike({forearmSkinning:true,shoulderSkinning:true});
    const template=parseAnatomicalOBJ(readFileSync(
      "apps/web/public/anatomy/makehuman-base.obj","utf8"),{includeGroups:["body"]});
    try{
      const landmarks=makeSourceLandmarks(JSON.parse(readFileSync(
        "apps/web/public/anatomy/makehuman-default.mhskel","utf8")),
        template,new THREE.Float32BufferAttribute(template.sourcePositions,3));
      const root=spike.skeleton.bones[0]!.parent!;
      calibrateHumanBones(graph,spike.bones,spike.skeleton,root,landmarks,
        spike.forearmSkinBones,spike.shoulderSkinBones);
      const fk=new AnatomicalFK(graph,spike.bones,{
        forearmSkinBones:spike.forearmSkinBones,
        shoulderSkinBones:spike.shoulderSkinBones,
      });
      const byRole=new Map(graph.joints.map(j=>[j.role,j.id]));
      const target=(role:string)=>spike.bones.get(byRole.get(role)!)!;
      const segments=[
        ["upperarm_r","lowerarm_r","shoulder_left","elbow_left"],
        ["lowerarm_r","hand_r","elbow_left","wrist_left"],
        ["upperarm_l","lowerarm_l","shoulder_right","elbow_right"],
        ["lowerarm_l","hand_l","elbow_right","wrist_right"],
        ["thigh_r","calf_r","hip_left","knee_left"],
        ["calf_r","foot_r","knee_left","ankle_left"],
        ["thigh_l","calf_l","hip_right","knee_right"],
        ["calf_l","foot_l","knee_right","ankle_right"],
      ] as const;
      for(const input of source.clips){
        const baked=parseAnimationClip(readFileSync(
          "assets/animations/studio-v1/"+input.id+".clip.json","utf8"),graph);
        const sampler=createAnimationSampler(baked,graph);
        let worst=0;
        for(let frame=0;frame<input.timesSeconds.length;frame++){
          for(const [i,n] of source.nodes.entries()){
            const track=input.tracks[n.name];
            objects[i]!.quaternion.fromArray(
              track?.rotation?.[frame]??n.rotation);
            objects[i]!.position.fromArray(
              track?.translation?.[frame]??n.translation);
          }
          scene.updateMatrixWorld(true);
          fk.applyRestDeltas(sampler.sample(input.timesSeconds[frame]!));
          root.updateWorldMatrix(true,true);
          const pos=(o:THREE.Object3D)=>o.getWorldPosition(new THREE.Vector3());
          for(const [srcA,srcB,dstA,dstB] of segments){
            const sourceDir=pos(bySource.get(srcB)!).sub(pos(bySource.get(srcA)!)).normalize();
            const targetDir=pos(target(dstB)).sub(pos(target(dstA))).normalize();
            const gap=sourceDir.angleTo(targetDir);
            expect(Number.isFinite(gap)).toBe(true);
            worst=Math.max(worst,gap);
          }
        }
        console.log("C6.2 source/MakeHuman max primary segment direction gap",input.id,
          THREE.MathUtils.radToDeg(worst).toFixed(4),"degrees");
        // Direct source/target anatomical comparison. Less than 1 degree
        // across all source keys is required at this quality gate.
        expect(worst).toBeLessThan(THREE.MathUtils.degToRad(1));
      }
    }finally{template.geometry.dispose();spike.dispose();}
  });
});
