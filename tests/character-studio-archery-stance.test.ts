import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {make} from "./helpers/studio-two-hand-fixtures";
import {coordinateTorsoAndGaze} from
  "../apps/web/src/studio/StudioUpperBodyCoordination";
import {archeryShootingPlaneYaw,type ArcheryState} from
  "../apps/web/src/studio/StudioArchery";
import {measureArmAlignment,bowArmExtensionResidual,measurePullLineAlignment}
  from "../apps/web/src/studio/StudioAnatomicalAlignment";

/** These tests exercise the shared legal rig, not a stylized bow/root offset.
 * Rendered multi-view acceptance and the existing true-skin string tests
 * remain independent requirements. */
describe("C5.4 upright, foot-planted shooting-plane coordination",()=>{
  it("advances smoothly through preparation, tension, and follow-through",()=>{
    const left=[
      archeryShootingPlaneYaw("rest",1,"left"),
      archeryShootingPlaneYaw("nock",1,"left"),
      ...[0,.25,.5,.75,1].map(x=>
        archeryShootingPlaneYaw("partial",x,"left")),
      archeryShootingPlaneYaw("aim",1,"left"),
    ];
    expect(left[0]).toBe(0);
    expect(left[1]).toBeCloseTo(left[2]!);
    expect(left.slice(1).every((v,i,a)=>i===0||v>=a[i-1]!-1e-10)).toBe(true);
    expect(left.at(-1)).toBeCloseTo(.85);
    expect(left[1]).toBeGreaterThan(.5);
    expect(archeryShootingPlaneYaw("release",1,"left")).toBeGreaterThan(.7);
    for(const state of ["rest","nock","partial","aim","release"] as ArcheryState[])
      for(const draw of [0,.25,.5,.75,1])
        expect(archeryShootingPlaneYaw(state,draw,"right"))
          .toBeCloseTo(-archeryShootingPlaneYaw(state,draw,"left"),10);
  });

  it.each(["left","right"] as const)(
    "turns the %s bow shoulder toward +Z while retaining gaze and planted feet",
    hand=>{
      const {human,fk}=make();
      try{
        const root=human.spike.character.root;
        root.updateWorldMatrix(true,true);
        const unchangedRoot=root.matrixWorld.clone();
        const graph=human.spike.graph;
        const joint=(role:string)=>{
          const matches=graph.joints.filter(j=>j.role===role);
          expect(matches).toHaveLength(1);
          return human.spike.bones.get(matches[0]!.id)!;
        };
        const bowShoulder=joint("shoulder_"+hand);
        const drawingShoulder=joint("shoulder_"+(hand==="left"?"right":"left"));
        const head=joint("head");
        const foot=joint("ankle_left");
        const firstFoot=foot.getWorldPosition(new THREE.Vector3());
        const initialHead=head.getWorldQuaternion(new THREE.Quaternion());
        const pose=coordinateTorsoAndGaze(graph,fk,[],
          archeryShootingPlaneYaw("aim",1,hand));
        for(const c of pose){
          const limit=fk.frames.get(c.jointId)?.freedoms.get(c.motion);
          expect(limit).toBeDefined();
          expect(c.radians).toBeGreaterThanOrEqual(limit!.min);
          expect(c.radians).toBeLessThanOrEqual(limit!.max);
        }
        expect(pose).toHaveLength(4);
        fk.apply(pose);
        root.updateWorldMatrix(true,true);
        const inverse=root.matrixWorld.clone().invert();
        const forwardGap=bowShoulder.getWorldPosition(new THREE.Vector3())
          .applyMatrix4(inverse).z-
          drawingShoulder.getWorldPosition(new THREE.Vector3())
            .applyMatrix4(inverse).z;
        expect(forwardGap).toBeGreaterThan(.10);
        // The neck and head counter-rotate the two spinal joints rather
        // than forcing the character root or neck to face sideways.
        const newHead=head.getWorldQuaternion(new THREE.Quaternion());
        expect(newHead.angleTo(initialHead)).toBeLessThan(.15);
        expect(root.matrixWorld.elements).toEqual(unchangedRoot.elements);
        expect(foot.getWorldPosition(new THREE.Vector3())
          .distanceTo(firstFoot)).toBeLessThan(1e-7);
        fk.apply([]);
      }finally{human.dispose();}
    },
  );

  it("composes with unrelated FK commands without rewriting them",()=>{
    const {human,fk}=make();
    try{
      const graph=human.spike.graph;
      const joint=graph.joints.find(j=>j.role==="jaw")!;
      const base=[{jointId:joint.id,motion:"flexion" as const,radians:.2}];
      const result=coordinateTorsoAndGaze(graph,fk,base,.4);
      expect(result).toContainEqual(base[0]);
      const same=coordinateTorsoAndGaze(graph,fk,result,0);
      expect(same).toEqual(result);
      fk.apply(result);
    }finally{human.dispose();}
  });
});

describe("Reusable source-skeleton bow-arm and drawing-line geometry",()=>{
  it("favors a nearly straight elbow but does not require locked joints",()=>{
    const shoulder=new THREE.Vector3(0,0,0);
    const elbow=new THREE.Vector3(0,0,.30);
    const wrist=new THREE.Vector3(0,0,.60);
    const straight=measureArmAlignment(shoulder,elbow,wrist);
    expect(straight.elbowInteriorRadians).toBeCloseTo(Math.PI,8);
    expect(straight.extensionDeficitMeters).toBeCloseTo(0,8);
    expect(bowArmExtensionResidual(straight,THREE.MathUtils.degToRad(12)))
      .toBe(0);
    const bent=measureArmAlignment(shoulder,elbow,
      new THREE.Vector3(.20,0,.45));
    expect(bent.elbowInteriorRadians).toBeLessThan(Math.PI);
    expect(bent.extensionDeficitMeters).toBeGreaterThan(0);
    expect(bowArmExtensionResidual(bent,THREE.MathUtils.degToRad(12)))
      .toBeGreaterThan(0);
  });
  it("measures an elbow drawn behind the hook independently of sagittal reflection",()=>{
    const grip=new THREE.Vector3(0,1.4,.65);
    const hook=new THREE.Vector3(0,1.4,.18);
    const elbow=new THREE.Vector3(.07,1.4,-.16);
    const line=measurePullLineAlignment(grip,hook,elbow);
    expect(line.behindHookMeters).toBeCloseTo(.34);
    expect(line.perpendicularMeters).toBeCloseTo(.07);
    const mirrored=measurePullLineAlignment(
      grip.clone().setX(-grip.x),hook.clone().setX(-hook.x),
      elbow.clone().setX(-elbow.x));
    expect(mirrored).toEqual(line);
  });
});
