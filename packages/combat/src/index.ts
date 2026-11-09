/**
 * Deterministic, immutable combat rules.
 * Deliberately unaware of Three.js, browser APIs, animation and wall clocks.
 */
export type BattlePhase = "player_turn" | "enemy_windup" | "victory" | "defeat";
export type ReactionGrade = "perfect" | "parry" | "guard" | "miss";

export interface Actor {
  readonly name: string;
  readonly hp: number;
  readonly maxHp: number;
}

export interface BattleState {
  readonly phase: BattlePhase;
  readonly round: number;
  readonly hero: Actor;
  readonly enemy: Actor;
  readonly message: string;
}

const HERO_DAMAGE = 18;
const ENEMY_DAMAGE = 14;

export function beginBattle(): BattleState {
  return {
    phase: "player_turn",
    round: 1,
    hero: { name: "Hero (placeholder)", hp: 100, maxHp: 100 },
    enemy: { name: "Enemy (placeholder)", hp: 72, maxHp: 72 },
    message: "Choose an attack. React to the enemy's counterattack.",
  };
}

export function strike(state: BattleState): BattleState {
  if (state.phase !== "player_turn") {
    throw new Error("Cannot strike outside the player's turn.");
  }

  const hp = Math.max(0, state.enemy.hp - HERO_DAMAGE);
  return {
    ...state,
    enemy: { ...state.enemy, hp },
    phase: hp === 0 ? "victory" : "enemy_windup",
    message: hp === 0
      ? "Victory! Encounter complete."
      : "You struck for 18. The enemy is winding up — prepare to react!",
  };
}

/** Offset is input timestamp minus intended impact timestamp, in milliseconds. */
export function gradeReaction(offsetMs: number | null): ReactionGrade {
  if (offsetMs === null || !Number.isFinite(offsetMs)) return "miss";
  const error = Math.abs(offsetMs);
  if (error <= 90) return "perfect";
  if (error <= 200) return "parry";
  if (error <= 380) return "guard";
  return "miss";
}

export function resolveEnemyTurn(
  state: BattleState,
  grade: ReactionGrade,
): BattleState {
  if (state.phase !== "enemy_windup") {
    throw new Error("No enemy action is pending.");
  }

  const damage: Record<ReactionGrade, number> = {
    perfect: 0,
    parry: 2,
    guard: 8,
    miss: ENEMY_DAMAGE,
  };

  const hp = Math.max(0, state.hero.hp - damage[grade]);
  const label: Record<ReactionGrade, string> = {
    perfect: "Perfect parry!",
    parry: "Parried!",
    guard: "Guarded.",
    miss: "Missed reaction.",
  };

  return {
    ...state,
    hero: { ...state.hero, hp },
    round: state.round + 1,
    phase: hp === 0 ? "defeat" : "player_turn",
    message: hp === 0
      ? "Defeat. Restart to try again."
      : label[grade] + " Took " + damage[grade] + " damage.",
  };
}
