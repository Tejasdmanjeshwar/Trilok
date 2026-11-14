import {describe,it,expect} from "vitest";
import * as THREE from "three";
import {STUDIO_FOCUS,STUDIO_POSES,STUDIO_EXPRESSIONS,previewExpression,
  focusPosition,DEFAULT_INSPECTION} from "../apps/web/src/studio/StudioInspection";
import {ANATOMICAL_POSE_MATRIX} from "../apps/web/src/characters/geometry/AnatomicalPoseMatrix";
import {createSkinningSpike} from "../apps/web/src/characters/geometry/SkinningSpike";

describe("C4.5 preview-only inspection contract",()=>{
  it("only exposes poses defined by the calibrated anatomical matrix",()=>{
    const available=new Set(ANATOMICAL_POSE_MATRIX.map(p=>p.id));
    for(const id of Object.keys(STUDIO_POSES))expect(available.has(id)).toBe(true);
  });
  it("uses source expressions without mutating stored facial morphology",()=>{
    const base={noseWidth:.65,smile:.3,leftBrow:.12};
    const before=JSON.stringify(base);
    const smile=previewExpression(base,"smile");
    expect(smile.smile).toBe(.85);
    expect(smile.noseWidth).toBe(.65);
    expect(previewExpression(base,"neutral")).toEqual(base);
    expect(JSON.stringify(base)).toBe(before);
    for(const id of Object.keys(STUDIO_EXPRESSIONS))
      expect(()=>previewExpression(base,id as keyof typeof STUDIO_EXPRESSIONS)).not.toThrow();
  });
  it("focuses real semantic joints without altering the skeleton",()=>{
    const spike=createSkinningSpike();
    try{
      const mocked={spike} as Parameters<typeof focusPosition>[0];
      const before=spike.graph.joints.map(j=>spike.bones.get(j.id)!.quaternion.clone());
      for(const key of Object.keys(STUDIO_FOCUS)){
        const point=focusPosition(mocked,key as keyof typeof STUDIO_FOCUS);
        expect(point).toBeDefined();
        expect(point!.target.toArray().every(Number.isFinite)).toBe(true);
        expect(point!.distance).toBeGreaterThan(.2);
      }
      spike.graph.joints.forEach((j,i)=>
        expect(spike.bones.get(j.id)!.quaternion.equals(before[i]!)).toBe(true));
      expect(DEFAULT_INSPECTION).toEqual({skeleton:false,wireframe:false,joints:false});
    }finally{spike.dispose();}
  });
});
