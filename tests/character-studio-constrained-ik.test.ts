import {describe,expect,it} from "vitest";
import {fitConstrainedIK} from "../apps/web/src/studio/ConstrainedIK";

describe("bounded coupled IK optimization",()=>{
  it("fits coupled grip constraints with one shared rigid center",()=>{
    // Left/right contact points are independent joint functions, but their
    // targets derive from the same mutable rigid weapon center and span.
    const initial=[-.7,.7,0];
    const bounds=[{min:-1,max:1},{min:-1,max:1},{min:-.5,max:.5}];
    const fit=fitConstrainedIK(initial,bounds,v=>[
      v[0]!-(v[2]!-.11),
      v[1]!-(v[2]!+.11),
      (v[0]!+v[1]!)*.04,
    ]);
    expect(fit.cost).toBeLessThan(1e-7);
    expect(Math.abs(fit.values[0]!-fit.values[1]!+.22)).toBeLessThan(.001);
    expect(fit.iterations).toBeLessThanOrEqual(52);
  });
  it("respects morphology-dependent joint limits and is deterministic",()=>{
    const bounds=[{min:-.21,max:.11},{min:-.45,max:.35}];
    const residual=(v:readonly number[])=>[v[0]!-1,v[1]!+.18];
    const first=fitConstrainedIK([0,0],bounds,residual);
    const second=fitConstrainedIK([0,0],bounds,residual);
    expect(first).toEqual(second);
    expect(first.values[0]).toBeCloseTo(.11,6);
    expect(first.values[1]).toBeCloseTo(-.18,3);
  });
  it("reapplies the winning state following derivative samples",()=>{
    let applied:readonly number[]=[];
    const fit=fitConstrainedIK([.1],[{min:-1,max:1}],v=>{
      applied=[...v];
      return [v[0]!-.4];
    });
    expect(applied).toEqual(fit.values);
    expect(fit.values[0]).toBeCloseTo(.4,4);
  });
  it("rejects invalid or nonfinite calibration",()=>{
    expect(()=>fitConstrainedIK([2],[{min:0,max:1}],v=>v)).toThrow();
    expect(()=>fitConstrainedIK([0],[{min:-1,max:1}],()=>[NaN])).toThrow();
  });
});
