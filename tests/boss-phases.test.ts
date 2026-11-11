import {describe,expect,it} from "vitest";
import {BossPhaseDirector,RAKSHASA_PHASES} from "../apps/web/src/combat/BossPhaseDirector";
import {createPreviewEncounter,PREVIEW_CATALOG} from "../apps/web/src/combat/preview-encounter";
import {EnemyCombatBrain,ENEMY_PROFILES} from "../packages/combat-ai/src/index";
import {getLegalAttackMoves,queueAttack,type EncounterState} from "../packages/combat/src/index";

function atHp(hp:number,turn=2):EncounterState {
  const s=createPreviewEncounter();
  return {...s,turn,activeActorId:"enemy",
    actors:{...s.actors,enemy:{...s.actors.enemy!,hp}}};
}
describe("D14 miniboss phase transitions",()=>{
  it("starts Sentinel, transitions exactly at 65% and 30%, and never regresses",()=>{
    const director=new BossPhaseDirector();
    expect(director.current).toMatchObject({id:1,name:"SENTINEL"});
    expect(director.advance(atHp(58))).toBeNull(); // 58/88 = 65.9%
    const veil=director.advance(atHp(57));
    expect(veil).toMatchObject({id:2,fightingStyle:"trickster"});
    expect(director.advance(atHp(1,2))).toBeNull(); // one phase per turn
    expect(director.advance(atHp(57,4))).toBeNull();
    expect(director.advance(atHp(26,4))).toMatchObject({id:3,name:"UNBOUND FURY"});
    expect(director.advance(atHp(1,6))).toBeNull();
    expect(director.isFinal).toBe(true);
    director.reset();
    expect(director.current.id).toBe(1);
    expect(director.advance(atHp(26,2))?.id).toBe(2); // no skipped phase
  });
  it("cannot interrupt a hit, counter, projectile, hero turn, death or completed encounter",()=>{
    const director=new BossPhaseDirector();
    const ready=atHp(20);
    expect(director.advance({...ready,activeActorId:"hero"})).toBeNull();
    expect(director.advance({...ready,phase:"reaction"})).toBeNull();
    expect(director.advance({...ready,pendingCounter:{
      attackerId:"hero",defenderId:"enemy",moveId:"sword_riposte",
      startedTick:100,impactTick:400,
    } as EncounterState["pendingCounter"]})).toBeNull();
    expect(director.advance({...ready,pendingProjectile:{
      projectileId:"arrow",attackerId:"hero",defenderId:"enemy",impactTick:400,
    } as EncounterState["pendingProjectile"]})).toBeNull();
    expect(director.advance({...ready,actors:{...ready.actors,enemy:{
      ...ready.actors.enemy!,hp:0}}})).toBeNull();
    expect(director.advance({...ready,phase:"complete",victorId:"hero"})).toBeNull();
    const committing={...createPreviewEncounter(),activeActorId:"enemy"};
    const queued=queueAttack(committing,{attackerId:"enemy",defenderId:"hero",
      moveId:"overhead_slash",distanceAtStartMeters:2,startedTick:1000},
      PREVIEW_CATALOG);
    const wounded={...queued,actors:{...queued.actors,enemy:{
      ...queued.actors.enemy!,hp:20}}};
    expect(director.advance(wounded)).toBeNull();
    expect(director.current.id).toBe(1);
  });
  it("is read-only relative to combat state: HP and Energy are never healed or refilled",()=>{
    const boss=new BossPhaseDirector();
    const ready=atHp(57);
    const before=JSON.stringify(ready);
    expect(boss.advance(ready)?.id).toBe(2);
    expect(JSON.stringify(ready)).toBe(before);
    expect(ready.actors.enemy!.hp).toBe(57);
    expect(ready.actors.enemy!.resource).toBe(6);
  });
  it("validates monotonically descending thresholds and unique allowed moves",()=>{
    const phase=RAKSHASA_PHASES[1]!;
    expect(()=>new BossPhaseDirector("enemy",[
      RAKSHASA_PHASES[0]!,{...phase,enterAtOrBelow:1},
    ])).toThrow();
    expect(()=>new BossPhaseDirector("enemy",[
      RAKSHASA_PHASES[0]!,{...phase,attackAllowlist:["x","x"]},
    ])).toThrow();
  });
});
describe("D14 phase-gated deterministic utility AI",()=>{
  function decide(stage=RAKSHASA_PHASES[0]!,seed=119){
    const ai=new EnemyCombatBrain(ENEMY_PROFILES.capable,seed);
    ai.setBattleStage(stage.fightingStyle,stage.aggressionBonus,stage.awarenessBonus);
    const state=atHp(75);
    const intent=ai.decide({state,catalog:PREVIEW_CATALOG,actorId:"enemy",
      targetId:"hero",distanceMeters:3,tick:1000,
      attackAllowlist:stage.attackAllowlist});
    return {intent,ai};
  }
  it("scores only stage-authorized attacks without changing core legal moves",()=>{
    const original=getLegalAttackMoves(atHp(75),PREVIEW_CATALOG,"hero",3);
    expect(original).toContain("rakshasa_deceiver");
    for(const stage of RAKSHASA_PHASES){
      const {intent,ai}=decide(stage);
      const scored=ai.trace!.scores.filter(s=>s.intent.kind==="attack");
      expect(scored.length).toBeGreaterThan(0);
      expect(scored.every(s=>s.intent.kind==="attack"&&
        stage.attackAllowlist.includes(s.intent.moveId))).toBe(true);
      if(intent.kind==="attack")expect(stage.attackAllowlist).toContain(intent.moveId);
    }
    expect(decide(RAKSHASA_PHASES[2]).ai.trace!.scores).toEqual(
      decide(RAKSHASA_PHASES[2]).ai.trace!.scores);
  });
  it("retains learned defensive habits as the boss changes fighting styles",()=>{
    const brain=new EnemyCombatBrain(ENEMY_PROFILES.capable,119);
    for(let i=0;i<4;i++)brain.observeDefense("hero","dodge");
    const history=brain.observedDefenseHistory;
    brain.setBattleStage("trickster",.07,.05);
    brain.setBattleStage("brute",.17,.12);
    expect(brain.observedDefenseHistory).toEqual(history);
    expect(()=>brain.setBattleStage("brute",1,.12)).toThrow();
    brain.reset();
    expect(brain.observedDefenseHistory).toBeNull();
  });
});
