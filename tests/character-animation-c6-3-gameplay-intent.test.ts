import {describe,it,expect} from "vitest";
import * as THREE from "three";
import {locomotionIntentFromMovement} from "../packages/character-core/src/locomotion";
import {CombatMovementController} from "../apps/web/src/movement/CombatMovementController";

const snapshot=(x:number,z:number,heading=0)=>({
  displacementMeters:[x,0,z] as const,elapsedSeconds:1,
  headingRadians:heading,grounded:true,referenceSpeedMetersPerSecond:2,
});
describe("C6.3 authoritative movement / presentation boundary",()=>{
  it("projects world travel into actor-facing local direction without root motion",()=>{
    expect(locomotionIntentFromMovement(snapshot(0,1))).toEqual({
      forward:.5,lateral:0,turn:0,grounded:true,
    });
    const rotated=locomotionIntentFromMovement(snapshot(1,0,Math.PI/2));
    expect(rotated.forward).toBeCloseTo(.5,12);
    expect(rotated.lateral).toBeCloseTo(0,12);
    expect(locomotionIntentFromMovement(snapshot(0,-2)).forward).toBe(-1);
    const capped=locomotionIntentFromMovement(snapshot(10,10));
    expect(Math.hypot(capped.forward,capped.lateral)).toBeCloseTo(1,12);
  });
  it("rejects invalid timing and handles zero-time and airborne inputs",()=>{
    expect(locomotionIntentFromMovement({...snapshot(0,1),elapsedSeconds:0}).forward).toBe(0);
    expect(locomotionIntentFromMovement({...snapshot(0,1),grounded:false}).forward).toBe(0);
    for(const dt of [-1,Number.NaN,1.01])
      expect(()=>locomotionIntentFromMovement({...snapshot(0,1),elapsedSeconds:dt})).toThrow();
    expect(()=>locomotionIntentFromMovement({...snapshot(0,1),referenceSpeedMetersPerSecond:0})).toThrow();
  });
  it("samples accepted presentation displacement once without changing combat reach",()=>{
    const movement=new CombatMovementController();
    const a=new THREE.Group(),b=new THREE.Group();
    a.position.set(0,0,0);b.position.set(0,0,6);
    movement.register(a);movement.register(b);
    expect(movement.locomotionIntent(a,.016)).toEqual({
      forward:0,lateral:0,turn:0,grounded:true,
    });
    movement.approach(a,b,2,100,1000);
    movement.update(500);
    const before=a.position.clone();
    a.rotation.y=0;
    const moving=movement.locomotionIntent(a,.4);
    expect(moving.forward).toBeGreaterThan(0);
    expect(a.position).toEqual(before);
    expect(movement.locomotionIntent(a,.016).forward).toBe(0);
    movement.dodge(a,b,600,400);
    movement.update(675);
    const dodging=movement.locomotionIntent(a,.075);
    expect(dodging.grounded).toBe(false);
    expect(dodging.forward).toBe(0);
    const impactSeparation=movement.separationForHit(a,b);
    expect(Number.isFinite(impactSeparation)).toBe(true);
    movement.reset();
    expect(movement.locomotionIntent(a,.016).forward).toBe(0);
  });
});
