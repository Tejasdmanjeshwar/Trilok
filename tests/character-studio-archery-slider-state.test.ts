import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {make} from "./helpers/studio-two-hand-fixtures";
import {StudioPosePreview} from "../apps/web/src/studio/StudioPosePreview";

describe("C5.5 partial-slider state independence",()=>{
  it.each(["left","right"] as const)(
    "keeps %s nock and full draw fixed while partial input changes",
    side=>{
      const {human,model}=make();
      const preview=new StudioPosePreview(model);
      try{
        preview.setGrip(side==="left"?"bow-left":"bow-right");
        preview.setArcheryDraw(0);
        preview.setArcheryState("aim");
        const fullAtZero=preview.bowPoseResult!;
        expect(fullAtZero.reachable).toBe(true);
        for(const amount of [.25,.5,.75,1]){
          preview.setArcheryDraw(amount);
          expect(preview.bowPoseResult).toBe(fullAtZero);
        }
        preview.setArcheryState("nock");
        const nock=preview.bowPoseResult!;
        preview.setArcheryDraw(0);
        expect(preview.bowPoseResult).toBe(nock);
        preview.setArcheryState("aim");
        const fullAtOne=preview.bowPoseResult!;
        expect(fullAtOne.reachable).toBe(true);
        const a=new THREE.Vector3().setFromMatrixPosition(fullAtZero.bowWorld);
        const b=new THREE.Vector3().setFromMatrixPosition(fullAtOne.bowWorld);
        expect(a.distanceTo(b)).toBeLessThan(.002);
        expect(fullAtZero.nockWorld.distanceTo(fullAtOne.nockWorld))
          .toBeLessThan(.002);
        preview.setArcheryState("partial");
        const partial=preview.bowPoseResult!;
        preview.setArcheryDraw(.5);
        expect(preview.bowPoseResult).not.toBe(partial);
        expect(preview.bowPoseResult?.reachable).toBe(true);
        for(const state of ["rest","release"] as const){
          preview.setArcheryState(state);
          const settled=preview.bowPoseResult!;
          preview.setArcheryDraw(.75);
          expect(preview.bowPoseResult).toBe(settled);
        }
        expect(()=>preview.setArcheryDraw(Number.NaN)).toThrow("Invalid archery draw");
        expect(()=>preview.setArcheryDraw(1.1)).toThrow("Invalid archery draw");
      }finally{
        preview.dispose();
        human.dispose();
      }
    },180_000);
});
