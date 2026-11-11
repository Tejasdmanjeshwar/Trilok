import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMBAT_CATALOG, STANDARD_ENCOUNTER_RULES,
  captureOffensiveTiming, createEncounter, queueAttack, resolveReaction,
  gradeOffense, offensiveMultiplier, validateCombatCatalog,
  type EncounterActor, type EncounterState,
} from "../packages/combat/src/index";

const catalog=DEFAULT_COMBAT_CATALOG;
function actor(id:string,weapon="sword"):EncounterActor {
  return {id,hp:250,maxHp:250,resource:8,maxResource:8,equippedId:weapon,
    loadoutIds:["sword","bow"],status:"ready",cooldownUntilTurn:{},
    switchedOnTurn:null};
}
function start():EncounterState {
  return createEncounter([actor("hero"),actor("enemy")],catalog,"hero",STANDARD_ENCOUNTER_RULES);
}
function queue(state:EncounterState,id:string,tick:number):EncounterState {
  return queueAttack(state,{
    attackerId:"hero",defenderId:"enemy",moveId:id,
    distanceAtStartMeters:1.6,startedTick:tick,
  },catalog);
}
function finish(state:EncounterState,tick?:number,parried=false) {
  const pending=state.pending!;
  return resolveReaction(state,{
    defenderId:"enemy",
    defenseMoveId:parried?"blade_deflect":null,
    reactionTick:parried?pending.impactTick:null,
    resolvedTick:tick??pending.impactTick,
    distanceAtImpactMeters:1.6,
  },catalog);
}
describe("D12 authoritative rhythm timing",()=>{
  it("grades exact perfect and good window boundaries deterministically",()=>{
    const policy=catalog.attacks.slash!.offensiveTiming!;
    expect(gradeOffense(0,policy)).toBe("perfect");
    expect(gradeOffense(policy.perfectWindowTicks,policy)).toBe("perfect");
    expect(gradeOffense(-policy.perfectWindowTicks,policy)).toBe("perfect");
    expect(gradeOffense(policy.perfectWindowTicks+1,policy)).toBe("good");
    expect(gradeOffense(policy.goodWindowTicks,policy)).toBe("good");
    expect(gradeOffense(policy.goodWindowTicks+1,policy)).toBe("miss");
    expect(offensiveMultiplier(null,3,policy)).toBe(1);
    expect(offensiveMultiplier("miss",3,policy)).toBe(1);
    expect(offensiveMultiplier("perfect",3,policy)).toBeLessThanOrEqual(1.5);
  });
  it("requires the committed actor, one input, and the true attack clock",()=>{
    const s=queue(start(),"rapid_slash",1000);
    const policy=s.pending!.offense!.policy;
    const target=1000+policy.targetOffsetTicks;
    expect(() => captureOffensiveTiming(s,"enemy",target)).toThrow();
    expect(() => captureOffensiveTiming(s,"hero",999)).toThrow();
    expect(() => captureOffensiveTiming(s,"hero",target-600)).toThrow();
    expect(() => captureOffensiveTiming(s,"hero",target+policy.goodWindowTicks+1)).toThrow();
    const score=captureOffensiveTiming(s,"hero",target);
    expect(score.grade).toBe("perfect");
    expect(score.state.pending!.offense).toMatchObject({grade:"perfect",inputTick:target});
    expect(s.pending!.offense!.inputTick).toBeNull();
    expect(() => captureOffensiveTiming(score.state,"hero",target)).toThrow(/already used/);
  });
  it("perfect execution raises only confirmed damage and builds capped chain",()=>{
    let s=start();
    s=queue(s,"rapid_slash",0);
    s=captureOffensiveTiming(s,"hero",560).state;
    const first=finish(s);
    expect(first.outcome.damage).toBeGreaterThan(catalog.attacks.rapid_slash!.damage);
    expect(first.outcome.breakdown.offenseGrade).toBe("perfect");
    expect(first.outcome.breakdown.offenseMultiplier).toBeCloseTo(1.16);
    expect(first.state.turnBudget.rhythmChain).toBe(1);
    s=queue(first.state,"slash",3000);
    s=captureOffensiveTiming(s,"hero",4240).state;
    const second=finish(s);
    expect(second.outcome.breakdown.offenseMultiplier).toBeCloseTo(1.195);
    expect(second.state.turnBudget.rhythmChain).toBe(2);
    const baseline=finish(queue(start(),"slash",0));
    expect(baseline.outcome.breakdown.offenseMultiplier).toBe(1);
    expect(baseline.outcome.damage).toBe(22);
  });
  it("does not bypass parry or contact and resets chain on ungraded action",()=>{
    let s=queue(start(),"rapid_slash",0);
    s=captureOffensiveTiming(s,"hero",560).state;
    s=finish(s).state;
    expect(s.turnBudget.rhythmChain).toBe(1);
    s=queue(s,"slash",3000);
    s=captureOffensiveTiming(s,"hero",4240).state;
    const defended=finish(s,4450,true);
    expect(defended.outcome.damage).toBe(0);
    expect(defended.state.turnBudget.rhythmChain).toBe(0);
    const ungraded=finish(queue(defended.state,"slash",6000));
    expect(ungraded.state.turnBudget.rhythmChain).toBe(0);
  });
  it("restarts rhythm at the new actor turn and rejects invalid policy",()=>{
    let s=queue(start(),"rapid_slash",0);
    s=captureOffensiveTiming(s,"hero",560).state;
    s=finish(s).state;
    s=queue(s,"heavy_crush",3000);
    s=captureOffensiveTiming(s,"hero",4590).state;
    s=finish(s).state;
    expect(s.activeActorId).toBe("enemy");
    expect(s.turnBudget.rhythmChain).toBe(0);
    expect(()=>validateCombatCatalog({...catalog,attacks:{...catalog.attacks,
      slash:{...catalog.attacks.slash!,offensiveTiming:{
        ...catalog.attacks.slash!.offensiveTiming!,targetOffsetTicks:2000,
      }},
    }})).toThrow(/offensive timing/);
    expect(()=>validateCombatCatalog({...catalog,attacks:{...catalog.attacks,
      slash:{...catalog.attacks.slash!,offensiveTiming:{
        ...catalog.attacks.slash!.offensiveTiming!,perfectBonus:.8,
      }},
    }})).toThrow(/offensive timing/);
  });
});
