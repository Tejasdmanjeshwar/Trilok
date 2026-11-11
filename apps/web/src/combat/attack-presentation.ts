import type { AttackSpec } from "@trilok/combat";
import type { Motion } from "../actors/AnimatedWarrior";
import { MELEE_FEEL, type MeleeFeelProfile, type MeleeStyle } from "./MeleeFeel";
import type { Sequence } from "@trilok/choreography";
import {
  ARCHERY_ATTACK, RAPID_MELEE_ATTACK, MELEE_ATTACK, HEAVY_ATTACK,
  ENEMY_STRIKE, type CombatCue,
} from "./sequences";

export interface AttackPresentationPlan {
  readonly sequence: Sequence<CombatCue>;
  readonly motion: Motion;
  readonly feel: MeleeFeelProfile | null;
  /** Finish closing to melee reach before the authored impact marker. */
  readonly approachDurationMs: number;
}

const meleeOverrides: Readonly<Record<string, {
  sequence: Sequence<CombatCue>; motion: Motion; style: MeleeStyle;
}>> = {
  overhead_slash: { sequence: ENEMY_STRIKE, motion: "windup", style:"heavy" },
  heavy_crush: { sequence: HEAVY_ATTACK, motion: "heavy_melee", style:"heavy" },
  rakshasa_heavy: { sequence: HEAVY_ATTACK, motion: "heavy_melee", style:"heavy" },
};

/**
 * One choreography contract for both combatants. Never pair a rapid attack's
 * 720ms impact with a standard 1450ms animation or a 1050ms approach.
 * Every authored sequence must strike on the same tick as the domain move.
 */
export function presentationForAttack(move: AttackSpec): AttackPresentationPlan {
  const authored = meleeOverrides[move.id];
  const sequence = move.delivery === "ranged_projectile" ? ARCHERY_ATTACK
    : authored?.sequence ?? (move.turnPolicy?.freeAction ? RAPID_MELEE_ATTACK : MELEE_ATTACK);
  const motion: Motion = move.delivery === "ranged_projectile" ? "attack"
    : authored?.motion ?? (move.turnPolicy?.freeAction ? "rapid_melee" : "melee");
  const impact = sequence.cues.find(cue =>
    cue.type === "melee_impact" || cue.type === "enemy_impact" ||
    cue.type === "arrow_hit");
  if (impact?.atMs !== move.impactOffsetTicks) {
    throw new Error("Combat presentation must match authored impact tick: " + move.id);
  }
  const style: MeleeStyle = authored?.style ??
    (move.turnPolicy?.freeAction ? "rapid" : "standard");
  return {
    sequence, motion,
    feel:move.delivery === "melee_contact" ? MELEE_FEEL[style] : null,
    approachDurationMs: Math.max(100, Math.min(1100, move.impactOffsetTicks - 100)),
  };
}
