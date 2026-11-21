import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {fittedStudioView} from "../apps/web/src/studio/StudioViewFraming";
import {STUDIO_VIEWS} from "../apps/web/src/studio/StudioPresentation";

describe("C6.3 generated-character camera framing",()=>{
  it("preserves ordinary source-based presets when no skinned bounds exist",()=>{
    const result=fittedStudioView("front",undefined,1.4,40);
    expect(result.position.toArray()).toEqual([...STUDIO_VIEWS.front.position]);
    expect(result.target.toArray()).toEqual([...STUDIO_VIEWS.front.target]);
  });
  it("frames measured tall and short skinned bounds in four directions",()=>{
    const morphologies=[
      new THREE.Box3(new THREE.Vector3(-.35,-.01,-.20),new THREE.Vector3(.35,1.3,.20)),
      new THREE.Box3(new THREE.Vector3(-.60,-.01,-.30),new THREE.Vector3(.60,3.15,.30)),
    ];
    for(const bounds of morphologies) {
      const size=bounds.getSize(new THREE.Vector3());
      const center=bounds.getCenter(new THREE.Vector3());
      for(const name of ["front","rear","side","three-quarter"] as const){
        const fitted=fittedStudioView(name,bounds,1.3,40);
        expect(fitted.target.distanceTo(center)).toBeLessThan(1e-10);
        const radius=fitted.position.distanceTo(fitted.target);
        expect(radius).toBeGreaterThanOrEqual(
          size.y*.5/(Math.tan(THREE.MathUtils.degToRad(20))*.88)-1e-10);
        expect(fitted.position.distanceTo(fitted.target)).toBeGreaterThan(0);
      }
    }
  });
  it("rejects invalid projection inputs without modifying the source bounds",()=>{
    const bounds=new THREE.Box3(new THREE.Vector3(-.2,0,-.2),
      new THREE.Vector3(.2,2,.2));
    const original=bounds.clone();
    expect(()=>fittedStudioView("front",bounds,0,40)).toThrow();
    expect(()=>fittedStudioView("front",bounds,1.2,180)).toThrow();
    fittedStudioView("side",bounds,1.2,40);
    expect(bounds).toEqual(original);
  });
});
