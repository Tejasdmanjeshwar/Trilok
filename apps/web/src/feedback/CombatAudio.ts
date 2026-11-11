export type SoundCue = "ui" | "draw" | "release" | "slash" | "step" | "hit" | "parry" | "intercept" | "clash" | "dodge" | "miss" | "victory";

interface Voice {
  readonly frequency: number;
  readonly duration: number;
  readonly wave: OscillatorType;
  readonly volume: number;
}
const VOICES: Record<SoundCue, Voice> = {
  ui:      { frequency: 540, duration: .08, wave: "sine", volume: .025 },
  draw:    { frequency: 200, duration: .16, wave: "triangle", volume: .028 },
  release: { frequency: 660, duration: .21, wave: "triangle", volume: .05 },
  slash:   { frequency: 245, duration: .17, wave: "sawtooth", volume: .026 },
  step:    { frequency: 92, duration: .09, wave: "triangle", volume: .015 },
  hit:     { frequency: 132, duration: .21, wave: "triangle", volume: .072 },
  parry:   { frequency: 920, duration: .34, wave: "triangle", volume: .048 },
  intercept: { frequency: 1130, duration: .25, wave: "triangle", volume: .043 },
  clash:   { frequency: 1470, duration: .29, wave: "sawtooth", volume: .065 },
  dodge:   { frequency: 360, duration: .12, wave: "sine", volume: .025 },
  miss:    { frequency: 94, duration: .27, wave: "sawtooth", volume: .035 },
  victory: { frequency: 760, duration: .38, wave: "sine", volume: .033 },
};

/**
 * All sound is optional and synthesized, without external files.
 * Context is created lazily after the user's interaction.
 */
export class CombatAudio {
  private context: AudioContext | null = null;
  private enabled = false;
  private noise: AudioBuffer | null = null;

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) this.play("ui");
    return this.enabled;
  }

  play(name: SoundCue): void {
    if (!this.enabled) return;
    try {
      const context = this.context ?? (this.context = new AudioContext());
      if (context.state === "suspended") void context.resume();
      const cue = VOICES[name];
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = cue.wave;
      oscillator.frequency.setValueAtTime(cue.frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(65, cue.frequency * .52), now + cue.duration);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(cue.volume, now + Math.min(.015, cue.duration / 3));
      gain.gain.exponentialRampToValueAtTime(.0001, now + cue.duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + cue.duration + .01);
      if (name === "slash" || name === "dodge" || name === "release" || name === "clash") {
        this.whoosh(context, cue.duration, now);
      }
    } catch {
      // Unsupported or blocked audio must never interrupt combat.
    }
  }

  private whoosh(ctx: AudioContext, duration: number, at: number): void {
    if (!this.noise) {
      const frames = Math.ceil(ctx.sampleRate * .35);
      const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      let value = 0x2182a3;
      for (let i = 0; i < frames; i++) {
        value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
        samples[i] = (value >>> 0) / 2147483648 - 1;
      }
      this.noise = buffer;
    }
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = this.noise;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(460, at);
    filter.frequency.exponentialRampToValueAtTime(1180, at + duration);
    filter.Q.value = .7;
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(.025, at + duration * .3);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(at);
    src.stop(at + duration);
  }

  dispose(): void {
    this.enabled = false;
    this.noise = null;
    const context = this.context;
    this.context = null;
    if (context) void context.close();
  }
}
