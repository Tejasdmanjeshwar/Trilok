import {describe,it,expect} from "vitest";
import * as THREE from "three";
import {make} from "./helpers/studio-two-hand-fixtures";
import {StudioPosePreview} from "../apps/web/src/studio/StudioPosePreview";
import {sourceHandSamples} from "../apps/web/src/studio/StudioSourceContact";

/** Diagnostic baseline: physical MakeHuman source skin, not skeleton pivots. */
describe("C5.4 arrow-rest source-skin baseline",()=>{
  it.each(["left","right"] as const)("records actual %s bow-hand shaft clearance",hand=>{
    const {human,model}=make();
    const pose=new StudioPosePreview(model);
    try{
      pose.setGrip(hand==="left"?"bow-left":"bow-right");
      for(const state of ["nock","aim"] as const){
        pose.setArcheryState(state);
        const result=pose.bowPoseResult!;
        expect(result.reachable).toBe(true);
        const inverse=result.bowWorld.clone().invert();
        const nock=result.nockWorld.clone().applyMatrix4(inverse);
        const arrow=new THREE.Line3(nock,nock.clone().add(
          new THREE.Vector3(0,0,result.descriptor.arrowLengthMeters)));
        const vertex=new THREE.Vector3(),near=new THREE.Vector3();
        const output:Record<string,unknown>={};
        model.human.mesh.updateWorldMatrix(true,false);
        for(const [region,indices] of sourceHandSamples(model,hand)){
          let nearest=Infinity,point:THREE.Vector3|undefined;
          let closestGrip=Infinity,grip:THREE.Vector3|undefined;
          let minY=Infinity,maxY=-Infinity;
          for(const id of indices){
            model.human.mesh.getVertexPosition(id,vertex).applyMatrix4(
              model.human.mesh.matrixWorld).applyMatrix4(inverse);
            arrow.closestPointToPoint(vertex,true,near);
            const dist=vertex.distanceTo(near);
            if(dist<nearest){nearest=dist;point=vertex.clone();}
            const d=Math.hypot(vertex.x,vertex.z);
            if(d<closestGrip){closestGrip=d;grip=vertex.clone();}
            if(Math.abs(vertex.z)<.035){
              minY=Math.min(minY,vertex.y);maxY=Math.max(maxY,vertex.y);
            }
          }
          output[region]={nearestMm:Math.round(nearest*1000),
            nearestPoint:point?.toArray().map(x=>Math.round(x*1000)),
            grip:grip?.toArray().map(x=>Math.round(x*1000)),
            minYmm:Math.round(minY*1000),maxYmm:Math.round(maxY*1000)};
        }
        console.log("C5.4 ARROW SOURCE BASELINE",JSON.stringify({
          hand,state,handleLengthMm:Math.round(result.descriptor.handleLengthMeters*1000),
          handleRadiusMm:Math.round(result.descriptor.handleRadiusMeters*1000),
          nock:nock.toArray().map(x=>Math.round(x*1000)),output}));
      }
    }finally{pose.dispose();human.dispose();}
  },120_000);
});
