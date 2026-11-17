import {describe,expect,it} from "vitest";
import {fitConstrainedIK,fitCanonicalIK} from "../apps/web/src/studio/ConstrainedIK";

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
  it("gives mirror-equivariant solutions without an extra IK solve",()=>{
    // Right anatomy has the opposite axial sign on its first joint.
    // A world-reflected 2D target has the same canonical residual.
    const leftBounds=[{min:-.75,max:.75},{min:-.4,max:.4}];
    const rightBounds=[{min:-.75,max:.75},{min:-.4,max:.4}];
    const leftStart=[-.42,.12];
    const rightStart=[.42,.12];
    let leftEvaluations=0,rightEvaluations=0;
    const left=fitCanonicalIK(leftStart,leftBounds,[1,1],q=>{
      leftEvaluations++;
      return [q[0]!+.21,q[1]!-.19,q[0]!+q[1]!-.02];
    },24);
    const right=fitCanonicalIK(rightStart,rightBounds,[-1,1],q=>{
      rightEvaluations++;
      return [-q[0]!+.21,q[1]!-.19,-q[0]!+q[1]!-.02];
    },24);
    expect(right.values[0]).toBeCloseTo(-left.values[0]!,12);
    expect(right.values[1]).toBeCloseTo(left.values[1]!,12);
    expect(right.cost).toBeCloseTo(left.cost,12);
    expect(right.iterations).toBe(left.iterations);
    expect(rightEvaluations).toBe(leftEvaluations);
  });
  it("keeps genuine asymmetric limits and physical contact targets independent",()=>{
    const a=fitCanonicalIK([0],[{min:-.8,max:.8}],[1],
      q=>[q[0]!-.6]);
    const b=fitCanonicalIK([0],[{min:-.25,max:.4}],[-1],
      q=>[q[0]!+.6]);
    expect(a.values[0]).toBeCloseTo(.6,3);
    expect(b.values[0]).toBeCloseTo(-.25,6);
    expect(a.values[0]).not.toBeCloseTo(-b.values[0]!,2);
    expect(()=>fitCanonicalIK([0],[{min:-1,max:1}],[],q=>q)).toThrow();
  });
  it("reports objective work exactly without an extra solve",()=>{
    let calls=0;
    const fit=fitConstrainedIK([0],[{min:-1,max:1}],values=>{
      calls++;
      return [values[0]!-.4];
    },12);
    expect(fit.evaluations).toBe(calls);
    expect(fit.evaluations).toBeGreaterThan(fit.iterations);
    let mirroredCalls=0;
    const mirrored=fitCanonicalIK([0],[{min:-1,max:1}],[-1],values=>{
      mirroredCalls++;
      return [values[0]!+.4];
    },12);
    expect(mirrored.evaluations).toBe(mirroredCalls);
    expect(mirrored.cost).toBeCloseTo(fit.cost,12);
  });
  it("rejects invalid or nonfinite calibration",()=>{
    expect(()=>fitConstrainedIK([2],[{min:0,max:1}],v=>v)).toThrow();
    expect(()=>fitConstrainedIK([0],[{min:-1,max:1}],()=>[NaN])).toThrow();
  });
});
