import { describe, expect, it } from "vitest";
import { MELEE_FEEL, meleeHitStopMs, validateMeleeFeel } from "../apps/web/src/combat/MeleeFeel";
import { presentationForAttack } from "../apps/web/src/combat/attack-presentation";
import { PREVIEW_CATALOG } from "../apps/web/src/combat/preview-encounter";
import { SequencePlayer } from "../packages/choreography/src/index";
import type { CombatCue } from "../apps/web/src/combat/sequences";

describe("D11 cinematic melee presentation invariants",()=>{
  it("separates anticipation, pre-impact swing, contact, and recovery for each melee move",()=>{
    for(const move of Object.values(PREVIEW_CATALOG.attacks)){
      const plan=presentationForAttack(move);
      if(move.delivery!=="melee_contact"){
        expect(plan.feel).toBeNull();
        continue;
      }
      const cues=plan.sequence.cues;
      const swing=cues.find(c=>c.type==="melee_swing"||c.type==="enemy_swing");
      const impact=cues.find(c=>c.type==="melee_impact"||c.type==="enemy_impact");
      const recovery=cues.find(c=>c.type==="melee_recover"||c.type==="reaction_close");
      expect(swing?.atMs,move.id).toBeLessThan(move.impactOffsetTicks);
      expect(impact?.atMs,move.id).toBe(move.impactOffsetTicks);
      expect(recovery?.atMs,move.id).toBeGreaterThan(move.impactOffsetTicks);
      expect(plan.approachDurationMs).toBeLessThan(move.impactOffsetTicks);
      expect(plan.feel).not.toBeNull();
    }
  });
  it("gives rapid, standard, and heavy distinct escalating presentation weight",()=>{
    const rapid=MELEE_FEEL.rapid,standard=MELEE_FEEL.standard,heavy=MELEE_FEEL.heavy;
    expect(rapid.hitStopMs).toBeLessThan(standard.hitStopMs);
    expect(standard.hitStopMs).toBeLessThan(heavy.hitStopMs);
    expect(rapid.cameraShake).toBeLessThan(standard.cameraShake);
    expect(standard.cameraShake).toBeLessThan(heavy.cameraShake);
    expect(rapid.trailDurationMs).toBeLessThan(standard.trailDurationMs);
    expect(standard.trailDurationMs).toBeLessThan(heavy.trailDurationMs);
    expect(presentationForAttack(PREVIEW_CATALOG.attacks.rakshasa_rapid_slash!).feel?.style)
      .toBe("rapid");
    expect(presentationForAttack(PREVIEW_CATALOG.attacks.rakshasa_heavy!).feel?.style)
      .toBe("heavy");
  });
  it("bounds hit-stop without delaying authored gameplay events",()=>{
    const move=PREVIEW_CATALOG.attacks.rakshasa_heavy!;
    const plan=presentationForAttack(move);
    expect(meleeHitStopMs(MELEE_FEEL.heavy,true)).toBeLessThanOrEqual(120);
    expect(meleeHitStopMs(MELEE_FEEL.heavy,true,false,true)).toBe(0);
    expect(meleeHitStopMs(MELEE_FEEL.heavy,false,true)).toBeLessThan(
      meleeHitStopMs(MELEE_FEEL.heavy,false));
    const player=new SequencePlayer<CombatCue>();
    player.start(plan.sequence,1000);
    player.advance(2550);
    const sample=player.advance(2850)!;
    expect(sample.cues.some(c=>c.type==="melee_impact")).toBe(true);
    // Cosmetics do not move the domain marker.
    expect(move.impactOffsetTicks).toBe(1850);
  });
  it("rejects impossible authoring instead of silently corrupting presentation",()=>{
    expect(()=>validateMeleeFeel({...MELEE_FEEL.standard,hitStopMs:300})).toThrow();
    expect(()=>validateMeleeFeel({...MELEE_FEEL.standard,trailDurationMs:-1})).toThrow();
    expect(()=>validateMeleeFeel({...MELEE_FEEL.standard,cameraShake:2})).toThrow();
  });
});
