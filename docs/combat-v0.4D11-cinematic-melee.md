# D11 — Cinematic Melee Combat Feel

## Goals
The core already owns hit timing and contact validation. D11 makes rapid, standard and heavy melee feel distinct *without* granting damage or changing action windows through animation. Focus is perceptual quality using procedural placeholder rigs, rather than claiming finished motion-captured assets.

## Authoring model
`MeleeFeelProfile` is an immutable, validated presentation-only record. Profiles select windup, swing and contact audio, trail shape/length, optional hit-stop, camera shake/focus, and guard clash. Profiles can be expanded with asset references when the animation pipeline replaces the placeholders. The presentation adapter maps an authored move to a profile; game rules stay in `packages/combat`.

## Choreography and contacts
- Rapid slash telegraphs, swings at 560ms, contacts at 720ms, and recovers at 890ms.
- Standard slash swings at 1240ms, contacts at 1450ms, and recovers at 1650ms.
- Heavy attacks swing at 1590ms, contact at 1850ms, and recover at 2060ms.
- Overhead Rakshasa sword swing now uses the same 1590ms preparatory marker before its 1850ms authoritative hit.
- Swing cues are cosmetic. Only core reaction resolution produces actual damage and confirmed contact effects. Missing/cancelled attacks never invent contact.

## Perceptual polish
Distinct shoulder/torso torque and recovery keyframes improve silhouettes. Swing sounds run at pre-contact cues, while low-frequency body impact layers run only on confirmed melee damage. A guarded melee attack uses a higher-pitched clash. The camera anticipates heavy attacks by gently narrowing FOV and gives confirmed hits a controlled punch. Trail duration and size scale with the move. The brief per-actor animation hold is bounded (38–117ms) and does not pause the encounter clock or disrupt reaction legality. Reduced motion disables hit-stop and cinematic camera movement.

## Verification and risks
TypeScript, seeded encounters, unit contracts, desktop Chromium and touch Chromium are required. Tests should assert swing < domain impact < recovery; all authored impact cues agree with their combat attack specs, and hit-stop cannot exceed 120ms. D10's first enemy melee regression must stay green.

Remaining for high-end presentation: professional GLB rigs, root-motion matching, hand IK, foot planting, authored material/shader effects, full sound asset mastering, impact cameras tuned on real devices, and a formal visual regression baseline.
