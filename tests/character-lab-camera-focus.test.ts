import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {frameSelectedAnatomicalBone} from
  "../apps/web/src/characters/lab/LabCameraFocus";

describe("Character Lab selected-bone Focus camera",()=>{
  it("frames semantic joint while preserving the current orbit direction",()=>{
    const camera=new THREE.PerspectiveCamera(42,1,.1,80);
    const target=new THREE.Vector3(0,1,0);
    camera.position.set(1,1.3,2);
    const bearing=camera.position.clone().sub(target).normalize();
    const selected={role:"jaw",position:new THREE.Vector3(.03,1.67,.04)};
    frameSelectedAnatomicalBone(camera,target,selected);
    expect(target.distanceTo(selected.position)).toBeLessThan(1e-9);
    expect(camera.position.clone().sub(target).normalize()
      .distanceTo(bearing)).toBeLessThan(1e-8);
    expect(camera.position.distanceTo(target)).toBeCloseTo(.36,6);
  });
  it("handles coincident camera target and uses a close finger framing",()=>{
    const camera=new THREE.PerspectiveCamera(42,1,.1,80);
    const target=new THREE.Vector3(0,0,0);
    camera.position.copy(target);
    frameSelectedAnatomicalBone(camera,target,{
      role:"finger_index_1",position:new THREE.Vector3(.5,1.2,.1),
    });
    expect(camera.position.distanceTo(target)).toBeCloseTo(.3,6);
    expect(target.toArray()).toEqual([.5,1.2,.1]);
  });
  it("does not modify other scene objects or skeleton state",()=>{
    const camera=new THREE.PerspectiveCamera(42,1,.1,80);
    camera.position.set(0,1,2);
    const target=new THREE.Vector3(0,1,0);
    const joint=new THREE.Bone();
    joint.position.set(.2,1.7,.05);
    const previous=joint.position.clone();
    frameSelectedAnatomicalBone(camera,target,{
      role:"head",position:joint.position.clone(),
    });
    expect(joint.position.equals(previous)).toBe(true);
  });
});
