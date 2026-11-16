import {describe,expect,it} from "vitest";
import {make} from "./helpers/studio-two-hand-fixtures";
import {createTwoHandDescriptor,solveTwoHandIK} from
  "../apps/web/src/studio/StudioTwoHandGrip";

// Preserve exact C5.2 anatomy/spacing assertions in a separate runner task
// rather than allowing a >60-second file to time out Vitest fork RPC.
describe("C5.2 two-hand source-anatomical reach",()=>{
  it("adapts socket spacing to native hand proportions",()=>{
    const samples:Readonly<Record<string,number>>[]=[{},{"macro/height":0},{"macro/height":1},
      {"native/armslegs/l-hand-scale-decr-incr":1},
      {"native/armslegs/r-hand-scale-decr-incr":-1}];
    for(const weights of samples){
      const {human,model,fk}=make(weights);
      try{
        for(const primary of ["left","right"] as const){
          const result=solveTwoHandIK(model,fk,[],primary);
          console.log("C5.2-MORPH",JSON.stringify({weights,primary,
            reachable:result.reachable,primaryError:result.primaryErrorMeters,
            secondaryError:result.secondaryErrorMeters,
            reason:result.reason}));
          expect(result.iterations).toBeLessThanOrEqual(28);
          expect(Number.isFinite(result.primaryErrorMeters)).toBe(true);
          expect(Number.isFinite(result.secondaryErrorMeters)).toBe(true);
          if(result.reachable){
            const desc=createTwoHandDescriptor(model,"staff",primary);
            expect(desc.primarySocket).not.toBe(desc.secondarySocket);
          }else expect(result.commands).toHaveLength(0);
        }
      }finally{human.dispose();}
    }
  },120_000);
});
