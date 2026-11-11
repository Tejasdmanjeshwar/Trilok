import {
  endTurn, equipCombatant, getLegalAttackMoves, getLegalEquipmentSwitches,
  getLegalReactions, getInterceptionPlan, gradeReactionV2,
  queueAttack, resolveReaction, resolveCounter,
  resolveProjectileContinuation,
  type CombatCatalog, type EncounterState, type ReactionOption,
  type ReactionResolution, type ReactionTechnique, type CounterResolution,
  type ProjectileContinuationResolution,
  type ProjectileAttackGeometry, type InterceptionPlan,
} from "@trilok/combat";
import { createPreviewEncounter, PREVIEW_CATALOG } from "./preview-encounter";

export interface CapturedDefense {
  readonly moveId: string;
  readonly tick: number;
  readonly plan?: InterceptionPlan;
}
export type DefenseCaptureResult =
  | { readonly accepted: true; readonly option: ReactionOption }
  | { readonly accepted: false; readonly reason: "unavailable" | "too_early" | "too_late" | "already_selected" };

/**
 * Shared browser-agnostic encounter controller.
 * Both human and AI go through the same costs, legality and impact resolution.
 * No copies of HP/Energy math or damage rules live here.
 */
export class EncounterSession {
  state: EncounterState;
  private selectedDefense: CapturedDefense | null = null;
  readonly catalog: CombatCatalog;
  private readonly factory: () => EncounterState;
  constructor(
    catalog: CombatCatalog = PREVIEW_CATALOG,
    create: () => EncounterState = createPreviewEncounter,
  ) {
    this.catalog = catalog;
    this.factory = create;
    this.state = create();
  }
  reset(): void {
    this.selectedDefense = null;
    this.state = this.factory();
  }
  get activeDefense(): CapturedDefense | null { return this.selectedDefense; }
  get activeInterceptionPlan(): InterceptionPlan | null {
    return this.selectedDefense?.plan ?? null;
  }
  legalAttacks(targetId: string, distanceMeters: number): readonly string[] {
    return getLegalAttackMoves(this.state, this.catalog, targetId, distanceMeters);
  }
  legalSwitches(actorId: string): readonly string[] {
    return getLegalEquipmentSwitches(this.state, this.catalog, actorId);
  }
  legalReactions(): readonly ReactionOption[] { return getLegalReactions(this.state, this.catalog); }
  equip(actorId: string, weaponId: string): void {
    this.state = equipCombatant(this.state, actorId, weaponId, this.catalog);
  }
  end(actorId: string): void { this.state = endTurn(this.state, actorId); }
  attack(attackerId: string, defenderId: string, moveId: string,
    distanceMeters: number, nowMs: number, intendedRegionId: string | null = null,
    projectileGeometry?: ProjectileAttackGeometry): void {
    this.selectedDefense = null;
    this.state = queueAttack(this.state, {
      attackerId, defenderId, moveId,
      distanceAtStartMeters: distanceMeters, startedTick: Math.floor(nowMs),
      intendedRegionId,
      ...(projectileGeometry ? { projectileGeometry } : {}),
    }, this.catalog);
  }
  /**
   * The caller submits its observed/scheduled tick. The same domain grade
   * applies regardless of whether a player tapped or an AI policy scheduled it.
   */
  captureDefense(technique: ReactionTechnique, nowMs: number,
    defenderId = "hero"): DefenseCaptureResult {
    const pending = this.state.pending;
    if (!pending || this.state.phase !== "reaction" || pending.defenderId !== defenderId) {
      return { accepted: false, reason: "unavailable" };
    }
    if (this.selectedDefense) return { accepted: false, reason: "already_selected" };
    const option = this.legalReactions().find(item => item.technique === technique);
    if (!option) return { accepted: false, reason: "unavailable" };
    const tick = Math.floor(nowMs);
    const offset = tick - option.targetTick;
    if (tick < pending.startedTick || offset < -option.timing.earlyTicks) {
      return { accepted: false, reason: "too_early" };
    }
    if (offset > option.timing.lateTicks || gradeReactionV2(offset, option.timing) === "miss") {
      return { accepted: false, reason: "too_late" };
    }
    const plan=option.feasibleWindow
      ? getInterceptionPlan(this.state,this.catalog,option.moveId,tick)
      : null;
    if(option.feasibleWindow && !plan)
      return {accepted:false,reason:"unavailable"};
    this.selectedDefense = { moveId: option.moveId, tick,
      ...(plan ? {plan}:{}),
    };
    return { accepted: true, option };
  }

