import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { parseAnatomicalOBJ, bindTemplateToSemanticRig } from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import { AnatomicalFK } from
  "../apps/web/src/characters/geometry/AnatomicalFK";
import { AnatomicalGeometryAuditor } from
  "../apps/web/src/characters/geometry/AnatomicalGeometryAudit";
import { anatomicalPoseById, resolveAnatomicalPose } from
  "../apps/web/src/characters/geometry/AnatomicalPoseMatrix";
import type { SourceRig, SourceWeights } from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

const asset = (name:string):string => readFileSync(
  new URL("../apps/web/public/anatomy/" + name,import.meta.url),"utf8");
function sourceSession(){
  const template=parseAnatomicalOBJ(asset("makehuman-base.obj"),{includeGroups:["body"]});
  const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
  const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
  const human=bindTemplateToSemanticRig(template,{rig,weights});
  const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
    jawTipWorldRest:human.jawTipWorldRest,
    forearmSkinBones:human.spike.forearmSkinBones,
    shoulderSkinBones:human.spike.shoulderSkinBones,
  });
  return { human, fk };
}
describe("C2.5 global pinned-source deformation measurement (real CPU skin, no GPU)",()=>{
  it("reports source-edge, surface-area and absolute enclosed-volume diagnostics for high-risk poses",()=>{
    const {human,fk}=sourceSession();
    try{
      const audit=new AnatomicalGeometryAuditor(human);
      const modes=["neutral","overhead","shoulder-combined","elbow-stress",
        "hip-stress","deep-crouch","jaw","whole-asymmetric","whole-extreme"];
      const results= modes.map(poseId=>{
        fk.apply(resolveAnatomicalPose(anatomicalPoseById(poseId),human.spike.graph,fk));
        return audit.measure(poseId);
      });
      const neutral=results[0]!;
      expect(neutral.version).toBe(1);
      expect(neutral.triangles).toBe(human.triangleCount);
      expect(neutral.measuredSourceEdges).toBeGreaterThan(1000);
      expect(neutral.areaRatioFromRest).toBeCloseTo(1,5);
      expect(neutral.volumeRatioFromRest).toBeCloseTo(1,5);
      for(const measured of results){
        expect(measured.nonfiniteVertices).toBe(0);
        expect(measured.surfaceAreaSquareMeters).toBeGreaterThan(0);
        expect(measured.absoluteEnclosedVolumeCubicMeters).toBeGreaterThan(0);
        expect(measured.areaRatioFromRest).toBeGreaterThan(0);
        expect(measured.volumeRatioFromRest).toBeGreaterThan(0);
        expect(measured.edgeRmsPercent).toBeGreaterThanOrEqual(0);
        expect(measured.edgeP95Percent).toBeGreaterThanOrEqual(0);
        expect(measured.edgeMaxPercent).toBeGreaterThanOrEqual(measured.edgeP95Percent);
        expect(measured.worstSourceEdge.length).toBe(2);
        expect(measured.degenerateTriangles).toBeGreaterThanOrEqual(0);
        expect(Object.values(measured).filter(v=>typeof v==="number").every(Number.isFinite))
          .toBe(true);
      }
      console.info("C2_5_WHOLE_BODY_GEOMETRY_AUDIT",JSON.stringify(results));
      fk.apply([]);
      expect(audit.measure("recovered")).toEqual({...neutral,poseId:"recovered"});
      fk.apply(resolveAnatomicalPose(anatomicalPoseById("whole-extreme"),
        human.spike.graph,fk));
      expect(audit.measure("whole-extreme")).toEqual(results.at(-1));
    }finally{human.dispose();}
  });

  it("detects a normalized but incorrect joint-owned source weight mutation through surface metrics",()=>{
    const {human,fk}=sourceSession();
    try{
      const audit=new AnatomicalGeometryAuditor(human);
      fk.apply(resolveAnatomicalPose(anatomicalPoseById("wrist"),
        human.spike.graph,fk));
      const correct=audit.measure("wrist");
      const skin=human.mesh.geometry.getAttribute("skinIndex");
      const weights=human.mesh.geometry.getAttribute("skinWeight");
      const wristId=human.spike.graph.joints.find(j=>j.role==="wrist_left")!.id;
      const elbowId=human.spike.graph.joints.find(j=>j.role==="elbow_left")!.id;
      const wristIndex=human.spike.skeleton.bones.indexOf(human.spike.bones.get(wristId)!);
      const elbowIndex=human.spike.skeleton.bones.indexOf(human.spike.bones.get(elbowId)!);
      const mutated:number[]=[];
      const restored=new Map<number,{ids:[number,number,number,number];weights:[number,number,number,number]}>();
      for(let i=0;i<skin.count;i++){
        // Mutate an actual left-wrist-owned patch, including every UV copy of
        // a source vertex, without disrupting four-weight normalization.
        if(skin.getX(i)!==wristIndex||weights.getX(i)<.95)continue;
        const p=new THREE.Vector3().fromBufferAttribute(human.mesh.geometry.getAttribute("position"),i);
        if(!Number.isFinite(p.x))continue;
        if(mutated.length>=128)break;
        restored.set(i,{ids:[0,1,2,3].map(k=>skin.getComponent(i,k)) as
          [number,number,number,number],weights:[0,1,2,3].map(k=>weights.getComponent(i,k)) as
          [number,number,number,number]});
        skin.setXYZW(i,elbowIndex,0,0,0);
        weights.setXYZW(i,1,0,0,0);
        mutated.push(i);
      }
      expect(mutated.length).toBeGreaterThan(8);
      const damaged=audit.measure("wrist");
      expect(Math.abs(damaged.surfaceAreaSquareMeters-correct.surfaceAreaSquareMeters)+
        Math.abs(damaged.edgeRmsPercent-correct.edgeRmsPercent))
        .toBeGreaterThan(1e-5);
      for(const [i,original] of restored){
        skin.setXYZW(i,...original.ids);weights.setXYZW(i,...original.weights);
      }
      expect(audit.measure("wrist")).toEqual(correct);
    }finally{human.dispose();}
  });
});
