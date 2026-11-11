import type { EncounterState } from "@trilok/combat";
import type { FightingStyle } from "@trilok/combat-ai";

export type BossPhaseId = 1 | 2 | 3;
export interface BossPhase {
  readonly id:BossPhaseId;
  readonly roman:string;
  readonly name:string;
  readonly subtitle:string;
  /** Crossing health fraction unlocks the NEXT phase at a safe decision. */
  readonly enterAtOrBelow:number;
  readonly fightingStyle:FightingStyle;
  readonly aggressionBonus:number;
  readonly awarenessBonus:number;
  readonly attackAllowlist:readonly string[];
}

/** No health/energy grants. These are AI preferences and readable tells only. */
export const RAKSHASA_PHASES:readonly BossPhase[]=[
  Object.freeze({
    id:1,roman:"I",name:"SENTINEL",subtitle:"The shrine's guardian studies your rhythm",
    enterAtOrBelow:1,fightingStyle:"duelist" as const,
    aggressionBonus:0,awarenessBonus:0,
    attackAllowlist:Object.freeze(["rakshasa_rapid_slash","rakshasa_quick_slash",
      "overhead_slash","rakshasa_arrow","rakshasa_recover"]),
  }),
  Object.freeze({
    id:2,roman:"II",name:"VEIL OF DECEIT",subtitle:"False swings conceal the true strike",
    enterAtOrBelow:.65,fightingStyle:"trickster" as const,
    aggressionBonus:.07,awarenessBonus:.05,
    attackAllowlist:Object.freeze(["rakshasa_rapid_slash","rakshasa_quick_slash",
      "rakshasa_deceiver","rakshasa_crosscut","rakshasa_arrow","rakshasa_recover"]),
  }),
  Object.freeze({
    id:3,roman:"III",name:"UNBOUND FURY",subtitle:"The guardian abandons restraint",
    enterAtOrBelow:.30,fightingStyle:"brute" as const,
    aggressionBonus:.17,awarenessBonus:.12,
    attackAllowlist:Object.freeze(["rakshasa_rapid_slash","rakshasa_crosscut",
      "rakshasa_delayed_heavy","rakshasa_heavy",
      "rakshasa_quick_slash","rakshasa_arrow","rakshasa_recover"]),
  }),
];

/**
 * Monotonic, deterministic encounter phase coordinator. Not a second combat
 * engine: never mutates core state, damage, energy, or reaction timing.
 * Transitions only at an enemy-owned, pending-free decision boundary.
 */
export class BossPhaseDirector {
  private index=0;
  constructor(
    private readonly bossId="enemy",
    readonly phases:readonly BossPhase[]=RAKSHASA_PHASES,
  ){
    if(!bossId||phases.length<1||phases.length>5)throw new Error("Invalid boss phase configuration.");
    let previous=Infinity;
    const ids=new Set<number>();
    for(const [i,p] of phases.entries()){
      if(p.id!==i+1||ids.has(p.id)||!p.name||
          !Number.isFinite(p.enterAtOrBelow)||p.enterAtOrBelow<=0||
          p.enterAtOrBelow>=previous||
          !Number.isFinite(p.aggressionBonus)||p.aggressionBonus<0||p.aggressionBonus>.3||
          !Number.isFinite(p.awarenessBonus)||p.awarenessBonus<0||p.awarenessBonus>.3||
          !p.attackAllowlist.length||new Set(p.attackAllowlist).size!==p.attackAllowlist.length)
        throw new Error("Invalid boss phase configuration.");
      previous=p.enterAtOrBelow;
      ids.add(p.id);
    }
  }
  get current():BossPhase {return this.phases[this.index]!;}
  get next():BossPhase|null {return this.phases[this.index+1]??null;}
  get isFinal():boolean {return this.index===this.phases.length-1;}
  reset():void {this.index=0;}
  /**
   * Even if one critical strike crosses two thresholds, a living boss can
   * advance only one stage at each safe enemy decision, never skip a stage.
   * A dead boss never transitions or resurrects.
   */
  canAdvance(state:EncounterState):boolean {
    const next=this.next;
    const boss=state.actors[this.bossId];
    return !!next && !!boss && boss.hp>0 && boss.maxHp>0 &&
      boss.hp/boss.maxHp<=next.enterAtOrBelow &&
      state.phase==="decision" && state.activeActorId===this.bossId &&
      state.pending===null && state.pendingCounter===null &&
      state.pendingProjectile===null;
  }
  advance(state:EncounterState):BossPhase|null {
    if(!this.canAdvance(state))return null;
    this.index++;
    return this.current;
  }
}
