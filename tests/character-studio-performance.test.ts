import {describe,it,expect} from "vitest";
import {StudioPerformance} from "../apps/web/src/studio/StudioPerformance";

describe("Character Studio bounded preview metrics",()=>{
  it("keeps finite, bounded frame samples and excludes hidden-time discontinuities",()=>{
    const metrics=new StudioPerformance();
    metrics.recordFrame(0);metrics.recordFrame(16);metrics.recordFrame(32);
    metrics.setSuspended(true);
    metrics.recordFrame(10000);
    metrics.setSuspended(false);
    metrics.recordFrame(10000);metrics.recordFrame(10016);
    const stats=metrics.snapshot({geometries:7,textures:3});
    expect(stats.frames).toEqual({samples:3,medianMs:16,p95Ms:16});
    expect(stats.gpu).toEqual({geometries:7,textures:3});
    expect(stats.initialLoadMs).toBeNull();
    expect(stats.suspended).toBe(false);
    metrics.recordFrame(10020);
    metrics.recordFrame(20000);metrics.recordFrame(20016);
    expect(metrics.snapshot().frames.samples).toBe(5);
  });
  it("records initial load once, edit quantiles, and prevents unbounded history",()=>{
    const metrics=new StudioPerformance();
    metrics.recordInitialLoad(NaN);
    metrics.recordInitialLoad(284);
    metrics.recordInitialLoad(999);
    for(let i=0;i<250;i++)metrics.recordEdit(i);
    metrics.recordEdit(Infinity);metrics.recordEdit(-1);
    const snapshot=metrics.snapshot();
    expect(snapshot.initialLoadMs).toBe(284);
    expect(snapshot.edits.samples).toBe(180);
    expect(snapshot.edits.medianMs).toBe(160);
    expect(snapshot.edits.p95Ms).toBe(241);
    expect(snapshot.gpu).toBeNull();
  });
});
