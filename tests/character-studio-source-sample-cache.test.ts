import {describe,expect,it,vi} from "vitest";
import {make} from "./helpers/studio-two-hand-fixtures";
import {sourceHandSamples} from "../apps/web/src/studio/StudioSourceContact";

describe("C5 shared source-hand sample cache",()=>{
  it("reuses classified source regions across equipment calls without changing indices",()=>{
    const {human,model}=make();
    const indices=human.mesh.geometry.getAttribute("skinIndex");
    const reads=vi.spyOn(indices,"getComponent");
    try{
      const initial=sourceHandSamples(model,"left",80);
      const scanned=reads.mock.calls.length;
      expect(scanned).toBeGreaterThan(0);
      const again=sourceHandSamples(model,"left",80);
      expect([...again]).toEqual([...initial]);
      expect(again).not.toBe(initial);
      expect(reads.mock.calls.length).toBe(scanned);
      // A solver can replace a selected region without poisoning the cache.
      (again as Map<string,readonly number[]>).set("thumb",[]);
      expect(sourceHandSamples(model,"left",80).get("thumb"))
        .toEqual(initial.get("thumb"));
      const full=sourceHandSamples(model,"left");
      expect(reads.mock.calls.length).toBeGreaterThan(scanned);
      expect(full.get("thumb")!.length)
        .toBeGreaterThanOrEqual(initial.get("thumb")!.length);
      const afterFull=reads.mock.calls.length;
      sourceHandSamples(model,"left");
      expect(reads.mock.calls.length).toBe(afterFull);
    }finally{reads.mockRestore();human.dispose();}
  });

  it("invalidates on skin and bind-position attribute revisions",()=>{
    const {human,model}=make();
    const geometry=human.mesh.geometry;
    const skin=geometry.getAttribute("skinIndex");
    const position=geometry.getAttribute("position");
    const reads=vi.spyOn(skin,"getComponent");
    try{
      sourceHandSamples(model,"right",32);
      const cold=reads.mock.calls.length;
      sourceHandSamples(model,"right",32);
      expect(reads.mock.calls.length).toBe(cold);
      skin.needsUpdate=true;
      sourceHandSamples(model,"right",32);
      const afterSkin=reads.mock.calls.length;
      expect(afterSkin).toBeGreaterThan(cold);
      position.needsUpdate=true;
      sourceHandSamples(model,"right",32);
      expect(reads.mock.calls.length).toBeGreaterThan(afterSkin);
    }finally{reads.mockRestore();human.dispose();}
  });

  it("preserves left/right full-source acceptance and mirrored bounded probes",()=>{
    const {human,model}=make();
    try{
      for(const hand of ["left","right"] as const){
        const full=sourceHandSamples(model,hand);
        const limited=sourceHandSamples(model,hand,32);
        for(const [region,indices] of limited){
          expect(indices.length).toBeGreaterThanOrEqual(8);
          expect(indices.length).toBeLessThanOrEqual(32);
          expect(new Set(indices).size).toBe(indices.length);
          expect(indices.every(index=>full.get(region)!.includes(index))).toBe(true);
        }
      }
    }finally{human.dispose();}
  });
});
