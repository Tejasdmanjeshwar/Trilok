/**
 * Lightweight, deterministic HFSM + Utility combat policy.
 *
 * SRP: this package chooses intents only. It never edits HP, resources,
 * cooldowns, combat phases or reaction outcomes. The core is authoritative.
 */
import {
  getLegalAttackMoves, getLegalEquipmentSwitches, getLegalReactions,
  type CombatCatalog, type EncounterActor, type EncounterState,
  type ReactionOption, type ReactionTechnique,
} from "@trilok/combat";

export type Tactic = "observe" | "decide" | "commit" | "react" | "recover" | "defeated";
export type TacticalParent = "outside" | "engaged" | "terminal";
export type TacticalBranch = "offense" | "defense" | "recovery" | null;
export interface TacticalPath {
  readonly parent: TacticalParent;
  readonly branch: TacticalBranch;
  readonly leaf: Tactic;
}
/** A small explicit hierarchy, not a costly general-purpose planner. */
function tacticalPath(leaf: Tactic): TacticalPath {
  switch (leaf) {
    case "decide":
    case "commit": return { parent: "engaged", branch: "offense", leaf };
    case "react": return { parent: "engaged", branch: "defense", leaf };
    case "recover": return { parent: "engaged", branch: "recovery", leaf };
    case "defeated": return { parent: "terminal", branch: null, leaf };
    case "observe": return { parent: "outside", branch: null, leaf };
  }
}
export type CombatIntent =
  | { readonly kind: "attack"; readonly moveId: string }
  | { readonly kind: "equip"; readonly equipmentId: string }
  | { readonly kind: "end_turn" };
export interface DefenseIntent {
  readonly moveId: string;
  readonly technique: ReactionTechnique;
  readonly atTick: number;
}
export type FightingStyle = "duelist" | "trickster" | "brute";
export interface AIProfile {
  /** Distinct authored move choices, regardless of combat tier. */
  readonly fightingStyle?: FightingStyle;
  readonly id: string;
  /** Probability of noticing and attempting a legal defense, 0..1. */
  readonly awareness: number;
  /** Min delay from first telegraph (ms/ticks). */
  readonly perceptionDelayTicks: number;
  /** Maximum magnitude of seeded reaction-timing error. */
  readonly timingErrorTicks: number;
  /** Preferred risk-taking; greater values favor aggressive actions. */
  readonly aggression: number;
  /** How much to protect future Energy for defense or key moves. */
  readonly conservation: number;
  readonly switchingPreference: number;
  readonly defensePreference: number;
  /** Select non-greedy legal candidates by temperature/noise. */
  readonly decisionNoise: number;
  readonly minThinkTicks: number;
  readonly intelligence?: number;
}
export const ENEMY_PROFILES = {
  novice: {
    id: "novice", fightingStyle:"brute", awareness: .43, perceptionDelayTicks: 330,
    timingErrorTicks: 160, aggression: .48, conservation: .68,
    switchingPreference: .35, defensePreference: .42,
    decisionNoise: .28, minThinkTicks: 340, intelligence: .2,
  },
  capable: {
    id: "capable", fightingStyle:"duelist", awareness: .70, perceptionDelayTicks: 250,
    timingErrorTicks: 105, aggression: .62, conservation: .48,
    switchingPreference: .60, defensePreference: .66,
    decisionNoise: .15, minThinkTicks: 270, intelligence: .6,
  },
  elite: {
    id: "elite", fightingStyle:"trickster", awareness: .83, perceptionDelayTicks: 190,
    timingErrorTicks: 70, aggression: .73, conservation: .37,
    switchingPreference: .76, defensePreference: .78,
    decisionNoise: .09, minThinkTicks: 230, intelligence: .95,
  },
} satisfies Record<string, AIProfile>;

export interface AIDecisionContext {
  readonly state: EncounterState;
  readonly catalog: CombatCatalog;
  readonly actorId: string;
  readonly targetId: string;
  readonly distanceMeters: number;
  readonly tick: number;
}

export interface ActionScore {
  readonly intent: CombatIntent;
  readonly score: number;
  readonly detail: string;
}
export interface DecisionTrace {
  readonly turn: number;
  readonly tactic: Tactic;
  readonly scores: readonly ActionScore[];
  readonly selected: CombatIntent;
}

