import {describe,expect,it} from "vitest";
import {EnemyCombatBrain,ENEMY_PROFILES} from "../packages/combat-ai/src/index";
import {PREVIEW_CATALOG,createPreviewEncounter} from "../apps/web/src/combat/preview-encounter";

function evaluate(style:"duelist"|"trickster"|"brute",parries=0,dodges=0,ignored=0){
  const brain=new EnemyCombatBrain({...ENEMY_PROFILES.capable,
    fightingStyle:style,decisionNoise:0},119);
  for(let i=0;i<parries;i++)brain.observeDefense("hero","weapon_deflect");
  for(let i=0;i<dodges;i++)brain.observeDefense("hero","dodge");
  for(let i=0;i<ignored;i++)brain.observeDefense("hero",null);
  const state=createPreviewEncounter();
  const ready={...state,activeActorId:"enemy",actors:{...state.actors,
    enemy:{...state.actors.enemy!,resource:8}}};
  brain.decide({state:ready,catalog:PREVIEW_CATALOG,
    actorId:"enemy",targetId:"hero",distanceMeters:3,tick:1000});
  return {brain,trace:brain.trace!};
}
function score(result:ReturnType<typeof evaluate>,id:string){
  const item=result.trace.scores.find(x=>x.intent.kind==="attack"&&x.intent.moveId===id);
  if(!item)throw new Error("Expected pattern in legal action scores: "+id);
  return item.score;
}
describe("D13 enemy fighting styles and player habit adaptation",()=>{
  it("distinguishes duelist flurries, trickster feints and brute delayed attacks",()=>{
    expect(score(evaluate("duelist"),"rakshasa_crosscut")).toBeGreaterThan(
      score(evaluate("brute"),"rakshasa_crosscut"));
    expect(score(evaluate("trickster"),"rakshasa_deceiver")).toBeGreaterThan(
      score(evaluate("duelist"),"rakshasa_deceiver"));
    expect(score(evaluate("brute"),"rakshasa_delayed_heavy")).toBeGreaterThan(
      score(evaluate("duelist"),"rakshasa_delayed_heavy"));
  });
  it("responds to observed defenses rather than fabricated predicted actions",()=>{
    expect(score(evaluate("trickster",4),"rakshasa_deceiver")).toBeGreaterThan(
      score(evaluate("trickster"),"rakshasa_deceiver"));
    expect(score(evaluate("brute",0,4),"rakshasa_delayed_heavy")).toBeGreaterThan(
      score(evaluate("brute"),"rakshasa_delayed_heavy"));
    expect(score(evaluate("duelist",0,0,4),"rakshasa_crosscut")).toBeGreaterThan(
      score(evaluate("duelist"),"rakshasa_crosscut"));
  });
  it("keeps bounded memory, resets safely and remains seeded-deterministic",()=>{
    const sample=evaluate("trickster",4);
    expect(sample.brain.observedDefenseHistory).toEqual({parry:4,dodge:0,ignored:0});
    for(let i=0;i<50;i++)sample.brain.observeDefense("hero","weapon_deflect");
    const history=sample.brain.observedDefenseHistory!;
    expect(history.parry+history.dodge+history.ignored).toBeLessThanOrEqual(8);
    sample.brain.reset();
    expect(sample.brain.observedDefenseHistory).toBeNull();
    expect(evaluate("duelist").trace.scores).toEqual(evaluate("duelist").trace.scores);
    expect(()=>new EnemyCombatBrain({...ENEMY_PROFILES.elite,
      fightingStyle:"unknown" as "trickster"},1)).toThrow();
  });
});
