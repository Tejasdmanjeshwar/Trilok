import { describe, expect, it } from "vitest";
import {
  anatomicalFrame, createRetargetProfile, retargetWorldPose,
  type RetargetRigDescriptorV1, type RetargetRigJointV1,
} from "../packages/character-core/src/retargeting";
import type { Quat, Vec3 } from "../packages/character-core/src/schema";
import { Quaternion, Vector3 } from "three";

const hash=(digit:string)=>digit.repeat(64);
const q=(axis:Vec3,angle:number):Quat=>{
  const quat=new Quaternion().setFromAxisAngle(new Vector3(...axis).normalize(),angle);
  return [quat.x,quat.y,quat.z,quat.w];
};
const quat=(v:Quat)=>new Quaternion(...v);
const tuple=(v:Quaternion):Quat=>[v.x,v.y,v.z,v.w];
const rotate=(v:Vec3,r:Quat):Vec3=>{
  const out=new Vector3(...v).applyQuaternion(quat(r));
  return [out.x,out.y,out.z];
};
function rig(sha:string,joints:readonly RetargetRigJointV1[]):RetargetRigDescriptorV1{
  return {schemaVersion:1,identitySha256:hash(sha),
    coordinates:"trilok-y-up-z-forward-meters",joints};
}
const joint=(id:string,parentId:string|null,rot:Quat,shaft:Vec3,
  secondary:Vec3):RetargetRigJointV1=>({
  id,parentId,restWorldPosition:[0,0,0],restWorldRotation:rot,
  shaftWorld:shaft,secondaryWorld:secondary,
});
function approxRotation(a:Quat,b:Quat,tolerance=1e-6){
  expect(quat(a).angleTo(quat(b))).toBeLessThan(tolerance);
}
describe("C6.2 reusable anatomical retarget core",()=>{
  it("defines complete signed orthonormal frames instead of one-axis alignment",()=>{
    const f=anatomicalFrame([0,1,0],[0,0,1]);
    approxRotation(f,[0,0,0,1]);
    const twist=anatomicalFrame([0,1,0],[1,0,0]);
    expect(quat(f).angleTo(quat(twist))).toBeCloseTo(Math.PI/2,6);
    expect(()=>anatomicalFrame([0,1,0],[0,2,0])).toThrow(/collinear/);
    expect(()=>anatomicalFrame([0,0,0],[1,0,0])).toThrow(/zero/);
  });
  it("preserves neutral rest with distinct T/A orientations and arbitrary swing/twist",()=>{
    const sa=q([0,0,1],Math.PI/2);
    const ta=q([0,0,1],Math.PI/4);
    const source=rig("a",[joint("arm",null,sa,[1,0,0],[0,0,1])]);
    const target=rig("b",[joint("arm",null,ta,
      [Math.SQRT1_2,Math.SQRT1_2,0],[0,0,1])]);
    const profile=createRetargetProfile(source,target,[{sourceId:"arm",targetId:"arm"}]);
    expect(profile.calibrations).toHaveLength(1);
    const neutral=retargetWorldPose(profile,target,new Map([["arm",sa]]),source.identitySha256);
    approxRotation(neutral[0]!.rotation,[0,0,0,1]);
    for(const input of [
      q([1,0,0],.4),q([0,1,0],.8),q([0,0,1],Math.PI),
      q([.3,.7,.5],1.4),
    ]){
      const animated=tuple(quat(input).multiply(quat(sa)));
      const result=retargetWorldPose(profile,target,new Map([["arm",animated]]),
        source.identitySha256);
      const conversion=quat(profile.calibrations[0]!.frameConversion);
      const expected=conversion.clone().multiply(quat(input))
        .multiply(conversion.clone().invert());
      approxRotation(result[0]!.rotation,
        tuple(quat(ta).invert().multiply(expected).multiply(quat(ta))));
    }
  });
  it("reconstructs animated target parent space and preserves bilateral finger identity",()=>{
    const id:Quat=[0,0,0,1];
    const source=rig("a",[
      joint("root",null,id,[0,1,0],[0,0,1]),
      joint("L", "root", id,[0,-1,0],[0,0,1]),
      joint("R", "root", id,[0,-1,0],[0,0,-1]),
    ]);
    const target=rig("b",[
      joint("root",null,id,[0,1,0],[0,0,1]),
      joint("finger[left,0]","root",id,[0,-1,0],[0,0,1]),
      joint("finger[right,0]","root",id,[0,-1,0],[0,0,-1]),
    ]);
    const profile=createRetargetProfile(source,target,[
      {sourceId:"root",targetId:"root"},
      {sourceId:"L",targetId:"finger[left,0]"},
      {sourceId:"R",targetId:"finger[right,0]"},
    ]);
    const pose=retargetWorldPose(profile,target,new Map([
      ["root",q([0,1,0],.3)],["L",q([1,0,0],.5)],["R",q([0,0,1],-.6)],
    ]),source.identitySha256);
    expect(pose.map(v=>v.jointId)).toEqual(["root","finger[left,0]","finger[right,0]"]);
    expect(quat(pose[1]!.rotation).angleTo(quat(pose[2]!.rotation)))
      .toBeGreaterThan(.1);
    expect(pose.every(p=>Math.abs(Math.hypot(...p.rotation)-1)<1e-9)).toBe(true);
  });
  it("rejects duplicate, missing, stale and ambiguous rig mappings",()=>{
    const id:Quat=[0,0,0,1];
    const source=rig("a",[joint("left",null,id,[0,1,0],[0,0,1])]);
    const target=rig("b",[joint("right",null,id,[0,1,0],[0,0,1])]);
    expect(()=>createRetargetProfile(source,target,[
      {sourceId:"left",targetId:"right"},{sourceId:"left",targetId:"right"},
    ])).toThrow(/duplicate/);
    expect(()=>createRetargetProfile(source,target,[
      {sourceId:"absent",targetId:"right"},
    ])).toThrow(/unknown/);
    const p=createRetargetProfile(source,target,[{sourceId:"left",targetId:"right"}]);
    expect(()=>retargetWorldPose(p,target,new Map(),source.identitySha256)).toThrow(/missing/);
    expect(()=>retargetWorldPose(p,target,new Map([["left",id]]),hash("c"))).toThrow(/stale/);
    expect(()=>createRetargetProfile(rig("a",[
      joint("one","two",id,[0,1,0],[0,0,1]),
      joint("two","one",id,[0,1,0],[0,0,1]),
    ]),target,[{sourceId:"one",targetId:"right"}])).toThrow(/cyclic/);
  });
});