function validateProfile(profile: AIProfile): void {
  if(profile.fightingStyle && !["duelist","trickster","brute"].includes(profile.fightingStyle))
    throw new Error("Unknown AI fighting style.");
  if (profile.intelligence !== undefined && (!Number.isFinite(profile.intelligence) || profile.intelligence < 0 || profile.intelligence > 1)) throw new Error("Invalid AI intelligence.");
  for (const property of ["awareness", "aggression", "conservation", "switchingPreference", "defensePreference", "decisionNoise"] as const) {
    if (!Number.isFinite(profile[property]) || profile[property] < 0 || profile[property] > 1) {
      throw new Error("Invalid AI profile probability: " + property);
    }
  }
  for (const property of ["perceptionDelayTicks", "timingErrorTicks", "minThinkTicks"] as const) {
    if (!Number.isSafeInteger(profile[property]) || profile[property] < 0 || profile[property] > 5000) {
      throw new Error("Invalid AI timing: " + property);
    }
  }
}

/** Fast, nonzero xorshift32 PRNG; no browser RNG or wall-clock access. */
export class SeededRandom {
  private state: number;
  constructor(seed: number) {
    if (!Number.isSafeInteger(seed)) throw new Error("AI seed must be a safe integer.");
    this.state = (seed | 0) || 0x6d2b79f5;
  }
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x;
    return (x >>> 0) / 0x100000000;
  }
}

function clamp(v: number, a = 0, b = 1): number { return Math.min(b, Math.max(a, v)); }
/** Pure threat recognition model; profiles supply skill, memory supplies pattern frequency. */
export function threatRecognition(profile: AIProfile, repeatCount: number, weakPoint: boolean): number {
  const intelligence = profile.intelligence ?? profile.awareness;
  return clamp(profile.awareness + Math.max(0, Math.min(5, repeatCount)) * .10 * intelligence +
    (weakPoint ? .16 * intelligence : 0));
}
function equipmentClass(catalog: CombatCatalog, id: string): "ranged" | "melee" {
  const moves = catalog.equipment[id]?.attackMoveIds ?? [];
  const ranged = moves.filter(move => catalog.attacks[move]?.delivery === "ranged_projectile").length;
  return ranged > moves.length / 2 ? "ranged" : "melee";
}
function averageExpectedDamage(actor: EncounterActor, catalog: CombatCatalog, weaponId: string): number {
  const moves = catalog.equipment[weaponId]?.attackMoveIds ?? [];
  const attackValues = moves.flatMap(id => {
    const move = catalog.attacks[id];
    return move && move.resourceCost <= actor.resource ? [move] : [];
  });
  if (!attackValues.length) return 0;
  return Math.max(...attackValues.map(move =>
    (move.damage + (move.turnPolicy?.energyGainOnCompletion ?? 0) * 2) /
    Math.max(1, move.resourceCost + 1)));
}

/**
 * HFSM is event-driven and owns commitments, not combat legality.
 * The only policy decisions take place in decide/react modes.
 */