  /** Apply damage only when a surviving ORIGINAL projectile reaches its target. */
  projectileIfReady(
    nowMs: number,
    input: {
      readonly projectileId: string;
      readonly distanceAtImpactMeters: number;
      readonly actualRegionId?: string | null;
      readonly contact?: boolean;
      readonly contactTick?: number;
    },
  ): ProjectileContinuationResolution | null {
    const pending = this.state.pendingProjectile;
    if (!pending || pending.projectileId !== input.projectileId ||
        Math.floor(nowMs) < (input.contactTick ?? pending.impactTick)) return null;
    const result = resolveProjectileContinuation(this.state, {
      ...input, resolvedTick: Math.floor(nowMs),
    }, this.catalog);
    this.state = result.state;
    return result;
  }

  /** The domain alone applies a perfect melee-parry riposte. */
  counterIfReady(nowMs: number): CounterResolution | null {
    const counter = this.state.pendingCounter;
    if (!counter || Math.floor(nowMs) < counter.impactTick) return null;
    const result = resolveCounter(this.state, Math.floor(nowMs), this.catalog);
    this.state = result.state;
    return result;
  }

  /**
   * waitUntilTick lets the AI deliver a previously scheduled *late* reaction
   * instead of being prematurely resolved at impact. No fake frame-based grades.
   */
  resolveIfReady(nowMs: number, distanceAtImpactMeters: number,
    waitUntilTick?: number,
    spatial?: {
      readonly actualRegionId: string | null;
      readonly contact: boolean;
      readonly contactTick?: number;
    },
  ): ReactionResolution | null {
    const pending = this.state.pending;
    if (!pending) return null;
    const tick = Math.floor(nowMs);
    const option = this.selectedDefense
      ? this.legalReactions().find(item => item.moveId === this.selectedDefense!.moveId)
      : undefined;
    const isIntercept = option?.technique === "projectile_intercept" &&
      this.selectedDefense !== null;
    const physicalProjectile=!!pending.projectileGeometry && spatial!==undefined;
    if (tick < (isIntercept ?
      this.selectedDefense?.plan?.clashTick ?? option!.clashTick :
      physicalProjectile ? spatial.contactTick ?? pending.impactTick :
      pending.impactTick)) return null;
    if (!this.selectedDefense) {
      if (physicalProjectile) {
        // Do not postpone contact because a possible input window runs later.
      } else if (pending.defenderId === "hero") {
        const options = this.legalReactions();
        const latest = Math.max(0, ...options.map(item => item.timing.lateTicks));
        if (tick < pending.impactTick + latest) return null;
      } else if (waitUntilTick !== undefined && tick < waitUntilTick) {
        return null;
      }
    }
    const result = resolveReaction(this.state, {
      defenderId: pending.defenderId, hitId: pending.hits[pending.hitIndex]!.id,
      defenseMoveId: this.selectedDefense?.moveId ?? null,
      reactionTick: this.selectedDefense?.tick ?? null,
      resolvedTick: tick,
      distanceAtImpactMeters,
      ...(spatial ? {
        actualRegionId:spatial.actualRegionId,
        contact:spatial.contact,
        ...(spatial.contactTick!==undefined ? {contactTick:spatial.contactTick}:{}),
      } : {}),
    }, this.catalog);
    this.state = result.state;
    this.selectedDefense = null;
    return result;
  }
}
