import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {HumanPoseCorrectives} from "../apps/web/src/characters/geometry/HumanPoseCorrectives";
import {StudioBodyCollision} from "../apps/web/src/studio/StudioBodyCollision";
import {generateStudioCharacter,STUDIO_GENERATOR_VERSION} from "../apps/web/src/studio/StudioGenerator";
import {solveTwoHandIK} from "../apps/web/src/studio/StudioTwoHandGrip";
import {make,measureStaff,diagnoseArmReach} from "./helpers/studio-two-hand-fixtures";

describe("C5.2 generated skinned-body occupied volume",()=>{
  it("reconstructs full deterministic recipe 1103498626 and samples its abdomen",()=>{
    const seed=1103498626;
    const generated=generateStudioCharacter(seed);
    expect(STUDIO_GENERATOR_VERSION).toBe("studio-human-v2");
    expect(generated.seed).toBe(seed);
    const repeat=generateStudioCharacter(seed);
    expect(repeat).toEqual(generated);
    const {human,model,fk}=make(generated.morphology.body,generated.morphology.shape);
    try{
      const collision=new StudioBodyCollision(model);
      expect(collision.sourceVertices).toBeGreaterThan(150);
      const root=human.spike.character.root;
      root.updateWorldMatrix(true,true);
      const abdomen=human.spike.graph.joints.find(j=>j.role==="spine_lower")!;
      const center=human.spike.bones.get(abdomen.id)!
        .getWorldPosition(new THREE.Vector3());
      expect(Number.isFinite(collision.clearance(center))).toBe(true);
      const snap=root.matrixWorld.clone();
      for(const lead of ["right","left"] as const){
        for(const kind of ["longsword","staff"] as const){
          fk.apply([]);
          const first=solveTwoHandIK(model,fk,[],lead,kind);
          expect(first.weaponWorld.elements.every(Number.isFinite)).toBe(true);
          expect(Number.isFinite(first.bodyClearanceMeters)).toBe(true);
          expect(first.reachable,
            "generated seed "+seed+" "+kind+"/"+lead+
            " cannot lose its two-hand equip to belly collision").toBe(true);
          if(first.reachable){
            expect(first.bodyClearanceMeters,kind+"/"+lead+
              " must not intersect morphed abdomen").toBeGreaterThanOrEqual(0);
            expect(first.primaryErrorMeters).toBeLessThanOrEqual(.023);
            expect(first.secondaryErrorMeters).toBeLessThanOrEqual(.023);
            const clearance=new StudioBodyCollision(model).measure(model,
              first.weaponWorld,kind,first.dimensions);
            expect(clearance.maximumPenetrationMeters).toBeLessThanOrEqual(
              .003*first.dimensions.scale+1e-9);
            const skinned=collision.measureSkinnedSurface(model,
              first.weaponWorld,kind,first.dimensions);
            console.log("C52-TRUE-SURFACE",JSON.stringify({
              seed,kind,lead,proxy:first.bodyClearanceMeters,
              actual:skinned.minimumMeters,overlap:skinned.maximumPenetrationMeters,
              triangles:collision.sourceTriangleCount,
            }));
            expect(Number.isFinite(skinned.minimumMeters)).toBe(true);
          }
          fk.apply([]);
          const second=solveTwoHandIK(model,fk,[],lead,kind);
          expect(second.reachable).toBe(first.reachable);
          expect(second.primaryErrorMeters).toBeCloseTo(first.primaryErrorMeters,7);
          expect(second.secondaryErrorMeters).toBeCloseTo(first.secondaryErrorMeters,7);
          expect(second.bodyClearanceMeters).toBeCloseTo(first.bodyClearanceMeters,7);
          expect(root.matrixWorld.elements).toEqual(snap.elements);
        }
      }
    }finally{human.dispose();}
  },120_000);
});
describe("C5.2 staff source-skinned contact diagnostics",()=>{
  it.each([
    {seed:498155388,sex:.003517,age:.05506,height:.082736,
      expected:"infant source-limb corrective calibration"},
    {seed:802593405,sex:.099852,age:.898233,height:.211578,
      expected:"bounded two-arm contact convergence"},
  ])("equips captured random sword failure $seed ($expected)",({seed,sex,age,height})=>{
    const generated=generateStudioCharacter(seed);
    expect(generated.morphology.body["macro/sex"]).toBe(sex);
    expect(generated.morphology.body["macro/age"]).toBe(age);
    expect(generated.morphology.body["macro/height"]).toBe(height);
    const {human,model,fk}=make(generated.morphology.body,generated.morphology.shape);
    try {
      // This is the exact failure path that used to reject infant-sized arms.
      const correctives=new HumanPoseCorrectives(human);
      try{
        for(const lead of ["right","left"] as const){
          fk.apply([]);
          const solved=solveTwoHandIK(model,fk,[],lead,"longsword");
          expect(solved.reachable,JSON.stringify({seed,lead,arm:diagnoseArmReach(model,solved),reason:solved.reason,
            first:solved.primaryErrorMeters,second:solved.secondaryErrorMeters,
            coupled:solved.reachDiagnostics?.filter(d=>d.seed===300),best:solved.reachDiagnostics&&[...solved.reachDiagnostics].sort((a,b)=>a.primaryError+a.secondaryError-b.primaryError-b.secondaryError).slice(0,12),attempts:solved.reachDiagnostics?.slice(-6)})).toBe(true);
          expect(solved.primaryErrorMeters).toBeLessThanOrEqual(.023);
          expect(solved.secondaryErrorMeters).toBeLessThanOrEqual(.023);
          correctives.apply(solved.commands);
        }
      }finally{correctives.dispose();}
    }finally{human.dispose();}
  },120_000);

  it("reproduces seed 2694905601 and equips its generated neutral sword",()=>{
    const generated=generateStudioCharacter(2694905601);
    expect(STUDIO_GENERATOR_VERSION).toBe("studio-human-v2");
    const values=generated.morphology.body;
    for(const [key,value] of Object.entries({
      "macro/sex":.148029,"macro/age":.889077,
      "macro/weight":.825167,"macro/muscle":.262577,
      "macro/height":.259562,"macro/proportions":.529503,
      "native/armslegs/l-hand-trans-in-out":.984641,
      "native/armslegs/l-hand-fingers-distance-decr-incr":-.484303,
      "native/armslegs/r-hand-fingers-diameter-decr-incr":.256999,
      "native/armslegs/r-lowerarm-scale-depth-decr-incr":.595923,
      "native/armslegs/l-lowerarm-muscle-decr-incr":.71748,
      "native/armslegs/l-upperarm-muscle-decr-incr":.590381,
    }))expect(values[key],key).toBe(value);
    expect(generated.morphology.shape.stature).toBe(.971921);
    expect(generated.morphology.shape.breadth).toBe(1.092271);
    expect(generated.morphology.shape.shoulders).toBe(1.055359);
    expect(generated.morphology.shape.arms).toBe(.953258);
    const {human,model,fk}=make(values,generated.morphology.shape);
    try{
      // Both leads must work; finite but unreachable diagnostics are not success.
      for(const lead of ["right","left"] as const){
        fk.apply([]);
        const result=solveTwoHandIK(model,fk,[],lead,"longsword");
        expect(result.reachable,lead+"/"+result.reason+
          " residual "+result.primaryErrorMeters+"/"+result.secondaryErrorMeters).toBe(true);
        expect(result.primaryErrorMeters).toBeLessThanOrEqual(.023);
        expect(result.secondaryErrorMeters).toBeLessThanOrEqual(.023);
      }
    }finally{human.dispose();}
  },120_000);
  it.each(["right","left"] as const)(
    "requires a shared same-direction staff knuckle axis (%s)",lead=>{
      const {human,model,fk}=make();
      try{
        const result=solveTwoHandIK(model,fk,[],lead,"staff");
        expect(result.reachable).toBe(true);
        expect(result.primaryAxisDot).toBeGreaterThan(.85);
        expect(result.secondaryAxisDot).toBeGreaterThan(.85);
        const shaft=new THREE.Vector3(0,1,0).transformDirection(result.weaponWorld);
        expect(shaft.y).toBeGreaterThan(.35);
      }finally{human.dispose();}
    },120_000);

  it.each(["right","left"] as const)("measures source skin against one staff (%s)",lead=>{
    const {human,model,fk}=make();
    try{
      const result=solveTwoHandIK(model,fk,[],lead,"staff");
      expect(result.reachable).toBe(true);
      if(lead==="right"){
        // Diagnose the two independent surface-contact channels without
        // changing FK or weapon geometry. This finds why a shaft centered on
        // a palm-bone proxy visually cuts through the source skin.
        for(const hand of ["right","left"] as const){
          const get=(role:string)=>{
            const j=human.spike.graph.joints.find(j=>j.role===role &&
              (role.startsWith("finger_")?j.id.includes("arm["+hand+",0]"):true))!;
            return human.spike.bones.get(j.id)!.getWorldPosition(new THREE.Vector3());
          };
          const forward=get("finger_middle_0").sub(get("wrist_"+hand)).normalize();
          const across=get("finger_index_0").sub(get("finger_little_0"));
          const knuckle=across.clone().addScaledVector(forward,-across.dot(forward)).normalize();
          const normal=forward.clone().negate().cross(knuckle).normalize();
          const offsetY=hand===lead?result.dimensions.primaryGripY:result.dimensions.secondaryGripY;
          const ranked:{forward:number;normal:number;score:number;report:ReturnType<typeof measureStaff>}[]=[];
          for(const x of [-.030,-.015,0,.015,.030])
            for(const z of [-.030,-.015,0,.015,.030]){
              const shifted=result.weaponWorld.clone();
              shifted.setPosition(new THREE.Vector3().setFromMatrixPosition(shifted)
                .addScaledVector(forward,x).addScaledVector(normal,z));
              const report=measureStaff(model,hand,shifted,result.dimensions.radius,offsetY);
              const palm=report.find(d=>d.digit==="palm")!;
              const fingers=report.filter(d=>d.digit!=="palm");
              const score=palm.deepestPenetration*9+
                fingers.reduce((sum,d)=>sum+d.deepestPenetration*4+
                  (Number.isFinite(d.closestGap)?d.closestGap:0)*.25,0)+
                (Math.abs(x)+Math.abs(z))*.08;
              ranked.push({forward:x,normal:z,score,report});
            }
          ranked.sort((a,b)=>a.score-b.score);
          console.log("C52-STAFF-SURFACE-SEARCH",JSON.stringify({
            hand,forward:forward.toArray(),normal:normal.toArray(),
            best:ranked.slice(0,4).map(r=>({
              forward:r.forward,normal:r.normal,score:r.score,
              palm:r.report.find(d=>d.digit==="palm")?.deepestPenetration,
              gaps:r.report.filter(d=>d.digit!=="palm").map(d=>d.closestGap),
              clip:r.report.filter(d=>d.digit!=="palm").map(d=>d.deepestPenetration),
            })),
          }));
        }
      }
      const contacts=[lead,lead==="right"?"left":"right"] as const;
      for(let i=0;i<contacts.length;i++){
        const hand=contacts[i]!;
        const report=measureStaff(model,hand,result.weaponWorld,
          result.dimensions.radius,i===0?result.dimensions.primaryGripY:
            result.dimensions.secondaryGripY);
        console.log("C52-STAFF-SKIN",JSON.stringify({hand,lead,report}));
        for(const digit of report){
          expect(digit.eligible).toBeGreaterThan(0);
          expect(Number.isFinite(digit.deepestPenetration)).toBe(true);
        }
      }
    }finally{human.dispose();}
  },120_000);
});