export class EnemyCombatBrain {
  private readonly random: SeededRandom;
  private tactic: Tactic = "observe";
  private currentPath: TacticalPath = tacticalPath("observe");
  private transition(leaf: Tactic): void {
    if (this.currentPath.parent === "terminal" && leaf !== "observe" && leaf !== "defeated") {
      throw new Error("Defeated AI must be reset before re-entering combat.");
    }
    this.tactic = leaf;
    this.currentPath = tacticalPath(leaf);
  }
  private recentMove: string | null = null;
  private readonly observedDefenses=new Map<string,{parry:number;dodge:number;ignored:number}>();
  /** Count only resolved player reactions, never predictions or telegraphs. */
  observeDefense(defenderId:string,technique:ReactionTechnique|null):void {
    const previous=this.observedDefenses.get(defenderId)??{parry:0,dodge:0,ignored:0};
    const next={...previous};
    if(technique==="weapon_deflect"||technique==="projectile_intercept")next.parry++;
    else if(technique==="dodge")next.dodge++;
    else next.ignored++;
    const total=next.parry+next.dodge+next.ignored;
    if(total>8){
      next.parry=Math.floor(next.parry*6/total);
      next.dodge=Math.floor(next.dodge*6/total);
      next.ignored=Math.floor(next.ignored*6/total);
    }
    this.observedDefenses.set(defenderId,next);
  }
  get observedDefenseHistory():Readonly<{parry:number;dodge:number;ignored:number}>|null {
    const item=this.observedDefenses.get("hero");
    return item?{...item}:null;
  }
  private readonly observedTargets = new Map<string,{region:string;streak:number}>();
  private switchTurn = -1;
  private reactionToken: string | null = null;
  private plannedReaction: DefenseIntent | null = null;
  private _trace: DecisionTrace | null = null;
  constructor(readonly profile: AIProfile = ENEMY_PROFILES.capable, seed = 119) {
    validateProfile(profile);
    this.random = new SeededRandom(seed);
  }
  get state(): Tactic { return this.tactic; }
  get path(): TacticalPath { return this.currentPath; }
  get trace(): DecisionTrace | null { return this._trace; }
  reset(): void {
    // Callers replace the brain to replay the exact RNG sequence.
    this.transition("observe");
    this.recentMove = null;
    this.observedTargets.clear();
    this.observedDefenses.clear();
    this.switchTurn = -1;
    this.reactionToken = null;
    this.plannedReaction = null;
    this._trace = null;
  }
  observeAttack(attackerId: string, regionId: string | null): void {
    if (!regionId) { this.observedTargets.delete(attackerId); return; }
    const previous = this.observedTargets.get(attackerId);
    this.observedTargets.set(attackerId, {region:regionId,
      streak:previous?.region===regionId ? Math.min(6,previous.streak+1) : 1});
  }
  selectTargetRegion(state:EncounterState,catalog:CombatCatalog,targetId:string,moveId:string):string|null {
    const target=state.actors[targetId], move=catalog.attacks[moveId];
    const anatomy=target?.anatomyId ? catalog.anatomies?.[target.anatomyId] : undefined;
    if(!target||!move||!anatomy||move.targeting?.mode!=="free_aim")return null;
    const intelligence=this.profile.intelligence ?? this.profile.awareness;
    const scored=Object.values(anatomy.regions)
      .filter(region=>target.regionExposure?.[region.id]!=="hidden")
      .map(region=>{
        const protectedSpot=target.regionExposure?.[region.id]==="protected";
        const armor=(target.equippedArmorIds??[]).reduce((value,id)=>{
          const cover=catalog.armor?.[id]?.coverage.find(item=>item.regionId===region.id);
          return value*(1-Math.min(1,(cover?.protection??0)*
            (cover?.damageTypeModifiers?.[move.damageType??"blunt"]??1)));
        },1);
        return {id:region.id, score:(protectedSpot?1:region.vulnerabilityMultiplier)*armor+
          (region.criticalEligible&&!protectedSpot?.12*intelligence:0)};
      }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
    if(!scored.length)return null;
    return this.random.next()<intelligence || target.regionExposure?.[anatomy.defaultRegionId]==="hidden"
      ?scored[0]!.id:anatomy.defaultRegionId;
  }
  markCommitted(): void { this.transition("commit"); }
  markRecovering(): void { this.transition("recover"); }
  onEncounter(state: EncounterState, actorId: string): void {
    if (state.actors[actorId]?.hp === 0 || state.phase === "complete") {
      this.transition("defeated");
    } else if (state.pending?.defenderId === actorId) {
      this.transition("react");
    } else if (state.pending?.attackerId === actorId) {
      this.transition("commit");
    } else if (state.phase === "decision" && state.activeActorId === actorId) {
      this.transition("decide");
    } else {
      this.transition("observe");
    }
  }

  /** Score legal domain actions; never fabricate a move or bypass Energy. */
  decide(ctx: AIDecisionContext): CombatIntent {
    const { state, catalog, actorId, targetId, distanceMeters, tick } = ctx;
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0 ||
        !Number.isSafeInteger(tick) || tick < 0) throw new Error("Invalid AI decision context.");
    this.onEncounter(state, actorId);
    const actor = state.actors[actorId];
    const target = state.actors[targetId];
    if (!actor || !target || this.tactic !== "decide" ||
        state.activeActorId !== actorId) {
      throw new Error("AI cannot decide outside its own decision phase.");
    }
    const candidates: ActionScore[] = [];
    const normalizedEnergy = actor.resource / Math.max(1, actor.maxResource);
    const targetFraction = target.hp / Math.max(1, target.maxHp);
    const remaining = state.rules.maxActionsPerTurn - state.turnBudget.actionsUsed;
    const available = getLegalAttackMoves(state, catalog, targetId, distanceMeters);
    for (const moveId of available) {
      const move = catalog.attacks[moveId]!;
      const recovery = move.turnPolicy?.energyGainOnCompletion ?? 0;
      const maxReach = move.reachMeters;
      const isMelee = move.delivery === "melee_contact";
      const viable = isMelee ? clamp((move.engageRangeMeters - distanceMeters) /
        Math.max(1, move.engageRangeMeters - maxReach)) : 1;
      const expected = move.damage / Math.max(1, target.hp);
      const costPenalty = move.resourceCost / Math.max(1, actor.maxResource);
      const ending = move.turnPolicy?.continuation !== "continue";
      let score = .34 + this.profile.aggression * .23 +
        clamp(expected * 1.8, 0, .5) +
        (isMelee ? .12 * viable : distanceMeters >= 4 ? .14 : -.07);
      // Distant melee attacks require a conspicuous approach. Switching to
      // ranged equipment can be safer and more effective at this distance.
      if (isMelee) score -= clamp((distanceMeters - maxReach) / 12) * .48;
      score -= costPenalty * this.profile.conservation * .55;
      score -= ending && remaining > 1 ? .10 : 0;
      score -= this.recentMove === moveId ? .15 : 0;
      if(move.turnPolicy?.freeAction)score+=.7;
      if(move.pattern){
        const style=this.profile.fightingStyle??"duelist";
        const affinity={
          duelist:{flurry:.24,feint:.025,delayed:-.045},
          trickster:{flurry:.08,feint:.26,delayed:.07},
          brute:{flurry:-.02,feint:-.10,delayed:.28},
        } as const;
        score+=affinity[style][move.pattern.kind];
        // A wounded enemy becomes less predictable and more willing to commit.
        if(actor.hp/actor.maxHp<.45)
          score+=(move.pattern.kind==="delayed"?.14:.07)*this.profile.aggression;
        const history=this.observedDefenses.get(targetId);
        const total=history ? history.parry+history.dodge+history.ignored : 0;
        const confidence=(this.profile.intelligence??this.profile.awareness)*Math.min(1,total/4);
        if(history&&total>0){
          const ratio=move.pattern.kind==="feint" ? history.parry/total
            :move.pattern.kind==="delayed" ? history.dodge/total
            :history.ignored/total;
          score+=confidence*ratio*.20;
        }
      }
      if (targetFraction < .25 && move.damage >= target.hp) score += .27;
      if (recovery > 0) {
        const missing = (actor.maxResource - actor.resource) / Math.max(1, actor.maxResource);
        score = .13 + missing * .82 + (normalizedEnergy < .2 ? .2 : 0) -
          (targetFraction < .25 ? .14 : 0);
      }
      candidates.push({ intent: { kind: "attack", moveId }, score, detail: recovery ? "recovery" : "attack" });
    }
    if (this.switchTurn !== state.turn) {
      const alternatives = getLegalEquipmentSwitches(state, catalog, actorId);
      for (const equipmentId of alternatives) {
        const next = catalog.equipment[equipmentId]!;
        const currentClass = equipmentClass(catalog, actor.equippedId);
        const nextClass = equipmentClass(catalog, equipmentId);
        const appropriate = distanceMeters > 5 ? "ranged" : "melee";
        const match = nextClass === appropriate ? .44 : -.26;
        const difference = averageExpectedDamage(actor, catalog, equipmentId) -
          averageExpectedDamage(actor, catalog, actor.equippedId);
        const afterCost = actor.resource;
        const canAttack = next.attackMoveIds.some(id => {
          const move = catalog.attacks[id]!;
          return move.resourceCost <= afterCost && move.engageRangeMeters >= distanceMeters;
        });
        const score = .26 + match * this.profile.switchingPreference +
          clamp(difference * .03, -.20, .20) +
          (currentClass === nextClass ? -.12 : .07) -
          (afterCost < 2 ? .19 : 0) -
          (canAttack ? 0 : .32);
        candidates.push({ intent: { kind: "equip", equipmentId }, score, detail: "weapon compatibility" });
      }
    }
    const endScore = available.length ? .05 + (normalizedEnergy < .16 ? .08 : 0) :
      .33 + (normalizedEnergy > .4 ? -.18 : .05);
    candidates.push({ intent: { kind: "end_turn" }, score: endScore, detail: "conserve Energy" });
    // Bounded candidate enumeration and reproducible noise. No frame-loop planning.
    if (candidates.length > 32) throw new Error("AI action budget exceeded.");
    const ranked = candidates.map(c => ({
      ...c, score: c.score + (this.random.next() - .5) * this.profile.decisionNoise,
    })).sort((a,b) => b.score - a.score);
    const selected = ranked[0]!.intent;
    if (selected.kind === "attack") this.recentMove = selected.moveId;
    if (selected.kind === "equip") this.switchTurn = state.turn;
    this._trace = { turn: state.turn, tactic: this.tactic, scores: ranked, selected };
    this.transition(selected.kind === "end_turn" ? "recover" : "commit");
    return selected;
  }

