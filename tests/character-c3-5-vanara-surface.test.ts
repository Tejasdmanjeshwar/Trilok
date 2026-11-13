import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DEFAULT_MAMMALIAN_HEAD_MORPHOLOGY } from "../packages/character-core/src/index";
import { buildVanaraSurface, type VanaraNeckSample } from
  "../apps/web/src/characters/geometry/VanaraHeadSurface";

function makeSpec() {
  const count=64;
  const seam:VanaraNeckSample[]=Array.from({length:count},(_,i)=>{
    const a=2*Math.PI*i/count;
    return {
      point:new THREE.Vector3(.050*Math.cos(a),1.61,.046*Math.sin(a)),
      normal:new THREE.Vector3(Math.cos(a),0,Math.sin(a)),
      color:new THREE.Color(0xb38b70),
      ids:[0,1,2,3],weights:[.5,.3,.2,0],
    };
  });
  return {seam,centerX:0,neckY:1.61,centerZ:0,
    crownY:1.90,halfWidth:.095,halfDepth:.094,
    headBone:4,jawBone:5,
    shape:DEFAULT_MAMMALIAN_HEAD_MORPHOLOGY,maxTriangles:7000};
}
describe("C3.5 original Vanara topology preflight",()=>{
  it("creates deterministic topology with a pinned seam, bounded budget, and four valid skin weights",()=>{
    const spec=makeSpec();
    const first=buildVanaraSurface(spec);
    const second=buildVanaraSurface(makeSpec());
    try {
      expect(first.faceTriangles).toBeLessThanOrEqual(spec.maxTriangles);
      expect(first.faceTriangles).toBeGreaterThan(1700);
      expect(first.geometry.getIndex()!.array).toEqual(second.geometry.getIndex()!.array);
      expect(first.geometry.getAttribute("position").array).toEqual(
        second.geometry.getAttribute("position").array);
      const pos=first.geometry.getAttribute("position");
      const weights=first.geometry.getAttribute("skinWeight");
      const ids=first.geometry.getAttribute("skinIndex");
      const normals=first.geometry.getAttribute("normal");
      const uv=first.geometry.getAttribute("uv");
      expect([weights.count,ids.count,normals.count,uv.count]).toEqual([
        pos.count,pos.count,pos.count,pos.count
      ]);
      for(let i=0;i<pos.count;i++){
        const v=new THREE.Vector3().fromBufferAttribute(pos,i);
        expect(v.toArray().every(Number.isFinite)).toBe(true);
        let total=0;
        for(let j=0;j<4;j++){
          const w=weights.getComponent(i,j);
          expect(Number.isFinite(w)&&w>=0&&w<=1).toBe(true);
          expect(ids.getComponent(i,j)).toBeGreaterThanOrEqual(0);
          total+=w;
        }
        expect(Math.abs(1-total)).toBeLessThan(1e-5);
      }
      for(let i=0;i<spec.seam.length;i++){
        const v=new THREE.Vector3().fromBufferAttribute(pos,i);
        const angle=Math.atan2(v.z,v.x);
        const source=spec.seam.find(s=>
          Math.abs(s.point.x-v.x)<1e-6&&
          Math.abs(s.point.y-v.y)<1e-6&&
          Math.abs(s.point.z-v.z)<1e-6);
        expect(source).toBeDefined();
        expect(Math.abs(v.lengthSq())).toBeGreaterThan(0);
        expect(Number.isFinite(angle)).toBe(true);
      }
      expect(first.landmarks.nostrilLeft.x).toBeLessThan(first.landmarks.nostrilRight.x);
      expect(first.landmarks.nose.y).toBeGreaterThan(first.landmarks.mouth.y);
      expect(first.landmarks.earLeft.x).toBeLessThan(first.landmarks.earRight.x);
    } finally {
      first.geometry.dispose();
      second.geometry.dispose();
    }
  });
  it("fails closed when a C2 seam, budget or human envelope is unsafe",()=>{
    const valid=makeSpec();
    expect(()=>buildVanaraSurface({...valid,maxTriangles:300})).toThrow();
    expect(()=>buildVanaraSurface({...valid,halfWidth:.30})).toThrow();
    const bad=valid.seam.slice();
    bad[0]={...bad[0]!,weights:[.5,.2,.1,.1]};
    expect(()=>buildVanaraSurface({...valid,seam:bad})).toThrow();
  });
});
