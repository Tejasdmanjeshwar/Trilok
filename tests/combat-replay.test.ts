import { describe, expect, it } from "vitest";
import { SeededRandom } from "../packages/combat-ai/src/index";
import { EncounterSession } from "../apps/web/src/combat/EncounterSession";

/**
 * A deterministic headless encounter runner. Not a second combat rules engine:
 * every move, cost and hit goes through the public EncounterSession adapter.
 * A settled, stationary 1.7m pose removes rendering and collision variables so
 * this detects illegal transitions, double consumption and stalled turn loops.
 */
function replay(seed:number) {
  const random=new SeededRandom(seed);
  const session=new EncounterSession();
  const events:string[]=[];
  let clock=1000,steps=0;
  while(session.state.phase!=="complete" && steps<250) {
    const state=session.state;
    expect(state.phase).toBe("decision");
    expect(state.pending).toBeNull();
    const actorId=state.activeActorId;
    const targetId=actorId==="hero"?"enemy":"hero";
    const legal=session.legalAttacks(targetId,1.7);
    if(!legal.length) {
      session.end(actorId);
      events.push(actorId+":end");
    } else {
      // Rotate between legal authored moves and end-turn choices across seeds.
      if(steps%9===8 && state.turnBudget.actionsUsed>0){
        session.end(actorId);
        events.push(actorId+":end");
      }else{
        const moveId=legal[Math.floor(random.next()*legal.length)]!;
        const move=session.catalog.attacks[moveId]!;
        const target=move.targeting?.mode==="free_aim"?"torso":null;
        session.attack(actorId,targetId,moveId,1.7,clock,target);
        const pending=session.state.pending;
        expect(pending?.moveId).toBe(moveId);
        expect(session.state.phase).toBe("reaction");
        expect(session.state.turnBudget.actionsUsed).toBeLessThanOrEqual(
          session.state.rules.maxActionsPerTurn);
        const spatial=target?{actualRegionId:"torso",contact:true}:undefined;
        // D13: one committed attack may author several independently
        // defendable hits. Resolve every hit, retaining one action/Energy cost.
        const committedActions=session.state.turnBudget.actionsUsed;
        let hitCount=0;
        while(session.state.pending){
          const hit=session.state.pending;
          const resolvedAt=hit.impactTick+500;
          const result=session.resolveIfReady(resolvedAt,1.7,undefined,spatial);
          expect(result).not.toBeNull();
          expect(result!.outcome.hitIndex).toBe(hitCount);
          events.push(actorId+":"+moveId+":"+result!.outcome.hitId+":"+
            result!.outcome.damage+":"+session.state.turn+":"+session.state.phase);
          hitCount++;
          expect(hitCount).toBeLessThanOrEqual(16);
          clock=Math.max(clock,resolvedAt+100);
          if(session.state.pending)
            expect(session.state.turnBudget.actionsUsed).toBe(committedActions);
        }
        expect(hitCount).toBeGreaterThan(0);
      }
    }
    for(const actor of Object.values(session.state.actors)){
      expect(actor.hp).toBeGreaterThanOrEqual(0);
      expect(actor.hp).toBeLessThanOrEqual(actor.maxHp);
      expect(actor.resource).toBeGreaterThanOrEqual(0);
      expect(actor.resource).toBeLessThanOrEqual(actor.maxResource);
    }
    clock+=2500;
    steps++;
  }
  expect(session.state.phase, "seed="+seed+" stalled after "+steps).toBe("complete");
  expect(session.state.victorId).toMatch(/^(hero|enemy)$/);
  return events.join("|");
}

describe("D10 reproducible combat replay",()=>{
  it("runs 1,000 varied seeded encounters without an illegal transition or soft-lock",()=>{
    for(let seed=1;seed<=1000;seed++)replay(seed);
  });
  it("replays the exact same outcomes with identical seeds",()=>{
    for(const seed of [1,7,42,119,213,999,123456]){
      expect(replay(seed)).toBe(replay(seed));
    }
  });
});
