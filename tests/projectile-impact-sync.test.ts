import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {
  aimBallisticAt,queueAttack,resolveReaction,resolveProjectileContinuation,
  effectsForAttack,selectImpactEffects, type DamageBreakdown,
} from "../packages/combat/src/index";
import {PREVIEW_CATALOG,createPreviewEncounter} from "../apps/web/src/combat/preview-encounter";
import {createWarrior} from "../apps/web/src/actors/warrior";
import {CombatHitVolumes} from "../apps/web/src/combat/CombatHitVolumes";
import {ProjectileClashEffects} from "../apps/web/src/effects/ProjectileClashEffects";
import {ImpactEffectDirector} from "../apps/web/src/feedback/ImpactEffectDirector";

describe("v0.4-D5 first-contact synchronization",()=>{
  it("returns exact first swept contact tick, world point, velocity and anatomical attachment",()=>{
    const rig=createWarrior("rakshasa");
    const volumes=new CombatHitVolumes(rig.root,
      createPreviewEncounter().actors.enemy!,PREVIEW_CATALOG);
    const center=volumes.worldCenter("torso").clone();
    const start=center.clone().add(new THREE.Vector3(0,0,6));
    const end=center.clone().add(new THREE.Vector3(0,0,-6));
    const path=aimBallisticAt(100,
      {x:start.x,y:start.y,z:start.z},
      {x:end.x,y:end.y,z:end.z},600,{x:0,y:0,z:0});
    expect(volumes.firstTrajectoryContact(path,100,200)).toBeNull();
    const impact=volumes.firstTrajectoryContact(path,100,600)!;
    expect(impact.contact).toBe(true);
    expect(impact.actualRegionId).toBe("torso");
    expect(impact.contactTick).toBeGreaterThan(200);
    expect(impact.contactTick).toBeLessThan(600);
    expect(impact.velocity!.z).toBeLessThan(0);
    expect(impact.contactNormal!.length()).toBeCloseTo(1);
    expect(impact.attachment).toBeDefined();
    expect(impact.impactPoint.distanceTo(center)).toBeLessThan(.65);
    const same=volumes.firstTrajectoryContact(path,100,600)!;
    expect(same.contactTick).toBe(impact.contactTick);
    volumes.dispose();rig.dispose();
  });
  it("the authoritative domain may resolve before authored arrival, only on verified contact",()=>{
    const state=createPreviewEncounter();
    const queued=queueAttack(state,{
      attackerId:"hero",defenderId:"enemy",moveId:"arrow",
      startedTick:100,distanceAtStartMeters:8,intendedRegionId:"torso",
    },PREVIEW_CATALOG);
    const contact=queued.pending!.impactTick-250;
    expect(()=>resolveReaction(queued,{
      defenderId:"enemy",defenseMoveId:null,reactionTick:null,
      resolvedTick:contact,distanceAtImpactMeters:8,
      contact:true,contactTick:contact,actualRegionId:"torso",
    },PREVIEW_CATALOG)).not.toThrow();
    const resolved=resolveReaction(queued,{
      defenderId:"enemy",defenseMoveId:null,reactionTick:null,
      resolvedTick:contact,distanceAtImpactMeters:8,
      contact:true,contactTick:contact,actualRegionId:"torso",
    },PREVIEW_CATALOG);
    expect(resolved.outcome.damage).toBeGreaterThan(0);
    expect(resolved.state.pending).toBeNull();
    expect(()=>resolveReaction(resolved.state,{
      defenderId:"enemy",defenseMoveId:null,reactionTick:null,
      resolvedTick:contact,distanceAtImpactMeters:8,
      contact:true,contactTick:contact,actualRegionId:"torso",
    },PREVIEW_CATALOG)).toThrow();
    expect(()=>resolveReaction(queued,{
      defenderId:"enemy",defenseMoveId:null,reactionTick:null,
      resolvedTick:contact-1,distanceAtImpactMeters:8,
      contact:true,contactTick:contact,actualRegionId:"torso",
    },PREVIEW_CATALOG)).toThrow();
  });
  it("never accepts a claimed early contact for melee or missing contact",()=>{
    const state=createPreviewEncounter();
    const arrow=queueAttack(state,{
      attackerId:"hero",defenderId:"enemy",moveId:"arrow",
      startedTick:100,distanceAtStartMeters:8,
    },PREVIEW_CATALOG);
    expect(()=>resolveReaction(arrow,{
      defenderId:"enemy",defenseMoveId:null,reactionTick:null,
      resolvedTick:500,distanceAtImpactMeters:8,
      contact:false,contactTick:500,actualRegionId:null,
    },PREVIEW_CATALOG)).toThrow();
  });
  it("surviving projectile accepts first contact before planned expiry but cannot double-hit",()=>{
    const base=createPreviewEncounter();
    const original=queueAttack(base,{
      attackerId:"hero",defenderId:"enemy",moveId:"arrow",
      startedTick:100,distanceAtStartMeters:8,
    },PREVIEW_CATALOG);
    const pending={
      projectileId:"same-arrow",source:"interceptor" as const,
      attackerId:"hero",defenderId:"enemy",moveId:"arrow",
      startedTick:600,impactTick:1400,damage:16,damageType:"pierce" as const,
      targeting:{mode:"actor" as const},intendedRegionId:null,
    };
    const state={...original,pending:null,pendingProjectile:pending};
    const impact=resolveProjectileContinuation(state,{
      projectileId:"same-arrow",resolvedTick:950,contactTick:900,
      distanceAtImpactMeters:8,actualRegionId:"torso",contact:true,
    },PREVIEW_CATALOG);
    expect(impact.outcome.damage).toBeGreaterThan(0);
    expect(impact.state.pendingProjectile).toBeNull();
    expect(()=>resolveProjectileContinuation(impact.state,{
      projectileId:"same-arrow",resolvedTick:1050,
      distanceAtImpactMeters:8,actualRegionId:"torso",contact:true,
    },PREVIEW_CATALOG)).toThrow();
    expect(()=>resolveProjectileContinuation(state,{
      projectileId:"same-arrow",resolvedTick:899,contactTick:900,
      distanceAtImpactMeters:8,actualRegionId:"torso",contact:true,
    },PREVIEW_CATALOG)).toThrow();
  });
});
describe("v0.4-D6 extensible hit presentation",()=>{
  const damage=(critical:boolean,finalDamage=22):DamageBreakdown=>({
    attackerId:"hero",defenderId:"enemy",moveId:"arrow",hitId:"impact",
    intendedRegionId:"head",actualRegionId:"head",damageType:"pierce",
    baseDamage:18,reactionMultiplier:1,vulnerabilityMultiplier:1,
    armorMultiplier:1,armorAbsorbed:0,critical,
    criticalMultiplier:critical?1.4:1,stagger:0,finalDamage,reasons:[],
  });
  it("only authored critical precision arrows request blood and embedding",()=>{
    expect(effectsForAttack(PREVIEW_CATALOG,"arrow",damage(true)))
      .toEqual(["blood_splat","embed_arrow"]);
    expect(effectsForAttack(PREVIEW_CATALOG,"arrow",damage(false))).toEqual([]);
    expect(effectsForAttack(PREVIEW_CATALOG,"recover_shot",damage(true))).toEqual([]);
    expect(effectsForAttack(PREVIEW_CATALOG,"arrow",damage(true,0))).toEqual([]);
  });
  it("new effect IDs require no combat rule changes and duplicate contacts are ignored",()=>{
    const spec=[{id:"burn_fx",when:"damage" as const},
      {id:"freeze_fx",when:"critical" as const}];
    expect(selectImpactEffects(spec,damage(true)))
      .toEqual(["burn_fx","freeze_fx"]);
    const director=new ImpactEffectDirector();
    const handled:string[]=[];
    director.register("burn_fx",()=>handled.push("burn"))
      .register("freeze_fx",()=>handled.push("freeze"));
    const ctx={projectileId:"arrow-01",point:new THREE.Vector3(),
      normal:new THREE.Vector3(0,1,0),velocity:new THREE.Vector3(0,0,1),
      regionId:"torso",attachment:null,tick:600,presentAtMs:620};
    expect(director.dispatch("arrow-01:hit",["burn_fx","freeze_fx"],ctx)).toBe(true);
    expect(director.dispatch("arrow-01:hit",["burn_fx","freeze_fx"],ctx)).toBe(false);
    expect(handled).toEqual(["burn","freeze"]);
    director.clear();
    expect(director.dispatch("arrow-01:hit",["burn_fx"],ctx)).toBe(true);
    expect(handled).toEqual(["burn","freeze","burn"]);
  });
  it("embeds the original projectile mesh on the struck animated attachment",()=>{
    const scene=new THREE.Scene(),effects=new ProjectileClashEffects(scene);
    const actor=new THREE.Group(),arm=new THREE.Group();
    actor.add(arm);
    actor.position.set(5,0,0);
    arm.position.set(0,1,0);
    scene.add(actor);
    const from=new THREE.Vector3(3,2,0),to=new THREE.Vector3(5,2,0);
    effects.launch("original-arrow",from,to,0,100);
    const projectileContainer=scene.children[0] as THREE.Group;
    const original=projectileContainer.children[0] as THREE.Group;
    const point=new THREE.Vector3(5,2,0);
    expect(effects.embed("original-arrow",arm,point,
      new THREE.Vector3(1,0,0))).toBe(true);
    expect(original.parent).toBe(arm);
    actor.rotation.y=.4;
    actor.updateWorldMatrix(true,true);
    const world=original.getWorldPosition(new THREE.Vector3());
    expect(Number.isFinite(world.x)).toBe(true);
    expect(effects.embed("original-arrow",arm,point,
      new THREE.Vector3(1,0,0))).toBe(false);
    // Restored pool slot still allows next arrow.
    effects.launch("next-arrow",from,to,100,100);
    effects.clear();
    expect(original.parent).toBeNull();
    effects.dispose();
  });
});
