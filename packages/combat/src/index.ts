/**
 * Deterministic and renderer-independent combat domain.
 * Equipment defines attack reach and allowed defensive actions; it has no Three.js dependency.
 */
export type BattlePhase = "player_turn" | "enemy_windup" | "victory" | "defeat";
export type ReactionGrade = "perfect" | "parry" | "guard" | "miss";
export type DefenseAction = "parry" | "dodge";
export type WeaponClass = "melee" | "ranged";

export interface WeaponDefinition {
  readonly id: string;
  readonly label: string;
  readonly weaponClass: WeaponClass;
  readonly reachMeters: number;
  readonly damage: number;
  readonly enablesParry: boolean;
}

/** Add new weapons here without modifying the combat turn rules. */
export const WEAPONS = {
  bow: {
    id: "bow", label: "Longbow", weaponClass: "ranged",
    reachMeters: 36, damage: 18, enablesParry: false,
  },
  sword: {
    id: "sword", label: "Sword", weaponClass: "melee",
    reachMeters: 1.9, damage: 22, enablesParry: true,
  },
} as const satisfies Record<string, WeaponDefinition>;
export type WeaponId = keyof typeof WEAPONS;

export interface Actor {
  readonly name: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly weaponId: WeaponId;
}
export interface BattleState {
  readonly phase: BattlePhase;
  readonly round: number;
  readonly hero: Actor;
  readonly enemy: Actor;
  readonly message: string;
}

const ENEMY_DAMAGE = 14;

export function equippedWeapon(actor: Actor): WeaponDefinition {
  return WEAPONS[actor.weaponId];
}

export function availableDefenses(actor: Actor): readonly DefenseAction[] {
  return equippedWeapon(actor).enablesParry ? ["dodge", "parry"] : ["dodge"];
}

/** Equipment changes are restricted to decision time, preventing mid-telegraph exploits. */
export function equipWeapon(state: BattleState, weaponId: WeaponId): BattleState {
  if (state.phase !== "player_turn") throw new Error("Cannot change equipment during an attack.");
  if (!(weaponId in WEAPONS)) throw new Error("Unknown weapon.");
  return {
    ...state,
    hero: { ...state.hero, weaponId },
    message: "Equipped " + WEAPONS[weaponId].label + ". Choose an attack.",
  };
}

export function beginBattle(): BattleState {
  return {
    phase: "player_turn",
    round: 1,
    hero: { name: "Hero (placeholder)", hp: 100, maxHp: 100, weaponId: "bow" },
    enemy: { name: "Enemy (placeholder)", hp: 72, maxHp: 72, weaponId: "sword" },
    message: "Choose a weapon and attack. Dodge with a bow; parry with a melee weapon.",
  };
}

export function strike(state: BattleState, distanceMeters?: number): BattleState {
  if (state.phase !== "player_turn") {
    throw new Error("Cannot strike outside the player's turn.");
  }
  const weapon = equippedWeapon(state.hero);
  if (weapon.weaponClass === "melee" && distanceMeters === undefined) {
    throw new Error("Melee attacks require a target distance.");
  }
  if (distanceMeters !== undefined && (!Number.isFinite(distanceMeters) ||
      distanceMeters < 0 || distanceMeters > weapon.reachMeters + 0.0001)) {
    throw new Error("Target is outside equipped weapon reach.");
  }
  const damage = weapon.damage;
  const hp = Math.max(0, state.enemy.hp - damage);
  return {
    ...state,
    enemy: { ...state.enemy, hp },
    phase: hp === 0 ? "victory" : "enemy_windup",
    message: hp === 0
      ? "Victory! Encounter complete."
      : "You struck for " + damage + ". The enemy is closing in!",
  };
}

/** Signed milliseconds from the impact marker. */
export function gradeReaction(offsetMs: number | null): ReactionGrade {
  if (offsetMs === null || !Number.isFinite(offsetMs)) return "miss";
  const error = Math.abs(offsetMs);
  if (error <= 90) return "perfect";
  if (error <= 200) return "parry";
  if (error <= 380) return "guard";
  return "miss";
}

/**
 * A successful dodge avoids damage, while a glancing dodge can take some.
 * Parrying is only valid with a weapon that explicitly enables it.
 */
export function resolveEnemyTurn(
  state: BattleState,
  grade: ReactionGrade,
  defense: DefenseAction = "dodge",
): BattleState {
  if (state.phase !== "enemy_windup") throw new Error("No enemy action is pending.");
  if (!availableDefenses(state.hero).includes(defense)) {
    throw new Error("Equipped weapon cannot perform " + defense + ".");
  }

  const damage = defense === "dodge"
    ? { perfect: 0, parry: 0, guard: 5, miss: ENEMY_DAMAGE }
    : { perfect: 0, parry: 2, guard: 8, miss: ENEMY_DAMAGE };
  const label = defense === "dodge"
    ? { perfect: "Perfect dodge!", parry: "Dodged!", guard: "Glancing dodge.", miss: "Missed dodge." }
    : { perfect: "Perfect parry!", parry: "Parried!", guard: "Guarded.", miss: "Missed parry." };
  const hp = Math.max(0, state.hero.hp - damage[grade]);
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

/**
 * v0.4-A generic encounter API.
 * Existing one-on-one exports above are a temporary v0.3.x presentation adapter.
 * Migrate apps/web to this encounter API in v0.4-B, then remove legacy code.
 */
export * from "./encounter-types";
export * from "./encounter-catalog";
export * from "./encounter";
export * from "./encounter-economy";
export { resolveRegionDamage, validateActorTargets, validateTargetCatalog, resolveDefaultRegion } from "./encounter-damage";
export { resolveEffectiveTiming, gradeReactionWindow, validateTimingProfile, validateTimingAdjustments } from "./encounter-timing";
