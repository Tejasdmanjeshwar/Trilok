# D14 — Three-phase Rakshasa miniboss encounter

## Goals
Give the existing Rakshasa fight a clear dramatic arc while preserving the D8–D13 combat authority. Stage progression is a persistent combat-level state separate from attack choreography. Phases never alter damage multipliers, grant hidden free attacks, replenish resources, heal the enemy or widen defense windows.

## Phase specifications
- **I · Sentinel (100%–65% HP)**: Duelist temperament. Reads initial player habits, relying on rapid and single sword attacks, overhead sword strike and ranged shots.
- **II · Veil of Deceit (65%–30% HP)**: Trickster temperament. Adds feints and the two-hit Crosscut; slightly increases reaction awareness and attack preference.
- **III · Unbound Fury (below 30% HP)**: Brute temperament. Allows heavy and delayed attacks, Crosscut, and stronger attack preference/recognition; retains regular recovery/arrow options rather than making every action a heavy attack.

Thresholds are sampled from authoritative post-damage HP, not predicted hit damage. Phases are strictly monotonic and cannot be skipped when a large hit crosses multiple thresholds. A transition is eligible only when the living boss owns a decision with no pending attack, projectile continuation or parry counter. Only one phase change can happen per turn.

## Presentation
The HUD shows a persistent phase name, and the arena's enemy HP styling shifts in each phase. Short, readable transition banners display the phase number, name and combat hint with distinct synthetic audio and optional camera emphasis. Reduced-motion disables added camera movement; the banner remains readable. These effects are not damage windows or uninterruptible attacks, and the runtime watchdog supervises the transition period.

## AI integration
The existing utility AI receives a phase-level allowlist and battle tuning. Domain legal moves are computed first, and only then filtered to permitted stage attacks. Weapon switches remain subject to domain rules. A consistent seeded brain retains bounded learned dodges/parries through all three stages while its fighting style and aggression/awareness scales evolve.

## Quality gates
Unit tests enforce exact health thresholds, postponed transitions during active reactions, no skip/no repeat, no core state mutation, phase-specific legal move scoring, seeded determinism and reset cleanup. Production preview, TypeScript, all existing combat tests including 1,000 seeded replays, desktop/mobile Chromium and build identity must succeed.

Future polish: authored boss animations and VFX assets, phase-specific voice work, physical-device performance tuning and full visual accessibility audits.
