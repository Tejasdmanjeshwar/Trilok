import {describe,it,expect} from "vitest";
import {LegacyCanonicalLegProjection} from "../apps/web/src/actors/LegacyCanonicalLegProjection";

describe("C6.3 shared canonical Kevin mixer in legacy gameplay leg presentation",()=>{
  it("reuses approved source-backed clips deterministically without gameplay root motion",async()=>{
    const first=await LegacyCanonicalLegProjection.load();
    const second=await LegacyCanonicalLegProjection.load();
    try{
      for(const intent of [
        {forward:.3,lateral:0,turn:0,grounded:true},
        {forward:.6,lateral:0,turn:0,grounded:true},
        {forward:1,lateral:0,turn:0,grounded:true},
        {forward:-1,lateral:0,turn:0,grounded:true},
        {forward:0,lateral:1,turn:0,grounded:true},
        {forward:0,lateral:0,turn:-1,grounded:true},
        {forward:0,lateral:0,turn:1,grounded:true},
      ]){
        first.setIntent(intent);
        second.setIntent(intent);
        if(intent.forward<0)
          expect(Math.hypot(first.intent.forward,first.intent.lateral))
            .toBeLessThanOrEqual(.65);
        for(let i=0;i<12;i++){
          const a=first.sample(1/60),b=second.sample(1/60);
          expect(a).toEqual(b);
          expect(Object.values(a).every(Number.isFinite)).toBe(true);
          expect(Math.abs(a.leftPitch)).toBeLessThanOrEqual(.780001);
          expect(Math.abs(a.rightPitch)).toBeLessThanOrEqual(.780001);
        }
      }
    }finally{first.dispose();second.dispose();}
    expect(()=>first.sample(1/60)).toThrow(/disposed/i);
  });
});
