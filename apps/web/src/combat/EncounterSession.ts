import {
  endTurn, equipCombatant, getLegalAttackMoves, getLegalReactions,
  gradeReactionV2, queueAttack, resolveReaction,
  type CombatCatalog, type EncounterState, type ReactionOption,
  type ReactionResolution, type ReactionTechnique,
} from "@trilok/combat";
import { createPreviewEncounter, PREVIEW_CATALOG } from "./preview-encounter";

export interface CapturedDefense {
  readonly moveId: string;
  readonly tick: number;
}
export type DefenseCaptureResult =
  | { readonly accepted: true; readonly option: ReactionOption }
  | { readonly accepted: false; readonly reason: "unavailable" | "too_early" | "too_late" | "already_selected" };

/**
 * Browser-agnostic encounter controller. One immutable domain state, no
 * separate browser HP/Energy/turn arithmetic or gameplay logic in Three.js.
 * Enemy policy will call these same public methods in v0.4-B1.
 */
export class EncounterSession {
  state: EncounterState;
  private selectedDefense: CapturedDefense | null = null;
  readonly catalog: CombatCatalog;

  constructor(
    catalog: CombatCatalog = PREVIEW_CATALOG,
    create: () => EncounterState = createPreviewEncounter,
  ) {
    this.catalog = catalog;
    this.factory = create;
    this.state = create();
  }
  private readonly factory: () => EncounterState;

  reset(): void {
    this.selectedDefense = null;
    this.state = this.factory();
  }

  get activeDefense(): CapturedDefense | null { return this.selectedDefense; }

  legalAttacks(targetId: string, distanceMeters: number): readonly string[] {
    return getLegalAttackMoves(this.state, this.catalog, targetId, distanceMeters);
  }

  legalReactions(): readonly ReactionOption[] {
    return getLegalReactions(this.state, this.catalog);
  }

  equip(actorId: string, weaponId: string): void {
    this.state = equipCombatant(this.state, actorId, weaponId, this.catalog);
  }

  end(actorId: string): void {
    this.state = endTurn(this.state, actorId);
  }

  attack(attackerId: string, defenderId: string, moveId: string,
    distanceMeters: number, nowMs: number): void {
    this.selectedDefense = null;
    this.state = queueAttack(this.state, {
      attackerId, defenderId, moveId,
      distanceAtStartMeters: distanceMeters,
      startedTick: Math.floor(nowMs),
      // Explicit free aim/armor raycasts are introduced in v0.4-C.
      intendedRegionId: null,
    }, this.catalog);
  }

  /** The UI chooses an action, not a reaction grade. The domain grades it. */
  captureDefense(technique: ReactionTechnique, nowMs: number): DefenseCaptureResult {
    const pending = this.state.pending;
    if (!pending || this.state.phase !== "reaction" || pending.defenderId !== "hero") {
      return { accepted: false, reason: "unavailable" };
    }
    if (this.selectedDefense) return { accepted: false, reason: "already_selected" };
    const option = this.legalReactions().find(item => item.technique === technique);
    if (!option) return { accepted: false, reason: "unavailable" };
    const tick = Math.floor(nowMs);
    const offset = tick - pending.impactTick;
    if (tick < pending.startedTick || offset < -option.timing.earlyTicks) {
      return { accepted: false, reason: "too_early" };
    }
    if (offset > option.timing.lateTicks || gradeReactionV2(offset, option.timing) === "miss") {
      return { accepted: false, reason: "too_late" };
    }
    this.selectedDefense = { moveId: option.moveId, tick };
    return { accepted: true, option };
  }

  /**
   * Player defenses wait until contact for pre-impact inputs, and allow late
   * inputs before the authored grace closes. Enemy is scripted to take hits.
   * Caller may be behind several render frames; a late call still resolves once.
   */
  resolveIfReady(nowMs: number, distanceAtImpactMeters: number): ReactionResolution | null {
    const pending = this.state.pending;
    if (!pending) return null;
    const tick = Math.floor(nowMs);
    if (tick < pending.impactTick) return null;
    if (pending.defenderId === "hero" && !this.selectedDefense) {
      const options = this.legalReactions();
      const latest = Math.max(0, ...options.map(item => item.timing.lateTicks));
      if (tick < pending.impactTick + latest) return null;
    }
    const result = resolveReaction(this.state, {
      defenderId: pending.defenderId,
      hitId: pending.hits[pending.hitIndex]!.id,
      defenseMoveId: this.selectedDefense?.moveId ?? null,
      reactionTick: this.selectedDefense?.tick ?? null,
      resolvedTick: tick,
      distanceAtImpactMeters,
      // A normal actor-targeted shot hits the default torso region; precise
      // raycast region/hit validation will be supplied by the v0.4-C adapter.
    }, this.catalog);
    this.state = result.state;
    this.selectedDefense = null;
    return result;
  }
}
