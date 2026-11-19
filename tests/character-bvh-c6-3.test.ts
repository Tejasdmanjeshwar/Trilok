import {describe,expect,it} from "vitest";
import {parseBVH,sampleBVHFrame,evaluateBVHWorldPose} from "../packages/character-core/src/bvh";

const sample=(rotations:string,frames:string[])=>
  `HIERARCHY
ROOT Hips {
 OFFSET 0 5 0
 CHANNELS 6 Xposition Yposition Zposition ${rotations}
 JOINT LeftHip {
  OFFSET 2 -1 0
  CHANNELS 3 Zrotation Xrotation Yrotation
  End Site { OFFSET 0 -2 0 }
 }
}
MOTION
Frames: ${frames.length}
Frame Time: 0.0166666666667
${frames.join("\n")}
`;

describe("C6.3 deterministic BVH importer",()=>{
  it("preserves declared axes, source trajectory, hierarchy and end sites",()=>{
    const input=sample("Yrotation Xrotation Zrotation",[
      "1 2 3 90 0 0 0 0 0", "4 5 6 0 0 0 0 0 0"
    ]);
    const source=parseBVH(input);
    expect(source.joints.map(x=>[x.name,x.parent,x.offset]))
      .toEqual([["Hips",null,[0,5,0]],["LeftHip",0,[2,-1,0]]]);
    expect(source.joints[1]!.endSites).toEqual([[0,-2,0]]);
    expect(source.frameTimeSeconds).toBeCloseTo(1/60,10);
    expect(source.values[0]).toEqual([1,2,3,90,0,0,0,0,0]);
    const first=sampleBVHFrame(source,0);
    expect(first.sourceRootTranslation).toEqual([1,2,3]);
    expect(first.translations[0]).toEqual([1,7,3]);
    expect(first.translations[1]).toEqual([2,-1,0]);
    expect(first.rotations[0]![1]).toBeCloseTo(Math.SQRT1_2,8);
    expect(sampleBVHFrame(source,1).sourceRootTranslation).toEqual([4,5,6]);
    const world=evaluateBVHWorldPose(source,0);
    expect(world.positions[0]).toEqual([1,7,3]);
    expect(world.positions[1]![0]).toBeCloseTo(1,8);
    expect(world.positions[1]![1]).toBeCloseTo(6,8);
    expect(world.positions[1]![2]).toBeCloseTo(1,8);
  });
  it("respects declared intrinsic Euler order rather than XYZ assumptions",()=>{
    const a=sampleBVHFrame(parseBVH(sample("Xrotation Yrotation Zrotation",[
      "0 0 0 90 45 30 0 0 0","0 0 0 90 45 30 0 0 0"
    ])),0);
    const b=sampleBVHFrame(parseBVH(sample("Zrotation Yrotation Xrotation",[
      "0 0 0 30 45 90 0 0 0","0 0 0 30 45 90 0 0 0"
    ])),0);
    expect(a.rotations[0]).not.toEqual(b.rotations[0]);
    expect(Math.hypot(...a.rotations[0]!)).toBeCloseTo(1,12);
  });
  it("rejects invalid hierarchies, undeclared channels, truncated and nonfinite motion",()=>{
    const ok=sample("Yrotation Xrotation Zrotation",[
      "0 0 0 0 0 0 0 0 0","0 0 0 0 0 0 0 0 0"
    ]);
    expect(()=>parseBVH(ok.replace("LeftHip","Hips"))).toThrow(/duplicate/);
    expect(()=>parseBVH(ok.replace("Zrotation Xrotation Yrotation","Zrotation Zrotation Yrotation"))).toThrow(/duplicate channel/);
    expect(()=>parseBVH(ok.replace("0 0 0 0 0 0 0 0 0\n",""))).toThrow();
    expect(()=>parseBVH(ok.replace("0 0 0 0 0 0 0 0 0","0 0 0 NaN 0 0 0 0 0"))).toThrow();
    expect(()=>parseBVH(ok.replace("Frame Time: 0.0166666666667","Frame Time: 0"))).toThrow();
    const data=parseBVH(ok);
    expect(()=>sampleBVHFrame(data,2)).toThrow();
  });
});
