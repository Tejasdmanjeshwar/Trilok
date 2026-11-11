import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ProjectileClashEffects } from "../apps/web/src/effects/ProjectileClashEffects";

describe("two simultaneous projectile visuals with stable identities",()=>{
  function fixture(){
    const scene=new THREE.Scene();
    const fx=new ProjectileClashEffects(scene);
    const A=new THREE.Vector3(0,1,0);
    const B=new THREE.Vector3(10,1,0);
    fx.launch("A",A,B,0,100);
    fx.launch("B",B,A,20,80);
    return {fx,A,B};
  }
  it("allows precisely two independent arrows flying toward each other",()=>{
    const {fx,A,B}=fixture();
    expect(fx.position("A",50).x).toBeCloseTo(5);
    expect(fx.position("B",60).x).toBeCloseTo(5);
    expect(()=>fx.launch("C",A,B,50,100)).toThrow();
    fx.update(65);
    fx.dispose();
  });
  it("the winning interception projectile continues with its ORIGINAL identity",()=>{
    const {fx,A,B}=fixture();
    const clash=new THREE.Vector3(8,1,0);
    fx.clash("A","B","interceptor_survives",clash,80);
    expect(()=>fx.position("A",80)).toThrow();
    // The exact same B slot is reused and the loser remains destroyed.
    fx.continue("B",new THREE.Vector3(-7,1,0),80,150);
    expect(fx.position("B",155).x).toBeCloseTo(-2.25);
    expect(()=>fx.launch("C",A,B,90,100)).not.toThrow();
    fx.stop("B");
    expect(()=>fx.position("B",190)).toThrow();
    fx.dispose();
  });
  it("mutual destruction removes both and reuses the pool for the next attack",()=>{
    const {fx,A,B}=fixture();
    fx.clash("A","B","mutual_destruction",new THREE.Vector3(5,1,0),75);
    expect(()=>fx.position("A",75)).toThrow();
    expect(()=>fx.position("B",75)).toThrow();
    fx.launch("C",A,B,100,100);
    fx.update(130);
    expect(fx.position("C",130).x).toBeCloseTo(3);
    fx.clear();
    expect(()=>fx.position("C",150)).toThrow();
    fx.dispose();
  });
  it("a weaker intercept leaves the incoming visual alive without respawning",()=>{
    const {fx}=fixture();
    fx.clash("A","B","incoming_survives",new THREE.Vector3(7,1,0),75);
    expect(()=>fx.position("B",75)).toThrow();
    fx.continue("A",new THREE.Vector3(12,1,0),75,80);
    expect(fx.position("A",115).x).toBeCloseTo(9.75);
    fx.dispose();
  });
});
