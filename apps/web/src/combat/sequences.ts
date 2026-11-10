import type { Sequence } from "@trilok/choreography";

/** Markers authored alongside the motion clips (milliseconds, fixed choreography). */
export type CombatCue =
  | "camera_draw" | "bow_release" | "arrow_hit"
  | "camera_defense" | "enemy_swing" | "enemy_impact"
  | "reaction_close" | "camera_recover";

export const ARCHERY_ATTACK: Sequence<CombatCue> = {
  id: "archer_precision_shot",
  durationMs: 1500,
  cues: [
    { id: "draw-shot", atMs: 0, type: "camera_draw" },
    { id: "release", atMs: 715, type: "bow_release" },
    { id: "arrow-impact", atMs: 1150, type: "arrow_hit" },
  ],
};

export const ENEMY_STRIKE: Sequence<CombatCue> = {
  id: "rakshasa_overhead_strike",
  durationMs: 2180,
  cues: [
    { id: "defense-shot", atMs: 0, type: "camera_defense" },
    { id: "sword-commit", atMs: 1210, type: "enemy_swing" },
    { id: "strike-impact", atMs: 1850, type: "enemy_impact" },
    { id: "close-reaction", atMs: 2130, type: "reaction_close" },
  ],
};

export const ARCHERY_REACTION: Sequence<CombatCue> = {
  id: "parry_recovery",
  durationMs: 730,
  cues: [
    { id: "recover-shot", atMs: 250, type: "camera_recover" },
  ],
};
