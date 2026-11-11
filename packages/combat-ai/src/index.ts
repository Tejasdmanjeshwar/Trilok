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
export interface AIProfile {
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
}
export const ENEMY_PROFILES = {
  novice: {
    id: "novice", awareness: .43, perceptionDelayTicks: 330,
    timingErrorTicks: 160, aggression: .48, conservation: .68,
    switchingPreference: .35, defensePreference: .42,
    decisionNoise: .28, minThinkTicks: 340,
  },
  capable: {
    id: "capable", awareness: .70, perceptionDelayTicks: 250,
    timingErrorTicks: 105, aggression: .62, conservation: .48,
    switchingPreference: .60, defensePreference: .66,
    decisionNoise: .15, minThinkTicks: 270,
  },
  elite: {
    id: "elite", awareness: .83, perceptionDelayTicks: 190,
    timingErrorTicks: 70, aggression: .73, conservation: .37,
    switchingPreference: .76, defensePreference: .78,
    decisionNoise: .09, minThinkTicks: 230,
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
    this.switchTurn = -1;
    this.reactionToken = null;
    this.plannedReaction = null;
    this._trace = null;
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
        const afterCost = actor.resource - next.switchCost;
        const canAttack = next.attackMoveIds.some(id => {
          const move = catalog.attacks[id]!;
          return move.resourceCost <= afterCost && move.engageRangeMeters >= distanceMeters;
        });
        const score = .12 + match * this.profile.switchingPreference +
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
    if (!available.length || this.random.next() >= this.profile.awareness) return null;
    const actor = state.actors[defenderId]!;
    const weighted = available.map(option => {
      const outcome = catalog.outcomes[option.outcomeProfileId]!;
      const remaining = actor.resource - option.resourceCost;
      let score = (1 - outcome.good) * .55 +
        (option.technique === "dodge" ? .13 : this.profile.defensePreference * .34);
      score -= remaining < 1 ? this.profile.conservation * .23 : 0;
      score -= option.resourceCost / Math.max(1,actor.maxResource) * .19;
      score += (this.random.next() - .5) * this.profile.decisionNoise;
      return { option, score };
    }).sort((a,b) => b.score - a.score);
    const choice = weighted[0]!.option;
    // The action is triggered after perceiving the attack, with uncertainty
    // that sometimes places the input outside its legal graded window.
    const timingError = Math.round((this.random.next() * 2 - 1) * this.profile.timingErrorTicks);
    const targetTick = pending.impactTick + timingError;
    const perceivedAt = Math.max(nowTick, pending.startedTick + this.profile.perceptionDelayTicks);
    if (targetTick < perceivedAt || targetTick > pending.impactTick + choice.timing.lateTicks ||
        targetTick < pending.impactTick - choice.timing.earlyTicks) return null;
    this.plannedReaction = { moveId: choice.moveId, technique: choice.technique, atTick: targetTick };
    return this.plannedReaction;
  }
}
