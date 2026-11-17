import {describe,expect,it} from "vitest";
import {fitConstrainedIK} from "../apps/web/src/studio/ConstrainedIK";
import {captureStudioSolverCounters,countStudioSolverWork} from
  "../apps/web/src/studio/StudioSolverDiagnostics";
import {StudioBodyCollision} from "../apps/web/src/studio/StudioBodyCollision";
import {make} from "./helpers/studio-two-hand-fixtures";

describe("C5.5 opt-in diagnostic counters",()=>{
  it("counts exact deterministic IK evaluations and restores scope on exit",()=>{
    const run=()=>captureStudioSolverCounters(()=>fitConstrainedIK(
      [0],[{min:-1,max:1}],x=>[x[0]!-0.25],8));
    const a=run(),b=run();
    expect(a.result).toEqual(b.result);
    expect(a.counters).toEqual(b.counters);
    expect(a.counters.ikFits).toBe(1);
    expect(a.counters.ikObjectives).toBe(a.result.evaluations);
    expect(a.counters.ikIterations).toBe(a.result.iterations);
    expect(()=>captureStudioSolverCounters(()=>
      captureStudioSolverCounters(()=>undefined))).toThrow("Nested");
    const again=run();
    expect(again.counters).toEqual(a.counters);
    countStudioSolverWork("ikObjectives");
    expect(again.counters.ikObjectives).toBe(a.counters.ikObjectives);
  });
  it("counts source torso construction but not an unrelated outside sample",()=>{
    const {human,model}=make();
    try{
      const result=captureStudioSolverCounters(()=>new StudioBodyCollision(model));
      expect(result.counters.torsoBuilds).toBe(1);
      expect(result.counters.torsoSourceVertices)
        .toBe(result.result.sourceVertices);
      expect(result.counters.torsoTriangles)
        .toBe(result.result.sourceTriangleCount);
      countStudioSolverWork("torsoBuilds",100);
      expect(result.counters.torsoBuilds).toBe(1);
    }finally{human.dispose();}
  });
});
