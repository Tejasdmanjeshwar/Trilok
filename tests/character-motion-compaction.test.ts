import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { compactMotionCompatibleInfluences } from
  "../apps/web/src/characters/geometry/SkinInfluenceCompaction";

function pose(distant:number):THREE.Matrix4[] {
  return Array.from({length:5},(_,i)=>
    new THREE.Matrix4().makeTranslation(i===4?distant:0,0,0));
}
describe("C2.4 motion-aware original-source four-weight reduction",()=>{
  it("retains a low-mass moving owner instead of silently deleting its deformation",()=>{
    const weights=new Map([[0,.4],[1,.25],[2,.15],[3,.13],[4,.07]]);
    const frames=[pose(.1),pose(-.08),pose(.15)];
    const rest=new THREE.Vector3(.12,.8,.03);
    const fitted=compactMotionCompatibleInfluences(weights,rest,frames);
    const again=compactMotionCompatibleInfluences(weights,rest,frames);
    expect([...fitted]).toEqual([...again]);
    expect(fitted.size).toBe(4);
    expect([...fitted.values()].reduce((s,w)=>s+w,0)).toBeCloseTo(1,6);
    expect(fitted.has(4),"small but moving owner must survive").toBe(true);
    const expected=.07*.1;
    const actual=[...fitted].reduce((sum,[index,w])=>
      sum+w*rest.clone().applyMatrix4(frames[0]![index]!).x,0)-rest.x;
    expect(Math.abs(actual-expected)).toBeLessThan(1e-9);
    // Mutation: classical largest-four reduction discards moving owner #4.
    const mutated=new Map([...weights].sort((a,b)=>b[1]-a[1]).slice(0,4));
    const broken=[...mutated].reduce((sum,[index,w])=>
      sum+w*rest.clone().applyMatrix4(frames[0]![index]!).x,0)/
      [...mutated.values()].reduce((s,w)=>s+w,0)-rest.x;
    expect(Math.abs(broken-expected)).toBeGreaterThan(.006);
  });
  it("preserves four or fewer owners and rejects incomplete sample matrices",()=>{
    const rest=new THREE.Vector3(0,0,0);
    const original=new Map([[0,.6],[1,.4]]);
    expect([...compactMotionCompatibleInfluences(original,rest,[pose(.1)])])
      .toEqual([...original]);
    expect(()=>compactMotionCompatibleInfluences(
      new Map([[0,.3],[1,.25],[2,.2],[3,.15],[4,.1]]),
      rest,[[new THREE.Matrix4()]])).toThrow("Incomplete C2 motion sample");
  });
});
