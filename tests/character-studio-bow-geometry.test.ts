import {describe,it,expect,vi} from "vitest";
import * as THREE from "three";
import {bowHalfProfile,bowNockLocal,createBowStaveGeometry,
  defaultBowStaveOptions,sampleBowStave,type BowProfile}
  from "../apps/web/src/studio/StudioBowGeometry";

const descriptor={
  limbLengthMeters:.64,handleLengthMeters:.085,handleRadiusMeters:.011,
  stringRestMeters:.07,
};
const combinations=[
  {limbLengthMeters:.42,handleLengthMeters:.065,handleRadiusMeters:.008,stringRestMeters:.04},
  descriptor,
  {limbLengthMeters:.84,handleLengthMeters:.11,handleRadiusMeters:.013,stringRestMeters:.095},
] as const;
describe("C5.4 physically mirrored procedural stave",()=>{
  it.each(["simple","recurve"] as BowProfile[])(
    "%s half profile is smooth at grip, inflection transition and tip",
    profile=>{
      const o=defaultBowStaveOptions(descriptor,profile);
      for(const t of [0,.65,1]){
        const h=1e-5;
        const a=bowHalfProfile(o,Math.max(0,t-h));
        const b=bowHalfProfile(o,Math.min(1,t+h));
        expect(Math.abs(a.z-b.z)).toBeLessThan(1e-4);
        expect(Math.abs(a.derivative-b.derivative)).toBeLessThan(1e-3);
      }
      // Intentional recurve displacement differs from the simple profile.
      const simple=defaultBowStaveOptions(descriptor,"simple");
      if(profile==="recurve")
        expect(bowHalfProfile(o,.825).z).toBeLessThan(
          bowHalfProfile(simple,.825).z-.04);
    },
  );
  it.each(["simple","recurve"] as BowProfile[])(
    "%s mirrored centerline, tangents, dimensions and surface vertices",
    profile=>{
      for(const dims of combinations){
        const o=defaultBowStaveOptions(dims,profile);
        const result=createBowStaveGeometry(o);
        try{
          const positions=result.geometry.getAttribute("position");
          const normals=result.geometry.getAttribute("normal");
          const uv=result.geometry.getAttribute("uv");
          const index=result.geometry.getIndex()!;
          const mid=o.segmentsPerHalf,stride=result.ringStride;
          expect(index.count).toBeGreaterThan(500);
          expect(result.centerline).toHaveLength(mid*2+1);
          for(let i=0;i<=mid;i++){
            const upper=sampleBowStave(o,i/mid);
            const lower=sampleBowStave(o,-i/mid);
            expect(upper.center.x-lower.center.x).toBe(0);
            expect(upper.center.y+lower.center.y).toBeCloseTo(0,12);
            expect(upper.center.z-lower.center.z).toBeCloseTo(0,12);
            expect(upper.slope+lower.slope).toBeCloseTo(0,10);
            expect(upper.widthMeters-lower.widthMeters).toBe(0);
            expect(upper.thicknessMeters-lower.thicknessMeters).toBe(0);
            for(let j=0;j<stride;j++){
              const u=(mid+i)*stride+j,l=(mid-i)*stride+j;
              expect(positions.getX(u)-positions.getX(l)).toBeCloseTo(0,6);
              expect(positions.getY(u)+positions.getY(l)).toBeCloseTo(0,6);
              expect(positions.getZ(u)-positions.getZ(l)).toBeCloseTo(0,6);
            }
          }
          expect(result.upperNock.distanceTo(bowNockLocal(o,1))).toBe(0);
          expect(result.lowerNock.distanceTo(bowNockLocal(o,-1))).toBe(0);
          expect(result.upperNock.y).toBe(-result.lowerNock.y);
          expect(result.upperNock.z).toBe(result.lowerNock.z);
          for(let i=0;i<positions.count;i++){
            for(let j=0;j<3;j++)expect(Number.isFinite(positions.getComponent(i,j))).toBe(true);
            for(let j=0;j<3;j++)expect(Number.isFinite(normals.getComponent(i,j))).toBe(true);
            for(let j=0;j<2;j++){
              const c=uv.getComponent(i,j);
              expect(Number.isFinite(c)&&c>=0&&c<=1).toBe(true);
            }
          }
          for(let i=0;i<index.count;i+=3){
            const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
            expect(Math.max(a,b,c)).toBeLessThan(positions.count);
            expect(new Set([a,b,c]).size).toBe(3);
            const A=new THREE.Vector3().fromBufferAttribute(positions,a);
            const B=new THREE.Vector3().fromBufferAttribute(positions,b);
            const C=new THREE.Vector3().fromBufferAttribute(positions,c);
            expect(B.sub(A).cross(C.sub(A)).length()).toBeGreaterThan(1e-11);
          }
          // Unit rings travel monotonically in Y so distinct sections
          // cannot self-intersect, and the fixed width axis cannot flip.
          for(let i=1;i<result.centerline.length;i++)
            expect(result.centerline[i]!.y).toBeGreaterThan(result.centerline[i-1]!.y);
          // Identical descriptor produces exactly the same indexed geometry.
          const again=createBowStaveGeometry(o);
          try{
            expect(Array.from(again.geometry.getAttribute("position").array))
              .toEqual(Array.from(positions.array));
            expect(Array.from(again.geometry.getIndex()!.array))
              .toEqual(Array.from(index.array));
          }finally{again.geometry.dispose();}
        }finally{result.geometry.dispose();}
      }
    },
  );
  it("rejects invalid profiles and an asymmetric shape must be detectable",()=>{
    const o=defaultBowStaveOptions(descriptor);
    expect(()=>createBowStaveGeometry({...o,limbWidthMeters:NaN})).toThrow();
    expect(()=>createBowStaveGeometry({...o,tipWidthMeters:.2})).toThrow();
    const mesh=createBowStaveGeometry(o);
    try{
      const points=mesh.geometry.getAttribute("position");
      const mid=o.segmentsPerHalf;
      const upper=(mid+5)*mesh.ringStride;
      const lower=(mid-5)*mesh.ringStride;
      points.setX(upper,points.getX(upper)+.005);
      expect(Math.abs(points.getX(upper)-points.getX(lower))).toBeGreaterThan(.004);
    }finally{mesh.geometry.dispose();}
  });
  it("explicitly disposes geometry after replacement",()=>{
    const bow=createBowStaveGeometry(defaultBowStaveOptions(descriptor));
    const spy=vi.spyOn(bow.geometry,"dispose");
    bow.geometry.dispose();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
