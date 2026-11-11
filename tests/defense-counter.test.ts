import { describe, expect, it } from "vitest";
import {
  createEncounter, getLegalAttackMoves, getLegalReactions,
  queueAttack, resolveCounter, resolveReaction, validateCombatCatalog,
  type CombatCatalog, type EncounterState,
} from "../packages/combat/src/index";
import { createPreviewEncounter, PREVIEW_CATALOG } from "../apps/web/src/combat/preview-encounter";

function fresh(heroEquipped: "bow" | "sword" = "bow",
  enemyEquipped: "rakshasa_bow" | "rakshasa_sword" = "rakshasa_sword"): EncounterState {
  const original=createPreviewEncounter();
  return { ...original,actors:{
    ...original.actors,
    hero:{...original.actors.hero!,equippedId:heroEquipped},
    enemy:{...original.actors.enemy!,equippedId:enemyEquipped},
  }};
}
function defended(moveId:string, technique:string, catalog=PREVIEW_CATALOG,
  heroWeapon:"bow"|"sword"="bow", enemyWeapon:"rakshasa_bow"|"rakshasa_sword"="rakshasa_sword") {
  let state=fresh(heroWeapon,enemyWeapon);
  state=queueAttack(state,{
    attackerId:"hero",defenderId:"enemy",moveId,
    distanceAtStartMeters:moveId==="slash"?1.7:8,startedTick:100,
  },catalog);
  return resolveReaction(state,{
    defenderId:"enemy",defenseMoveId:technique,
    reactionTick:state.pending!.impactTick,
    resolvedTick:state.pending!.impactTick,
    distanceAtImpactMeters:moveId==="slash"?1.7:8,
  },catalog);
}
describe("v0.4-D1 move-authored perfect defensive counters",()=>{
  it("perfect bow interception launches once, collides early and continues the original arrow",()=>{
    let state=fresh("bow","rakshasa_bow");
    state=queueAttack(state,{
      attackerId:"hero",defenderId:"enemy",moveId:"arrow",
      distanceAtStartMeters:8,startedTick:100,
    },PREVIEW_CATALOG);
    const option=getLegalReactions(state,PREVIEW_CATALOG).find(x=>x.technique==="projectile_intercept")!;
    const r=resolveReaction(state,{
      defenderId:"enemy",defenseMoveId:"countershot",
      reactionTick:option.targetTick,resolvedTick:option.clashTick,
      distanceAtImpactMeters:8,
    },PREVIEW_CATALOG);
    expect(r.outcome).toMatchObject({technique:"projectile_intercept",grade:"perfect",damage:0,counter:null});
    expect(r.outcome.projectileClash?.verdict).toBe("interceptor_survives");
    expect(r.state.pendingCounter).toBeNull();
    expect(r.state.pendingProjectile?.projectileId).toBe("intercept:enemy:100:impact");
    expect(getLegalAttackMoves(r.state,PREVIEW_CATALOG,"enemy",8)).toEqual([]);
  });
  it("a perfect melee deflection invokes a sword riposte instead of showing only a parry",()=>{
    const r=defended("slash","blade_deflect",PREVIEW_CATALOG,"sword","rakshasa_sword");
    expect(r.outcome.counter?.presentation).toBe("sword_riposte");
    expect(r.outcome.counter?.damage).toBe(30);
    const impact=resolveCounter(r.state,r.state.pendingCounter!.impactTick,PREVIEW_CATALOG);
    expect(impact.outcome.damage).toBe(30);
  });
  it("good collision shatters both, dodge does not produce a retaliation",()=>{
    let state=fresh("bow","rakshasa_bow");
    state=queueAttack(state,{
      attackerId:"hero",defenderId:"enemy",moveId:"arrow",
      distanceAtStartMeters:8,startedTick:100,
    },PREVIEW_CATALOG);
    const option=getLegalReactions(state,PREVIEW_CATALOG).find(x=>x.technique==="projectile_intercept")!;
    const good=resolveReaction(state,{
      defenderId:"enemy",defenseMoveId:"countershot",
      reactionTick:option.targetTick+42,resolvedTick:option.clashTick,
      distanceAtImpactMeters:8,
    },PREVIEW_CATALOG);
    expect(good.outcome.projectileClash?.verdict).toBe("mutual_destruction");
    expect(good.outcome.counter).toBeNull();
    const dodge=resolveReaction(state,{
      defenderId:"enemy",defenseMoveId:"evade",
      reactionTick:state.pending!.impactTick,resolvedTick:state.pending!.impactTick,
      distanceAtImpactMeters:8,
    },PREVIEW_CATALOG);
    expect(dodge.outcome.counter).toBeNull();
    expect(dodge.outcome.projectileClash).toBeNull();
  });
  it("move-level policy can disable interceptor follow-through without spawning a new arrow",()=>{
    const deny:CombatCatalog={...PREVIEW_CATALOG,attacks:{
      ...PREVIEW_CATALOG.attacks,arrow:{
        ...PREVIEW_CATALOG.attacks.arrow!,counterPolicy:{mode:"deny"},
      },
    }};
    let state=fresh("bow","rakshasa_bow");
    state=queueAttack(state,{
      attackerId:"hero",defenderId:"enemy",moveId:"arrow",
      distanceAtStartMeters:8,startedTick:100,
    },deny);
    const option=getLegalReactions(state,deny).find(x=>x.technique==="projectile_intercept")!;
    const r=resolveReaction(state,{
      defenderId:"enemy",defenseMoveId:"countershot",
      reactionTick:option.targetTick,resolvedTick:option.clashTick,
      distanceAtImpactMeters:8,
    },deny);
    expect(r.outcome.projectileClash?.continuation).toBeNull();
    expect(r.outcome.counter).toBeNull();
  });
  it("the data validator rejects unknown or malformed counters and overrides",()=>{
    expect(()=>validateCombatCatalog({...PREVIEW_CATALOG,attacks:{
      ...PREVIEW_CATALOG.attacks,arrow:{
        ...PREVIEW_CATALOG.attacks.arrow!,counterPolicy:{mode:"override",counterId:"bogus"},
      },
    }})).toThrow();
    expect(()=>validateCombatCatalog({...PREVIEW_CATALOG,counters:{
      ...PREVIEW_CATALOG.counters,bad:{
        id:"bad",damage:0,damageType:"slash",delivery:"melee_contact",
        impactOffsetTicks:0,presentation:"sword_riposte",
      },
    }})).toThrow();
  });
  it("a counter cannot be parried, dodged, intercepted, or countered again",()=>{
    const r=defended("slash","blade_deflect",PREVIEW_CATALOG,"sword","rakshasa_sword");
    expect(r.state.pendingCounter).not.toBeNull();
    expect(r.state.pending).toBeNull();
    expect(getLegalReactions(r.state,PREVIEW_CATALOG)).toEqual([]);
    const result=resolveCounter(r.state,r.state.pendingCounter!.impactTick,PREVIEW_CATALOG);
    expect(result.state.pendingCounter).toBeNull();
    expect(result.state.pending).toBeNull();
  });
});
