import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ProjectileClashEffects } from "../apps/web/src/effects/ProjectileClashEffects";
import { SurfaceMarks } from "../apps/web/src/effects/SurfaceMarks";
import {
  arrowWoundLifetime, DEFAULT_ARROW_WOUND_RULES,
} from "../apps/web/src/effects/ArrowWoundLifetime";
import type { DamageBreakdown } from "../packages/combat/src/index";

function breakdown(amount:number,critical=false,reasons:string[]=[]):DamageBreakdown {
  return {
    attackerId:"hero",defenderId:"enemy",moveId:"arrow",hitId:"impact",
    intendedRegionId:"torso",actualRegionId:"torso",damageType:"pierce",
    baseDamage:amount,reactionMultiplier:1,vulnerabilityMultiplier:1,
    armorMultiplier:1,armorAbsorbed:0,critical,criticalMultiplier:1,
    stagger:0,finalDamage:amount,reasons,
  };
}

describe("D9 severe vs temporary arrow persistence",()=>{
  it("assigns configurable 2/3/encounter durations without adding damage",()=>{
    expect(DEFAULT_ARROW_WOUND_RULES.minorTurns).toBe(2);
    expect(arrowWoundLifetime(breakdown(8))).toEqual({severity:"minor",turns:2});
    expect(arrowWoundLifetime(breakdown(15))).toEqual({severity:"deep",turns:3});
    expect(arrowWoundLifetime(breakdown(7,false,["weak_point"])))
      .toEqual({severity:"deep",turns:3});
    expect(arrowWoundLifetime(breakdown(24))).toEqual({severity:"severe",turns:null});
    expect(arrowWoundLifetime(breakdown(10,true))).toEqual({severity:"severe",turns:null});
    expect(()=>arrowWoundLifetime(breakdown(0))).toThrow();
    expect(arrowWoundLifetime(breakdown(10),{
      deepDamage:8,severeDamage:18,minorTurns:1,deepTurns:4,
    })).toEqual({severity:"deep",turns:4});
  });

  it("keeps multiple original arrow meshes across independent attacks",()=>{
    const scene=new THREE.Scene();
    const root=new THREE.Group(),torso=new THREE.Group();
    scene.add(root);root.add(torso);
    torso.position.set(0,1,0);
    const projectiles=new ProjectileClashEffects(scene);
    const from=new THREE.Vector3(-3,1,0);
    const to=new THREE.Vector3(0,1,0);
    const velocity=new THREE.Vector3(1,0,0);
    const launchAndEmbed=(id:string,expiresAtTurn:number|null)=>{
      projectiles.launch(id,from,to,100,500);
      expect(projectiles.embed(id,torso,to,velocity,.12,{
        ownerId:"enemy",expiresAtTurn,
      })).toBe(true);
    };
    launchAndEmbed("hit-1",4);
    const first=torso.children[0] as THREE.Group;
    projectiles.clearActive();
    expect(first.parent).toBe(torso);
    launchAndEmbed("hit-2",5);
    const second=torso.children[1] as THREE.Group;
    launchAndEmbed("hit-3",null);
    expect(projectiles.embeddedCount).toBe(3);
    expect(projectiles.embeddedCountFor("enemy")).toBe(3);
    expect(first).not.toBe(second);
    root.position.set(3,0,0);
    root.updateWorldMatrix(true,true);
    expect(first.getWorldPosition(new THREE.Vector3()).x).toBeGreaterThan(1);
    expect(second.getWorldPosition(new THREE.Vector3()).x).toBeGreaterThan(1);
    expect(projectiles.expireTurn(3)).toBe(0);
    expect(projectiles.expireTurn(4)).toBe(1);
    expect(first.parent).toBeNull();
    expect(second.parent).toBe(torso);
    expect(projectiles.expireTurn(5)).toBe(1);
    expect(projectiles.embeddedCount).toBe(1);
    expect(projectiles.expireTurn(999)).toBe(0);
    projectiles.clear();
    expect(projectiles.embeddedCount).toBe(0);
    expect(torso.children).toHaveLength(0);
    projectiles.dispose();
  });

  it("supports defender-specific wound counts and keeps two active flight slots available",()=>{
    const scene=new THREE.Scene(),projectiles=new ProjectileClashEffects(scene);
    const hero=new THREE.Group(),enemy=new THREE.Group();
    scene.add(hero,enemy);
    const from=new THREE.Vector3(0,1,0),to=new THREE.Vector3(4,1,0);
    for(let i=0;i<18;i++){
      const id="injury-"+i;
      projectiles.launch(id,from,to,0,500);
      expect(projectiles.embed(id,i%2?hero:enemy,to,new THREE.Vector3(1,0,0),.12,{
        ownerId:i%2?"hero":"enemy",
        expiresAtTurn:i<10?3:null,
      })).toBe(true);
    }
    expect(projectiles.embeddedCount).toBe(16);
    expect(projectiles.embeddedCountFor("hero")+
      projectiles.embeddedCountFor("enemy")).toBe(16);
    projectiles.launch("flight-A",from,to,100,100);
    projectiles.launch("flight-B",to,from,100,100);
    expect(()=>projectiles.launch("third-active",from,to,100,100)).toThrow();
    projectiles.clearActive();
    expect(projectiles.embeddedCount).toBe(16);
    expect(projectiles.expireTurn(3)).toBe(8);
    expect(projectiles.embeddedCount).toBe(8);
    projectiles.dispose();
  });

  it("keeps surface wound history independent of falling arrows and clears on reset",()=>{
    const actor=new THREE.Group(),marks=new SurfaceMarks(4);
    const root=marks.add("wound",{
      point:new THREE.Vector3(.1,.2,.3),normal:new THREE.Vector3(0,0,1),
      anchor:actor,
    });
    expect(root.parent).toBe(actor);
    expect(marks.count).toBe(1);
    marks.clear();
    expect(marks.count).toBe(0);
    expect(root.parent).toBeNull();
    marks.dispose();
  });
});
