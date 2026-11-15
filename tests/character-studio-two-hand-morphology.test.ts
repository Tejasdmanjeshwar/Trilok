import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {solveTwoHandIK,StudioTwoHandPreview,twoHandSolvedContactWorld} from "../apps/web/src/studio/StudioTwoHandGrip";
import {make} from "./helpers/studio-two-hand-fixtures";

describe("C5.2 source morphology/grip geometry",()=>{
  it.each([
    {name:"short",morph:{"macro/height":0}},
    {name:"tall",morph:{"macro/height":1}},
  ])("requires anatomy-aware reach on $name source model",({name,morph})=>{
    const {human,model,fk}=make(morph);
    try{
      const failed:string[]=[];
      for(const kind of ["longsword","staff"] as const)
        for(const lead of ["left","right"] as const){
          const outcome=solveTwoHandIK(model,fk,[],lead,kind);
          console.log("C52-VARIATION-REACH",JSON.stringify({
            name,kind,lead,reachable:outcome.reachable,
            primaryError:outcome.primaryErrorMeters,
            secondaryError:outcome.secondaryErrorMeters,
            primaryAxis:outcome.primaryAxisDot,
            secondaryAxis:outcome.secondaryAxisDot,
            initialSpan:outcome.initialHandSpanMeters,
            gripSpan:outcome.separationMeters,
            reason:outcome.reason,attempts:outcome.reachDiagnostics,
          }));
          expect(Number.isFinite(outcome.primaryErrorMeters)).toBe(true);
          expect(outcome.weaponWorld.elements.every(Number.isFinite)).toBe(true);
          if(outcome.reachable){
            expect(outcome.primaryErrorMeters).toBeLessThanOrEqual(.023);
            expect(outcome.secondaryErrorMeters).toBeLessThanOrEqual(.023);
            expect(outcome.separationMeters).toBeCloseTo(
              outcome.dimensions.primaryGripY-outcome.dimensions.secondaryGripY,9);
            expect(outcome.dimensions.handleLength/outcome.dimensions.bladeLength>0 ||
              outcome.dimensions.shaftLength>0).toBe(true);
            const preview=new StudioTwoHandPreview(model,kind,lead,outcome);
            try{
              expect(preview.object.children.length).toBeGreaterThan(0);
              expect(preview.descriptor.dimensions).toEqual(outcome.dimensions);
              const axis=new THREE.Vector3(0,1,0).transformDirection(outcome.weaponWorld);
              const primaryGrip=new THREE.Vector3(0,outcome.dimensions.primaryGripY,0)
                .applyMatrix4(preview.object.matrix);
              const secondaryGrip=new THREE.Vector3(0,outcome.dimensions.secondaryGripY,0)
                .applyMatrix4(preview.object.matrix);
              expect(primaryGrip.clone().sub(secondaryGrip).normalize().dot(axis))
                .toBeGreaterThan(.999);
              expect(primaryGrip.distanceTo(
                twoHandSolvedContactWorld(model,lead,outcome))).toBeLessThanOrEqual(.023);
            }finally{preview.dispose();}
          }
          // Report all failures without hiding unsupported anatomies behind
          // a green diagnostic-only test. Never weaken the grip thresholds.
          if(!outcome.reachable)failed.push(
            kind+"/"+lead+": "+outcome.reason+
            " ("+Math.round(outcome.primaryErrorMeters*1000)+"mm, "+
            Math.round(outcome.secondaryErrorMeters*1000)+"mm)");
        }
      expect(failed,"all source anatomies must equip both grips").toEqual([]);
    }finally{human.dispose();}
  },120_000);

  it.each([
    {name:"infant",morph:{"macro/age":.06}},
    {name:"wide shoulders",morph:{"native/torso/torso-scale-horiz-decr-incr":1}},
    {name:"long arms",morph:{"native/measure/measure-upperarm-length-decr-incr":1}},
    {name:"unequal hands",morph:{"native/armslegs/l-hand-scale-decr-incr":1,
      "native/armslegs/r-hand-scale-decr-incr":-1}},
    {name:"compact powerful",morph:{"macro/height":0,"macro/weight":1,
      "macro/muscle":1}},
    {name:"tall slender",morph:{"macro/height":1,"macro/weight":0,
      "macro/muscle":0}},
  ] as readonly {name:string;morph:Readonly<Record<string,number>>}[])
    ("equips one dimensionally fixed sword or staff on $name anatomy",({name,morph})=>{
    const {human,model,fk}=make(morph);
    try{
      const original=human.spike.character.root.matrixWorld.clone();
      const failures:string[]=[];
      for(const kind of ["longsword","staff"] as const)
        for(const lead of ["left","right"] as const){
          const solved=solveTwoHandIK(model,fk,[],lead,kind);
          console.log("C52-EXTRA-MORPH",JSON.stringify({name,kind,lead,
            reachable:solved.reachable,error:[solved.primaryErrorMeters,
              solved.secondaryErrorMeters],reason:solved.reason,
            attempts:solved.reachDiagnostics}));
          if(!solved.reachable){
            failures.push(kind+"/"+lead+":"+solved.reason);
            continue;
          }
          expect(solved.primaryErrorMeters).toBeLessThanOrEqual(.023);
          expect(solved.secondaryErrorMeters).toBeLessThanOrEqual(.023);
          const weapon=new StudioTwoHandPreview(model,kind,lead,solved);
          try{
            expect(weapon.descriptor.dimensions).toEqual(solved.dimensions);
            expect(weapon.object.matrix.elements.every(Number.isFinite)).toBe(true);
            expect(solved.separationMeters).toBeCloseTo(
              solved.dimensions.primaryGripY-solved.dimensions.secondaryGripY,8);
          }finally{weapon.dispose();}
          expect(human.spike.character.root.matrixWorld.elements)
            .toEqual(original.elements);
          fk.apply([]);
        }
      expect(failures,name+" source morphology equip failures").toEqual([]);
    }finally{human.dispose();}
  },120_000);

});
