import { describe, expect, it } from "vitest";
import {
  getLegalAttackMoves, getLegalReactions,
  queueAttack, resolveCounter, resolveReaction,
  resolveProjectileContinuation, validateCombatCatalog,
  type CombatCatalog, type EncounterState,
} from "../packages/combat/src/index";
import { createPreviewEncounter, PREVIEW_CATALOG } from "../apps/web/src/combat/preview-encounter";

function ready(heroWeapon:"bow"|"sword"="bow",enemyWeapon:"rakshasa_bow"|"rakshasa_sword"="rakshasa_bow"): EncounterState {
  const state=createPreviewEncounter();
  return {...state,actors:{
    ...state.actors,
    hero:{...state.actors.hero!,equippedId:heroWeapon},
    enemy:{...state.actors.enemy!,equippedId:enemyWeapon},
  }};
}
function pending(catalog:CombatCatalog=PREVIEW_CATALOG,moveId="arrow",
  heroWeapon:"bow"|"sword"="bow",enemyWeapon:"rakshasa_bow"|"rakshasa_sword"="rakshasa_bow"){
  return queueAttack(ready(heroWeapon,enemyWeapon),{
    attackerId:"hero",defenderId:"enemy",moveId,
    distanceAtStartMeters:moveId==="slash"?1.7:8,startedTick:100,
  },catalog);
}
function intercept(state:EncounterState,catalog=PREVIEW_CATALOG,offset=0){
  const option=getLegalReactions(state,catalog).find(x=>x.technique==="projectile_intercept")!;
  return resolveReaction(state,{
    defenderId:"enemy",defenseMoveId:option.moveId,
    reactionTick:option.targetTick+offset,
    resolvedTick:option.clashTick,
    distanceAtImpactMeters:8,
  },catalog);
}
describe("v0.4-D3 one continuous projectile clash",()=>{
  it("perfect: two stable arrows collide, defender arrow survives with NO second counter",()=>{
    const state=pending();
    const option=getLegalReactions(state,PREVIEW_CATALOG).find(x=>x.technique==="projectile_intercept")!;
    expect(option.targetTick).toBe(935);
    expect(option.clashTick).toBe(1135);
    const result=intercept(state);
    expect(result.outcome).toMatchObject({result:"clash",damage:0,counter:null,grade:"perfect"});
    const clash=result.outcome.projectileClash!;
    expect(clash).toMatchObject({verdict:"interceptor_survives",survivingProjectileId:"intercept:enemy:100:impact"});
    expect(clash.incomingProjectileId).toBe("attack:hero:100:impact");
    expect(result.state.pendingCounter).toBeNull();
    expect(result.state.pendingProjectile?.projectileId).toBe(clash.interceptorProjectileId);
    expect(result.state.actors.hero!.hp).toBe(100);
    expect(getLegalAttackMoves(result.state,PREVIEW_CATALOG,"enemy",8)).toEqual([]);
    expect(getLegalReactions(result.state,PREVIEW_CATALOG)).toEqual([]);
    const continuation=result.state.pendingProjectile!;
    expect(()=>resolveProjectileContinuation(result.state,{
      projectileId:continuation.projectileId,resolvedTick:continuation.impactTick-1,
      distanceAtImpactMeters:8,
    },PREVIEW_CATALOG)).toThrow();
    const finish=resolveProjectileContinuation(result.state,{
      projectileId:continuation.projectileId,resolvedTick:continuation.impactTick,
      distanceAtImpactMeters:8,
    },PREVIEW_CATALOG);
    expect(finish.outcome.source).toBe("interceptor");
    expect(finish.outcome.projectileId).toBe(clash.interceptorProjectileId);
    expect(finish.outcome.damage).toBe(17);
    expect(finish.state.actors.hero!.hp).toBe(83);
    expect(finish.state.pendingProjectile).toBeNull();
  });
  it("good: both arrows shatter at the midair collision, no damage or continuation",()=>{
    const result=intercept(pending(),PREVIEW_CATALOG,42);
    expect(result.outcome.grade).toBe("good");
    expect(result.outcome.projectileClash?.verdict).toBe("mutual_destruction");
    expect(result.state.pendingProjectile).toBeNull();
    expect(result.state.actors.hero!.hp).toBe(100);
    expect(result.state.actors.enemy!.hp).toBe(88);
  });
  it("partial: weaker intercept shatters, incoming arrow survives and may hit",()=>{
    const result=intercept(pending(),PREVIEW_CATALOG,79);
    expect(result.outcome.grade).toBe("partial");
    const clash=result.outcome.projectileClash!;
    expect(clash.verdict).toBe("incoming_survives");
    expect(clash.survivingProjectileId).toBe(clash.incomingProjectileId);
    const next=result.state.pendingProjectile!;
    expect(next.source).toBe("incoming");
    expect(next.impactTick).toBe(1250);
    const impact=resolveProjectileContinuation(result.state,{
      projectileId:next.projectileId,resolvedTick:next.impactTick,
      distanceAtImpactMeters:8,contact:true,actualRegionId:"torso",
    },PREVIEW_CATALOG);
    expect(impact.outcome.damage).toBeGreaterThan(0);
    expect(impact.state.actors.enemy!.hp).toBeLessThan(88);
  });
  it("power is authored: a stronger interception wins even on good timing",()=>{
    const tougher:CombatCatalog={...PREVIEW_CATALOG,defenses:{
      ...PREVIEW_CATALOG.defenses,
      countershot:{...PREVIEW_CATALOG.defenses.countershot!,
        projectileInterception:{...PREVIEW_CATALOG.defenses.countershot!.projectileInterception!,power:19},
      },
    }};
    const result=intercept(pending(tougher),tougher,42);
    expect(result.outcome.grade).toBe("good");
    expect(result.outcome.projectileClash?.verdict).toBe("interceptor_survives");
  });
  it("incoming move can deny projectile follow-through without respawning its arrow",()=>{
    const restricted:CombatCatalog={...PREVIEW_CATALOG,attacks:{
      ...PREVIEW_CATALOG.attacks,
      arrow:{...PREVIEW_CATALOG.attacks.arrow!,counterPolicy:{mode:"deny"}},
    }};
    const result=intercept(pending(restricted),restricted);
    expect(result.outcome.projectileClash?.verdict).toBe("interceptor_survives");
    expect(result.outcome.projectileClash?.survivingProjectileId).toBe("intercept:enemy:100:impact");
    expect(result.outcome.projectileClash?.continuation).toBeNull();
    expect(result.state.pendingProjectile).toBeNull();
  });
  it("player sword riposte stays independently animated and exclusive to perfect melee deflect",()=>{
    const state=pending(PREVIEW_CATALOG,"slash","sword","rakshasa_sword");
    const deflect=getLegalReactions(state,PREVIEW_CATALOG).find(x=>x.technique==="weapon_deflect")!;
    const result=resolveReaction(state,{
      defenderId:"enemy",defenseMoveId:deflect.moveId,
      reactionTick:deflect.targetTick,resolvedTick:deflect.clashTick,
      distanceAtImpactMeters:1.7,
    },PREVIEW_CATALOG);
    expect(result.outcome.counter?.presentation).toBe("sword_riposte");
    expect(result.outcome.projectileClash).toBeNull();
    const counter=resolveCounter(result.state,result.state.pendingCounter!.impactTick,PREVIEW_CATALOG);
    expect(counter.outcome.damage).toBe(30);
  });
  it("unreacted incoming arrow still resolves normally at its original impact",()=>{
    const state=pending();
    const result=resolveReaction(state,{
      defenderId:"enemy",defenseMoveId:null,reactionTick:null,
      resolvedTick:state.pending!.impactTick,distanceAtImpactMeters:8,
    },PREVIEW_CATALOG);
    expect(result.outcome.projectileClash).toBeNull();
    expect(result.outcome.damage).toBe(18);
    expect(result.state.pendingProjectile).toBeNull();
  });
  it("invalid interception specs are rejected centrally",()=>{
    const invalid:CombatCatalog={...PREVIEW_CATALOG,defenses:{
      ...PREVIEW_CATALOG.defenses,countershot:{
        ...PREVIEW_CATALOG.defenses.countershot!,
        projectileInterception:{...PREVIEW_CATALOG.defenses.countershot!.projectileInterception!,
          clashLeadTicks:400},
      },
    }};
    expect(()=>validateCombatCatalog(invalid)).toThrow();
  });
});
