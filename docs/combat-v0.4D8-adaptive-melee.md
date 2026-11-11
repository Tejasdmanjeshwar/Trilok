# Trilok v0.4-D8 — Adaptive Weak-Point Defense and Melee Feel

## Goals
Ensure attackers cannot repeatedly exploit one unguarded body region without increasing their chance of being recognized; reward knowledgeable opponents without turning the deterministic contact system into hidden hit RNG. Make sword openers fluid, and switching less punitive.

## Implementation and contracts
- The core's authored attack turn policy adds `firstActionOnly` and `freeAction`. A free opener is authored as a once-per-turn move, consumed via per-move use tracking but never by the ordinary action counter.
- Weapon switching remains limited to once on the actor's own decision turn and does not charge Energy.
- The AI stores a capped per-attacker aimed-region streak, uses a pure recognition function plus tier intelligence to increase defense awareness, and reduces its seeded timing error for recognizable threats. Legal reactions and final grades still come exclusively from the combat domain.
- The same anatomy vulnerability, exposure and armor catalogs drive weak-spot choice. Region-aware red telegraphs are view-only; they cannot alter reaction windows.
- The Three.js rig has distinct rapid and heavy melee animation clips. Authored choreography cues and core impact ticks agree; heavy impacts add richer audible and camera feedback.

## Build
Playable **0.4.0-preview.12**, engine **0.4-D8**. Confirm the public manifest exposes this version and the production commit SHA after Cloudflare publishes the main-branch build.

## Acceptance
Verify free switch and opener limits, repeated-region adaptation across novice/capable/elite profiles, exposed weakness warnings, impact timing on all melee moves, and desktop/mobile layout with reduced motion. CI verifies deterministic core and utility behavior; a real browser session is required to judge visual feel.
