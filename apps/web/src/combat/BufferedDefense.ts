import type { PendingAttack, ReactionOption } from "@trilok/combat";

export type DefenseKey = "dodge" | "parry";
export interface QueuedDefense {
  readonly key: string;
  readonly kind: DefenseKey;
  readonly inputTick: number;
  readonly executeTick: number;
  readonly latestTick: number;
}
export function pendingHitKey(pending: PendingAttack): string {
  return [pending.attackerId, pending.startedTick,
    pending.hitIndex, pending.hits[pending.hitIndex]?.id].join(":");
}
/** Start of an *actually legal* defense interval, including interception feasibility. */
export function defenseOpeningTick(pending: PendingAttack, option: ReactionOption): number {
  return Math.max(pending.startedTick, option.targetTick-option.timing.earlyTicks,
    option.feasibleWindow?.firstTick ?? pending.startedTick);
}

/**
 * Small, one-shot pre-window input buffer. It never moves a hit marker,
 * extends an authoritative defense window or grants a late input.
 * A buffered input is eligible at the earliest legal tick. It executes
 * using the actual clock rather than a fabricated earlier parry timestamp.
 * Slow frames outside the real window discard it instead.
 */
export class BufferedDefense {
  private queued: QueuedDefense | null = null;
  constructor(readonly leadTicks = 110) {
    if (!Number.isSafeInteger(leadTicks) || leadTicks < 0 || leadTicks > 200)
      throw new Error("Invalid defense buffer lead.");
  }
  get pending(): QueuedDefense | null { return this.queued; }
  offer(kind: DefenseKey, pending: PendingAttack,
    option: ReactionOption, inputMs: number): boolean {
    const inputTick=Math.floor(inputMs);
    const earliest=defenseOpeningTick(pending,option);
    if (this.queued || !Number.isSafeInteger(inputTick) ||
        inputTick < earliest-this.leadTicks || inputTick >= earliest) return false;
    this.queued={
      key:pendingHitKey(pending), kind, inputTick, executeTick:earliest,
      latestTick:Math.min(option.targetTick+option.timing.lateTicks,
        option.feasibleWindow?.lastTick ?? Infinity),
    };
    return true;
  }
  take(pending: PendingAttack | null, nowMs:number):QueuedDefense|null {
    const queued=this.queued;
    if (!queued) return null;
    if (!pending || pendingHitKey(pending)!==queued.key ||
        !Number.isFinite(nowMs)) {
      this.queued=null;
      return null;
    }
    if (nowMs < queued.executeTick) return null;
    this.queued=null;
    return nowMs <= queued.latestTick ? queued : null;
  }
  clear():void { this.queued=null; }
}
