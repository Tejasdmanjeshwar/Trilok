import { describe, expect, it } from "vitest";
import {
  createEncounter, getLegalAttackMoves, getLegalReactions,
  queueAttack, resolveCounter, resolveReaction, validateCombatCatalog,
  type CombatCatalog, type EncounterActor,
} from "../packages/combat/src/index";
import { createPreviewEncounter, PREVIEW_CATALOG } from "../apps/web/src/combat/preview-encounter";

function fresh(heroEquipped: "bow" | "sword" = "bow",
  enemyEquipped: "rakshasa_bow" | "rakshasa_sword" = "rakshasa_sword") {
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
  it("a perfect bow interception triggers an automatic, separately timed countershot",()=>{
    const r=defended("arrow","countershot",PREVIEW_CATALOG,"bow","rakshasa_bow");
    expect(r.outcome).toMatchObject({technique:"projectile_intercept",grade:"perfect",damage:0});
    expect(r.outcome.counter).toMatchObject({
      id:"bow_countershot",attackerId:"enemy",defenderId:"hero",
      presentation:"bow_shot",delivery:"ranged_projectile",
    });
    const counter=r.state.pendingCounter!;
    expect(counter.impactTick).toBe(1250+710);
    expect(getLegalAttackMoves(r.state,PREVIEW_CATALOG,"enemy",8)).toEqual([]);
    expect(getLegalReactions(r.state,PREVIEW_CATALOG)).toEqual([]);
    expect(()=>resolveCounter(r.state,counter.impactTick-1,PREVIEW_CATALOG)).toThrow();
    const impact=resolveCounter(r.state,counter.impactTick,PREVIEW_CATALOG);
    expect(impact.outcome).toMatchObject({counterId:"bow_countershot",damage:22});
    expect(impact.state.pendingCounter).toBeNull();
    expect(impact.state.actors.hero!.hp).toBe(78);
  });
  it("a perfect melee deflection invokes a sword riposte instead of showing only a parry",()=>{
    const r=defended("slash","blade_deflect");
    expect(r.outcome.counter?.presentation).toBe("sword_riposte");
    expect(r.outcome.counter?.damage).toBe(30);
    const impact=resolveCounter(r.state,r.state.pendingCounter!.impactTick,PREVIEW_CATALOG);
    expect(impact.outcome.damage).toBe(30);
  });
  it("good, partial, missed and dodge reactions do not create automatic counters",()=>{
    let base=fresh("bow","rakshasa_bow");
    base=queueAttack(base,{attackerId:"hero",defenderId:"enemy",moveId:"arrow",
      distanceAtStartMeters:8,startedTick:0},PREVIEW_CATALOG);
    const good=resolveReaction(base,{defenderId:"enemy",defenseMoveId:"countershot",
      reactionTick:base.pending!.impactTick-50,resolvedTick:base.pending!.impactTick,
      distanceAtImpactMeters:8},PREVIEW_CATALOG);
    expect(good.outcome.grade).not.toBe("perfect");
    expect(good.outcome.counter).toBeNull();
    const dodge=resolveReaction(base,{defenderId:"enemy",defenseMoveId:"evade",
      reactionTick:base.pending!.impactTick,resolvedTick:base.pending!.impactTick,
      distanceAtImpactMeters:8},PREVIEW_CATALOG);
    expect(dodge.outcome.grade).toBe("perfect");
    expect(dodge.outcome.counter).toBeNull();
  });
  it("move-level policy can disable or override the default perfect counter",()=>{
    const deny:CombatCatalog={...PREVIEW_CATALOG,attacks:{
      ...PREVIEW_CATALOG.attacks,arrow:{
        ...PREVIEW_CATALOG.attacks.arrow!,counterPolicy:{mode:"deny"},
      },
    }};
    expect(defended("arrow","countershot",deny,"bow","rakshasa_bow").outcome.counter).toBeNull();
    const override:CombatCatalog={...PREVIEW_CATALOG,attacks:{
      ...PREVIEW_CATALOG.attacks,arrow:{
        ...PREVIEW_CATALOG.attacks.arrow!,
        counterPolicy:{mode:"override",counterId:"sword_riposte"},
      },
    }};
    expect(defended("arrow","countershot",override,"bow","rakshasa_bow").outcome.counter?.id)
      .toBe("sword_riposte");
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
    const r=defended("slash","blade_deflect");
    expect(r.state.pendingCounter).not.toBeNull();
    expect(r.state.pending).toBeNull();
    expect(getLegalReactions(r.state,PREVIEW_CATALOG)).toEqual([]);
    const result=resolveCounter(r.state,r.state.pendingCounter!.impactTick,PREVIEW_CATALOG);
    expect(result.state.pendingCounter).toBeNull();
    expect(result.state.pending).toBeNull();
  });
});
