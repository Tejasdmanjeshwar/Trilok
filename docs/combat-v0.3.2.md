# Trilok v0.3.2 — Animation and Combat Feedback

## Intent
Make the existing authored duel more physical and readable while keeping combat simulation authoritative and independent of presentation.

## Delivered
- Procedural gait overlay drives leg stepping and upper-body counter-swing while root movement is active.
- Melee approach uses fast ease-out, recovery uses controlled easing, and dodge clears the attack corridor quickly before returning.
- Authored sword arcs use one reusable geometry and fade at timeline markers.
- `CombatFeedback` pools 64 impact particles and six screen-projected damage numbers, includes short screen flashes and a tiny presentation-only hit stop.
- `CombatAudio` is optional and synthesizes different draw, slash, arrow, parry, dodge, impact and victory sounds from Web Audio.
- Arrow and melee damage share one authoritative hit path, and equipment still controls allowed attacks and defenses.
- Dynamic telegraph hint reflects whether the hero has dodge only or dodge plus parry.

## Architecture
- `packages/combat`: immutable combat rules, equipment and damage. No renderer/time dependency.
- `packages/choreography`: frame-rate independent timestamped cue sequencing and reaction buffering.
- `apps/web/src/movement`: camera-independent, timestamp-sampled root movement.
- `apps/web/src/actors`: Three.js animation clips, articulated placeholder models and locomotion overlay.
- `apps/web/src/effects`: existing pooled projectiles, impact ring and new sword streak.
- `apps/web/src/feedback/CombatFeedback.ts`: visual presentation and one-time screen overlays, not damage rules.
- `apps/web/src/feedback/CombatAudio.ts`: optional sound synthesis and lifecycle.

## Testing/acceptance
- Gameplay hit timestamps must match authored markers even if the frame rate drops.
- The attack's first valid contact marker changes HP once; not on button press.
- Bow has dodge but no parry; sword permits both.
- Melee requires moving to weapon reach; root returns to home after the sequence.
- Damage popups, slash VFX, screen flashes and short hit stop do not alter deterministic combat outcomes.
- Visuals remain playable on low-quality mobile profile with only one 64-particle pool.
- GitHub CI must pass type checking, unit tests and build. Browser appearance and frame-rate still require manual testing.

## Not yet production art
Current characters are procedural articulated stand-ins; melee attacks are posed with AnimationMixer, not authored motion-capture or true root-motion character rigs. Screen shake and VFX are intentionally restrained, not a substitute for sound design and animation assets.

## Next
GLB character rigs, authored animation retargeting, better weapon contact sockets, audio files, multi-hit AI and richer dodge/posture strategies.
