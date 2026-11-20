import {describe,it,expect} from "vitest";
import {StudioGenerationTiming} from "../apps/web/src/studio/StudioGenerationTiming";

describe("Shareable generation timing recorder",()=>{
  it("records incomplete and failed stages without claiming they completed",()=>{
    const clock=new StudioGenerationTiming();
    clock.begin(1729,100,"2026-11-20T00:00:00.000Z");
    clock.stage("source","start",110);
    clock.stage("source:obj-fetch","end",600,450);
    let attempt=clock.snapshot(617)[0]!;
    expect(attempt.status).toBe("running");
    expect(attempt.elapsedMs).toBe(517);
    expect(attempt.currentStage).toBe("source");
    expect(attempt.stages.find(s=>s.name==="source")?.finished).toBe(false);
    expect(attempt.stages.find(s=>s.name==="source:obj-fetch")?.elapsedMs)
      .toBe(450);
    clock.finish("failed",700);
    attempt=clock.snapshot(900)[0]!;
    expect(attempt.elapsedMs).toBe(600);
    expect(attempt.status).toBe("failed");
    expect(attempt.stages.find(s=>s.name==="source")?.finished).toBe(false);
  });

  it("keeps the cold first attempt and last four warm attempts without leaks",()=>{
    const clock=new StudioGenerationTiming();
    for(let i=1;i<=8;i++){
      clock.begin(i,i*100,String(i));
      clock.stage("source","start",i*100+2);
      clock.stage("source","end",i*100+12,10);
      clock.stage("body-morph","start",i*100+15);
      clock.stage("body-morph","end",i*100+35,20);
      clock.finish("success",i*100+50);
    }
    const attempts=clock.snapshot(10000);
    expect(attempts.map(a=>a.attempt)).toEqual([1,5,6,7,8]);
    expect(attempts.map(a=>a.seed)).toEqual([1,5,6,7,8]);
    expect(attempts.map(a=>a.elapsedMs)).toEqual([50,50,50,50,50]);
    expect(attempts.every(a=>a.stages.every(s=>s.finished))).toBe(true);
  });

  it("rejects overlapping or invalid generation starts",()=>{
    const clock=new StudioGenerationTiming();
    expect(()=>clock.begin(0,1,"bad")).toThrow();
    clock.begin(42,1,"ok");
    expect(()=>clock.begin(43,2,"overlap")).toThrow();
  });
});
