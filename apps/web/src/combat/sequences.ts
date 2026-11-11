import type { Sequence } from "@trilok/choreography";

export type CombatCue =
  | "camera_draw" | "bow_release" | "arrow_hit"
  | "melee_draw" | "melee_impact" | "melee_recover"
  | "camera_defense" | "enemy_swing" | "enemy_impact"
  | "reaction_close" | "camera_recover"
  | "counter_release" | "counter_impact";

/** Authored events are independent of frame count or actual asset format. */
export const ARCHERY_ATTACK: Sequence<CombatCue> = {
  id: "archer_precision_shot", durationMs: 1500,
  cues: [
    { id: "draw", atMs: 0, type: "camera_draw" },
    { id: "release", atMs: 715, type: "bow_release" },
    { id: "impact", atMs: 1150, type: "arrow_hit" },
  ],
};

export const MELEE_ATTACK: Sequence<CombatCue> = {
  id: "warrior_melee_lunge", durationMs: 2350,
  cues: [
    { id: "approach", atMs: 0, type: "melee_draw" },
    { id: "strike", atMs: 1450, type: "melee_impact" },
    { id: "return", atMs: 1650, type: "melee_recover" },
  ],
};

/** Heavy move uses its own 1850ms hit marker from the core catalog. */
export const HEAVY_ATTACK: Sequence<CombatCue> = {
  id: "hero_heavy_crush", durationMs: 2750,
  cues: [
    { id: "heavy-approach", atMs: 0, type: "melee_draw" },
    { id: "heavy-impact", atMs: 1850, type: "melee_impact" },
    { id: "heavy-retreat", atMs: 2060, type: "melee_recover" },
  ],
};

export const ENEMY_STRIKE: Sequence<CombatCue> = {
  id: "rakshasa_overhead_strike", durationMs: 2180,
  cues: [
    { id: "defense", atMs: 0, type: "camera_defense" },
    { id: "swing", atMs: 1210, type: "enemy_swing" },
    { id: "impact", atMs: 1850, type: "enemy_impact" },
    { id: "close", atMs: 2130, type: "reaction_close" },
  ],
};

export const ARCHERY_REACTION: Sequence<CombatCue> = {
  id: "defense_recovery", durationMs: 730,
  cues: [{ id: "camera-recover", atMs: 250, type: "camera_recover" }],
};

/** Automatic retaliation begins only after the defended hit resolves perfectly. */
export const BOW_INTERCEPT_COUNTER: Sequence<CombatCue> = {
  id: "counter_arrow_after_interception", durationMs: 1080,
  cues: [
    { id: "counter-arrow", atMs: 300, type: "counter_release" },
    { id: "counter-hit", atMs: 710, type: "counter_impact" },
  ],
};
export const SWORD_RIPOSTE_COUNTER: Sequence<CombatCue> = {
  id: "counter_strong_sword_riposte", durationMs: 950,
  cues: [{ id: "counter-hit", atMs: 560, type: "counter_impact" }],
};
