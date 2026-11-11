export type SoundCue = "boss_awaken" | "boss_enrage" | "ui" | "draw" | "release" | "slash" | "step" | "hit" | "parry" | "intercept" | "clash" | "dodge" | "miss" | "victory" |
  "melee_ready" | "heavy_charge" | "slash_fast" | "slash_heavy" |
  "impact_light" | "impact_body" | "impact_heavy" | "guard_clash";

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
  boss_awaken: {frequency: 160, duration:.42, wave:"triangle",volume:.045},
  boss_enrage: {frequency: 92, duration:.62, wave:"sawtooth",volume:.055},
  melee_ready: { frequency: 175, duration: .13, wave: "triangle", volume: .023 },
  heavy_charge: { frequency: 118, duration: .35, wave: "sawtooth", volume: .032 },
  slash_fast: { frequency: 365, duration: .14, wave: "sawtooth", volume: .03 },
  slash_heavy: { frequency: 160, duration: .33, wave: "sawtooth", volume: .047 },
  impact_light: { frequency: 220, duration: .14, wave: "triangle", volume: .051 },
  impact_body: { frequency: 125, duration: .24, wave: "triangle", volume: .064 },
  impact_heavy: { frequency: 87, duration: .39, wave: "triangle", volume: .084 },
  guard_clash: { frequency: 1170, duration: .30, wave: "triangle", volume: .052 },
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
      if (name === "slash" || name === "dodge" || name === "release" || name === "clash" ||
          name === "slash_fast" || name === "slash_heavy" || name === "guard_clash") {
        this.whoosh(context, cue.duration, now);
      }
      if(name === "impact_light" || name === "impact_body" ||
          name === "impact_heavy" || name === "guard_clash"){
        this.lowImpact(context,name,now);
      }
    } catch {
      // Unsupported or blocked audio must never interrupt combat.
    }
  }

  /** A short sub-bass body/guard layer, synchronized to confirmed contact only. */
  private lowImpact(ctx:AudioContext,name:SoundCue,at:number):void {
    const heavy=name==="impact_heavy";
    const duration=heavy?.23:.13;
    const tone=ctx.createOscillator();
    const gain=ctx.createGain();
    tone.type="sine";
    tone.frequency.setValueAtTime(heavy?93:155,at);
    tone.frequency.exponentialRampToValueAtTime(heavy?56:83,at+duration);
    gain.gain.setValueAtTime(.0001,at);
    gain.gain.exponentialRampToValueAtTime(heavy?.075:.038,at+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    tone.connect(gain);gain.connect(ctx.destination);
    tone.start(at);tone.stop(at+duration+.01);
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
