import {describe,it,expect} from "vitest";
import * as THREE from "three";
import {createSkinningSpike} from "../apps/web/src/characters/geometry/SkinningSpike";
import {STUDIO_VIEWS} from "../apps/web/src/studio/StudioPresentation";
import {STUDIO_FOCUS} from "../apps/web/src/studio/StudioInspection";
import {isShortTap,isDoubleTap,positionForFocusedAngle,focusAreaForSkinTriangle,
  type StudioTap} from "../apps/web/src/studio/StudioSurfaceFocus";

const tap=(x:number,y:number,time:number,pointerType="touch"):StudioTap=>
  ({x,y,time,pointerType});
describe("Studio double-tap anatomical focus",()=>{
  it("accepts quick deliberate double taps across mouse and touch; rejects orbit, multi-gesture and distant clicks",()=>{
    expect(isShortTap(tap(100,90,100),tap(103,94,250))).toBe(true);
    expect(isShortTap(tap(100,90,100),tap(133,90,220))).toBe(false);
    expect(isShortTap(tap(100,90,100),tap(100,90,600))).toBe(false);
    expect(isDoubleTap(tap(100,90,100),tap(114,92,410))).toBe(true);
    expect(isDoubleTap(tap(100,90,100,"mouse"),tap(108,95,350,"mouse"))).toBe(true);
    expect(isDoubleTap(tap(100,90,100),tap(108,95,350,"mouse"))).toBe(false);
    expect(isDoubleTap(tap(100,90,100),tap(108,95,550))).toBe(false);
    expect(isDoubleTap(tap(100,90,100),tap(140,95,350))).toBe(false);
  });
  it("rotates around the same focused spot at unchanged distance for all camera presets",()=>{
    const target=new THREE.Vector3(-.24,1.43,.10);
    for(const distance of [.4,1.18,3.2]){
      for(const view of Object.values(STUDIO_VIEWS)){
        const position=positionForFocusedAngle(view,target,distance);
        expect(position.distanceTo(target)).toBeCloseTo(distance,8);
        expect(position.clone().sub(target).normalize()
          .distanceTo(new THREE.Vector3(...view.position)
            .sub(new THREE.Vector3(...view.target)).normalize())).toBeLessThan(1e-9);
      }
    }
    expect(()=>positionForFocusedAngle(STUDIO_VIEWS.front,target,0)).toThrow();
  });
  it("maps rendered skin weights to semantic anatomical regions without changing bone transforms",()=>{
    const spike=createSkinningSpike();
    const geom=new THREE.BufferGeometry();
    try{
      const ids=["shoulder_left","wrist_right","knee_left","jaw","hip_right"];
      for(const role of ids){
        const joint=spike.graph.joints.find(j=>j.role===role)!;
        expect(joint).toBeDefined();
        const index=spike.skeleton.bones.indexOf(spike.bones.get(joint.id)!);
        expect(index).toBeGreaterThanOrEqual(0);
        geom.setAttribute("skinIndex",new THREE.Uint16BufferAttribute([
          index,0,0,0,index,0,0,0,index,0,0,0],4));
        geom.setAttribute("skinWeight",new THREE.Float32BufferAttribute([
          1,0,0,0,1,0,0,0,1,0,0,0],4));
        const human={mesh:{geometry:geom},spike} as unknown as
          Parameters<typeof focusAreaForSkinTriangle>[0];
        const selected=focusAreaForSkinTriangle(human,{a:0,b:1,c:2});
        expect(selected).toBeDefined();
        expect(Object.keys(STUDIO_FOCUS)).toContain(selected);
      }
      expect(spike.skeleton.bones.every(b=>b.quaternion.lengthSq()>0)).toBe(true);
    }finally{
      geom.dispose();spike.dispose();
    }
  });
});
