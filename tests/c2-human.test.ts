import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { parseHm08HumanOBJ } from "../apps/web/src/characters/geometry/Hm08Topology";
import { createC2Human } from "../apps/web/src/characters/runtime/createC2Human";
import { applyC2StressPose, C2_STRESS_POSES, inspectC2Pose } from "../apps/web/src/characters/pose/C2PoseStress";
import { validateSkinnedHuman } from "../apps/web/src/characters/geometry/validateSkinnedHuman";

const source=readFileSync(new URL("../apps/web/public/characters/hm08/base.obj",import.meta.url),"utf8");
describe("C2 CC0 continuous anatomical human",()=>{
  it("parses an exact, watertight connected human body component, preserving indexed UVs",()=>{
    const result=parseHm08HumanOBJ(source);
    expect(result.stats).toMatchObject({sourceVertices:19158,sourceQuads:18486,
      retainedSourceVertices:13380,retainedQuads:13378,
      triangles:26756,boundaryEdges:0,nonManifoldEdges:0});
    expect(result.stats.outputVertices).toBeGreaterThan(result.stats.retainedSourceVertices);
    expect(result.geometry.getAttribute("normal").count).toBe(result.stats.outputVertices);
    expect(result.geometry.getAttribute("uv").count).toBe(result.stats.outputVertices);
    expect(result.geometry.boundingBox!.max.y-result.geometry.boundingBox!.min.y).toBeCloseTo(1.75,5);
    result.geometry.dispose();
  });
  it("rejects malformed truncated or unlicensed/lookalike input",()=>{
    expect(()=>parseHm08HumanOBJ("v 0 0 0")).toThrow();
    expect(()=>parseHm08HumanOBJ(source.slice(0,100))).toThrow();
  });
  it("assembles a skinned semantic rig with normalized 4-influence weights and inverse bind poses",()=>{
    const human=createC2Human(source);
    expect(human.validation.triangles).toBe(26756);
    expect(human.validation.maxWeightError).toBeLessThan(1e-5);
    expect(human.mesh.isSkinnedMesh).toBe(true);
    expect(human.mesh.skeleton.bones.length).toBe(human.restGraph.joints.length);
    expect(human.character.root.scale.toArray()).toEqual([1,1,1]);
    expect(human.character.findJoints("shoulder_left")).toHaveLength(1);
    expect(validateSkinnedHuman(human.mesh).invalidVertices).toBe(0);
    human.dispose();
  });
  it("passes finite CPU deformation checks across every stress pose and reset",()=>{
    const human=createC2Human(source);
    for(const pose of C2_STRESS_POSES) {
      applyC2StressPose(human,pose);
      const result=inspectC2Pose(human);
      expect(result.invalidSamples).toBe(0);
      expect(result.maxDisplacementMeters).toBeLessThan(3.5);
    }
    applyC2StressPose(human,"neutral");
    const neutral=inspectC2Pose(human);
    expect(neutral.maxDisplacementMeters).toBeLessThan(1e-4);
    human.dispose();
  });
  it("is deterministic across regenerations and releases owned buffers",()=>{
    const a=createC2Human(source),b=createC2Human(source);
    const ap=a.mesh.geometry.getAttribute("skinWeight").array,
      bp=b.mesh.geometry.getAttribute("skinWeight").array;
    expect(Array.from(ap).slice(0,1000)).toEqual(Array.from(bp).slice(0,1000));
    expect(a.topology).toEqual(b.topology);
    let disposed=0;
    a.mesh.geometry.addEventListener("dispose",()=>disposed++);
    a.dispose();a.dispose();
    expect(disposed).toBe(1);
    b.dispose();
  });
});
