import {describe,it,expect} from "vitest";
import * as THREE from "three";
import {DEFAULT_MAMMALIAN_HEAD_MORPHOLOGY} from
  "../packages/character-core/src/index";
import {calibrateVanaraFace} from
  "../apps/web/src/characters/geometry/VanaraFacialTopology";
import {frameSelectedAnatomicalBone} from
  "../apps/web/src/characters/lab/LabCameraFocus";

describe("C3.5 macaque facial region morphology",()=>{
  const face=calibrateVanaraFace(.31,.13,.11,
    DEFAULT_MAMMALIAN_HEAD_MORPHOLOGY);
  it("separates muzzle, buccal pads, lower jaw and the orbital depressions",()=>{
    const front=Math.PI/2;
    const muzzle=face.sample(0,.385,front);
    const crown=face.sample(0,.93,front);
    const jaw=face.sample(0,.22,front);
    const cheek=face.sample(face.cheekX*.79,.44,front);
    const temple=face.sample(face.cheekX*.79,.9,front);
    const orbit=face.sample(face.eyeX,face.eyeT,front);
    expect(muzzle.muzzle).toBeGreaterThan(.8);
    expect(muzzle.forward).toBeGreaterThan(crown.forward+.02);
    expect(jaw.jaw).toBeGreaterThan(.8);
    expect(jaw.forward).toBeGreaterThan(crown.forward+.015);
    expect(cheek.cheek).toBeGreaterThan(temple.cheek+.4);
    expect(orbit.orbit).toBeGreaterThan(.8);
    const brow=face.sample(face.eyeX,face.eyeT+.095,front);
    expect(brow.forward).toBeGreaterThan(orbit.forward+.005);
  });
  it("has paired dark recessed nostrils with distinct left/right centres",()=>{
    const angle=Math.PI/2;
    const left=face.sample(-.13*.125,face.noseT-.028,angle);
    const right=face.sample(.13*.125,face.noseT-.028,angle);
    expect(left.nostrilLeft).toBeGreaterThan(left.nostrilRight);
    expect(right.nostrilRight).toBeGreaterThan(right.nostrilLeft);
    const side=face.sample(0,face.noseT,Math.PI*1.5);
    const front=face.sample(0,face.noseT,angle);
    expect(front.nose).toBeGreaterThan(side.nose);
    expect(front.forward).toBeGreaterThan(side.forward);
  });
  it("bounds all sculpt offsets and keeps the chin following C1 jaw",()=>{
    for(const t of [0,.1,.2,.3,.4,.5,.6,.7,.8,.9,1]){
      for(const theta of [0,Math.PI/4,Math.PI/2,Math.PI,Math.PI*1.5]){
        const s=face.sample(.09*Math.cos(theta),t,theta);
        expect(Number.isFinite(s.forward)).toBe(true);
        expect(Math.abs(s.forward)).toBeLessThan(.17);
        expect(Math.abs(s.lateral)).toBeLessThan(.07);
        expect(s.jawWeight).toBeGreaterThanOrEqual(0);
        expect(s.jawWeight).toBeLessThanOrEqual(1);
      }
    }
    expect(face.sample(0,face.chinT,Math.PI/2).jawWeight)
      .toBeGreaterThan(face.sample(0,.9,Math.PI/2).jawWeight);
  });
});

describe("C3.5 Character Lab explicit Focus",()=>{
  it("frames selected C1 joint and preserves the orbit direction",()=>{
    const camera=new THREE.PerspectiveCamera(42,1,.1,80);
    const target=new THREE.Vector3(0,1,0);
    camera.position.set(1,1.3,2);
    const originalDirection=camera.position.clone().sub(target).normalize();
    const selected={role:"jaw",position:new THREE.Vector3(.03,1.67,.04)};
    frameSelectedAnatomicalBone(camera,target,selected);
    expect(target.distanceTo(selected.position)).toBeLessThan(1e-9);
    const direction=camera.position.clone().sub(target).normalize();
    expect(direction.distanceTo(originalDirection)).toBeLessThan(1e-8);
    expect(camera.position.distanceTo(target)).toBeCloseTo(.36,6);
  });
  it("works with zero initial orbit distance and different region scales",()=>{
    const camera=new THREE.PerspectiveCamera(42,1,.1,80);
    const target=new THREE.Vector3(0,0,0);
    camera.position.copy(target);
    frameSelectedAnatomicalBone(camera,target,{
      role:"finger_index_1",position:new THREE.Vector3(.5,1.2,.1)});
    expect(camera.position.distanceTo(target)).toBeCloseTo(.3,6);
    expect(target.toArray()).toEqual([.5,1.2,.1]);
  });
});
