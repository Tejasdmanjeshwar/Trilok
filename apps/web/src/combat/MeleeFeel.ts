import type { SoundCue } from "../feedback/CombatAudio";

/** Visual and audio weight only. Combat damage/timing never depend on this data. */
export type MeleeStyle = "rapid" | "standard" | "heavy";
export interface MeleeFeelProfile {
  readonly style:MeleeStyle;
  readonly swingSound:SoundCue;
  readonly windupSound:SoundCue;
  readonly contactSound:SoundCue;
  readonly trailDurationMs:number;
  readonly trailScale:number;
  readonly hitStopMs:number;
  readonly guardedStopMs:number;
  readonly cameraShake:number;
  readonly cameraFocus:number;
}
export const MELEE_FEEL:Readonly<Record<MeleeStyle,MeleeFeelProfile>>=Object.freeze({
  rapid:Object.freeze({
    style:"rapid",windupSound:"melee_ready",swingSound:"slash_fast",
    contactSound:"impact_light",trailDurationMs:230,trailScale:.86,
    hitStopMs:38,guardedStopMs:30,cameraShake:.10,cameraFocus:.32,
  }),
  standard:Object.freeze({
    style:"standard",windupSound:"melee_ready",swingSound:"slash",
    contactSound:"impact_body",trailDurationMs:340,trailScale:1,
    hitStopMs:62,guardedStopMs:42,cameraShake:.17,cameraFocus:.55,
  }),
  heavy:Object.freeze({
    style:"heavy",windupSound:"heavy_charge",swingSound:"slash_heavy",
    contactSound:"impact_heavy",trailDurationMs:475,trailScale:1.16,
    hitStopMs:105,guardedStopMs:75,cameraShake:.28,cameraFocus:1,
  }),
});
export function meleeHitStopMs(profile:MeleeFeelProfile,critical:boolean,
  guarded=false,reducedMotion=false):number {
  if(reducedMotion)return 0;
  const base=guarded?profile.guardedStopMs:profile.hitStopMs;
  return Math.min(120,base+(critical&&!guarded?12:0));
}
/** Validate all authored feel values before a renderer can read them. */
export function validateMeleeFeel(profile:MeleeFeelProfile):void {
  const values=[profile.trailDurationMs,profile.trailScale,
    profile.hitStopMs,profile.guardedStopMs,profile.cameraShake,profile.cameraFocus];
  if(values.some(v=>!Number.isFinite(v)||v<0)||
      profile.trailDurationMs<100||profile.trailDurationMs>800||
      profile.trailScale<.4||profile.trailScale>2||
      profile.hitStopMs>120||profile.guardedStopMs>120||
      profile.cameraShake>.35||profile.cameraFocus>1.5)
    throw new Error("Invalid melee presentation values.");
}
for(const value of Object.values(MELEE_FEEL))validateMeleeFeel(value);