  /**
   * A single attempt per pending hit. Uses only domain-authorized reactions,
   * bounded perception and seeded imprecision; can intentionally do nothing.
   * It never modifies hit results or widens reaction windows.
   */
  planReaction(state: EncounterState, catalog: CombatCatalog, defenderId: string,
    nowTick: number): DefenseIntent | null {
    if (!Number.isSafeInteger(nowTick) || nowTick < 0) throw new Error("Invalid perception tick.");
    const pending = state.pending;
    if (!pending || pending.defenderId !== defenderId) return null;
    const hit = pending.hits[pending.hitIndex]!;
    const token = pending.attackerId + "|" + pending.startedTick + "|" + pending.moveId +
      "|" + pending.hitIndex + "|" + hit.id;
    if (this.reactionToken === token) return this.plannedReaction;
    this.reactionToken = token;
    this.plannedReaction = null;
    this.onEncounter(state, defenderId);
    const available = getLegalReactions(state, catalog);
    const memory=this.observedTargets.get(pending.attackerId);
    const repeated=pending.intendedRegionId && memory?.region===pending.intendedRegionId ? memory.streak : 0;
    const anatomyId=state.actors[defenderId]?.anatomyId;
    const vulnerable=pending.intendedRegionId&&anatomyId
      ?catalog.anatomies?.[anatomyId]?.regions[pending.intendedRegionId] : undefined;
    const weakThreat=!!vulnerable && vulnerable.vulnerabilityMultiplier>1 &&
      state.actors[defenderId]?.regionExposure?.[pending.intendedRegionId!]!=="protected";
    const intelligence=this.profile.intelligence??this.profile.awareness;
    const awareness=threatRecognition(this.profile,repeated,weakThreat);
    if (!available.length || this.random.next() >= awareness) return null;
    const actor = state.actors[defenderId]!;
    const weighted = available.map(option => {
      const outcome = catalog.outcomes[option.outcomeProfileId]!;
      const remaining = actor.resource - option.resourceCost;
      let score = (1 - outcome.good) * .55 +
        (option.technique === "dodge" ? .13 : this.profile.defensePreference * .34);
      score -= remaining < 1 ? this.profile.conservation * .23 : 0;
      score -= option.resourceCost / Math.max(1,actor.maxResource) * .19;
      score += (weakThreat ? .18*intelligence : 0) + repeated*.05*intelligence;
      score += (this.random.next() - .5) * this.profile.decisionNoise;
      return { option, score };
    }).sort((a,b) => b.score - a.score);
    const choice = weighted[0]!.option;
    // The action is triggered after perceiving the attack, with uncertainty
    // that sometimes places the input outside its legal graded window.
    const timingError = Math.round((this.random.next() * 2 - 1) * this.profile.timingErrorTicks *
      (1-Math.min(.6,repeated*.12*intelligence+(weakThreat?.12*intelligence:0))));
    const targetTick = choice.targetTick + timingError;
    const perceivedAt = Math.max(nowTick, pending.startedTick + this.profile.perceptionDelayTicks);
    if (targetTick < perceivedAt || targetTick > choice.targetTick + choice.timing.lateTicks ||
        targetTick < choice.targetTick - choice.timing.earlyTicks ||
        targetTick > choice.clashTick) return null;
    this.plannedReaction = { moveId: choice.moveId, technique: choice.technique, atTick: targetTick };
    return this.plannedReaction;
  }
}
