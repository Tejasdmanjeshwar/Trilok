/**
 * Pure, timestamp-driven presentation timelines.
 * All clocks use elapsed milliseconds; render FPS does not affect event delivery.
 * The combat domain remains authoritative for damage/reaction results.
 */
export interface Cue<T extends string = string> {
  readonly id: string;
  readonly atMs: number;
  readonly type: T;
}
export interface Sequence<T extends string = string> {
  readonly id: string;
  readonly durationMs: number;
  readonly cues: readonly Cue<T>[];
}
export interface TimelineSample<T extends string = string> {
  readonly sequenceId: string;
  readonly elapsedMs: number;
  readonly progress: number;
  readonly cues: readonly Cue<T>[];
  readonly finished: boolean;
}

/** Reject malformed data once, rather than tolerating ambiguous runtime ordering. */
export function validateSequence<T extends string>(sequence: Sequence<T>): void {
  if (!sequence.id || !Number.isFinite(sequence.durationMs) || sequence.durationMs <= 0) {
    throw new Error("Invalid sequence identifier or duration.");
  }
  const ids = new Set<string>();
  let previous = -1;
  for (const cue of sequence.cues) {
    if (!cue.id || ids.has(cue.id)) throw new Error("Duplicate or empty cue ID.");
    if (!Number.isFinite(cue.atMs) || cue.atMs < previous ||
        cue.atMs < 0 || cue.atMs > sequence.durationMs) {
      throw new Error("Sequence cues must be finite, chronological, and within bounds.");
    }
    ids.add(cue.id);
    previous = cue.atMs;
  }
}

export class SequencePlayer<T extends string = string> {
  private active: Sequence<T> | null = null;
  private beganAt = 0;
  private lastElapsed = -1;

  start(sequence: Sequence<T>, timestampMs: number): void {
    validateSequence(sequence);
    if (!Number.isFinite(timestampMs)) throw new Error("Invalid start time.");
    this.active = sequence;
    this.beganAt = timestampMs;
    this.lastElapsed = -1;
  }

  cancel(): void {
    this.active = null;
    this.lastElapsed = -1;
  }

  get running(): boolean { return this.active !== null; }
  get sequenceId(): string | null { return this.active?.id ?? null; }
  get startTimeMs(): number { return this.beganAt; }

  elapsed(timestampMs: number): number {
    return this.active ? Math.max(0, Math.min(this.active.durationMs, timestampMs - this.beganAt)) : 0;
  }

  advance(timestampMs: number): TimelineSample<T> | null {
    const sequence = this.active;
    if (!sequence) return null;
    if (!Number.isFinite(timestampMs)) throw new Error("Invalid timestamp.");
    const elapsedMs = Math.max(this.lastElapsed, Math.max(0, Math.min(sequence.durationMs, timestampMs - this.beganAt)));
    const fired = sequence.cues.filter(cue => cue.atMs > this.lastElapsed && cue.atMs <= elapsedMs);
    this.lastElapsed = elapsedMs;
    const finished = elapsedMs >= sequence.durationMs;
    if (finished) this.active = null;
    return {
      sequenceId: sequence.id,
      elapsedMs,
      progress: elapsedMs / sequence.durationMs,
      cues: fired,
      finished,
    };
  }
}

/**
 * Defensive inputs can arrive slightly before the hit frame or during a
 * post-impact grace window. Record the first accepted input.
 */
export class ReactionBuffer {
  private acceptedOffset: number | null = null;

  constructor(
    readonly impactAtMs: number,
    readonly earlyMs: number = 380,
    readonly lateMs: number = 280,
  ) {
    if (!Number.isFinite(impactAtMs) || earlyMs < 0 || lateMs < 0) {
      throw new Error("Invalid reaction timing bounds.");
    }
  }

  capture(timestampMs: number): boolean {
    if (this.acceptedOffset !== null || !Number.isFinite(timestampMs)) return false;
    const offset = timestampMs - this.impactAtMs;
    if (offset < -this.earlyMs || offset > this.lateMs) return false;
    this.acceptedOffset = offset;
    return true;
  }

  get offsetMs(): number | null { return this.acceptedOffset; }
  get captured(): boolean { return this.acceptedOffset !== null; }
}
