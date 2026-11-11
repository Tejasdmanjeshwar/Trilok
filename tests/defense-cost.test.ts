import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMBAT_CATALOG, STANDARD_ENCOUNTER_RULES, createEncounter,
  endTurn, getLegalReactions, queueAttack, resolveReaction,
  type CombatCatalog, type EncounterActor, type EncounterState,
} from "../packages/combat/src/index";

const catalog = DEFAULT_COMBAT_CATALOG;
function actor(id: string, weapon: string, resource = 2): EncounterActor {
  return {
    id, hp: 100, maxHp: 100, resource, maxResource: 8,
    equippedId: weapon, loadoutIds: ["bow","sword"],
    status: "ready", cooldownUntilTurn: {}, switchedOnTurn: null,
  };
}
function combo(length: number): CombatCatalog {
  return { ...catalog, attacks: { ...catalog.attacks, arrow: {
    ...catalog.attacks.arrow!,
    damage: 1,
    hits: Array.from({length},(_,i)=>({
      id: "hit-" + i, offsetTicks: 1150 + i * 270,
    })),
  } } };
}
function queued(attacks: CombatCatalog, resource = 2): EncounterState {
  const state = createEncounter([
    actor("hero","bow"), actor("enemy","sword",resource),
  ],attacks,"hero",STANDARD_ENCOUNTER_RULES);
  return queueAttack(state,{
    attackerId:"hero",defenderId:"enemy",moveId:"arrow",
    distanceAtStartMeters:8,startedTick:100,
  },attacks);
}
function deflect(s: EncounterState, current: CombatCatalog, id = "blade_deflect") {
  const impact = s.pending!.impactTick;
  return resolveReaction(s,{
    defenderId:"enemy",defenseMoveId:id,
    reactionTick:impact,resolvedTick:impact,
    distanceAtImpactMeters:8,
  },current);
}
describe("shared free first defense, then successive Energy cost",()=>{
  it("does not charge first defense, even with zero Energy",()=>{
    const c=combo(1);
    const s=queued(c,0);
    expect(getLegalReactions(s,c).map(x=>x.resourceCost)).toEqual([0,0]);
    const r=deflect(s,c);
    expect(r.outcome.energySpent).toBe(0);
    expect(r.outcome.energyRefunded).toBe(0);
    expect(r.state.actors.enemy!.resource).toBe(0);
    expect(r.state.defenseUsesSinceTurn.enemy).toBe(1);
  });
  it("charges each later technique without allowing a free parry/dodge alternation",()=>{
    const c=combo(3);
    let s=queued(c,2);
    let r=deflect(s,c);
    expect(r.outcome.energySpent).toBe(0);
    s=r.state;
    expect(getLegalReactions(s,c).find(x=>x.moveId==="evade")?.resourceCost).toBe(1);
    r=deflect(s,c,"evade");
    expect(r.outcome.energySpent).toBe(1);
    s=r.state;
    r=deflect(s,c);
    expect(r.outcome.energySpent).toBe(1);
    expect(r.state.actors.enemy!.resource).toBe(0);
    expect(r.state.defenseUsesSinceTurn.enemy).toBe(3);
  });
  it("disables unaffordable repeated defense while keeping first free",()=>{
    const c=combo(2);
    const s=queued(c,0);
    const first=deflect(s,c).state;
    expect(getLegalReactions(first,c)).toEqual([]);
    const missed=resolveReaction(first,{
      defenderId:"enemy",defenseMoveId:null,reactionTick:null,
      resolvedTick:first.pending!.impactTick,distanceAtImpactMeters:8,
    },c);
    expect(missed.outcome.damage).toBe(1);
  });
  it("resets only on the defender's next own turn, never on each hit",()=>{
    const c=combo(1);
    let state=queued(c,3);
    state=deflect(state,c).state;
    expect(state.defenseUsesSinceTurn.enemy).toBe(1);
    state=endTurn(state,"hero");
    expect(state.activeActorId).toBe("enemy");
    expect(state.defenseUsesSinceTurn.enemy).toBe(0);
    expect(state.actors.enemy!.resource).toBe(4);
  });
  it("does not award Energy from a free perfect parry",()=>{
    const s=queued(combo(1),8);
    const r=deflect(s,combo(1));
    expect(r.outcome.grade).toBe("perfect");
    expect(r.outcome.energySpent).toBe(0);
    expect(r.outcome.energyRefunded).toBe(0);
    expect(r.state.actors.enemy!.resource).toBe(8);
  });
});
