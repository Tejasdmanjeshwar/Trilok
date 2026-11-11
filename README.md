# Trilok

A reusable, TypeScript-based adventure RPG framework. **Ramayana** is the first planned campaign; shared gameplay will later power **Mahabharata**.

**Status:** Initial combat laboratory. This repository does not yet contain production terrain, authored campaign content or console builds.

## Getting started (phone or desktop)

1. Open this repository in GitHub Codespaces (Code → Codespaces → Create codespace).
2. Run `corepack enable` and `pnpm install` in the Codespaces terminal.
3. Run `pnpm dev` and open the forwarded Vite port (5173).
4. Select a move, then STRIKE or Space. Dodge (D) and weapon Parry (P) are free on the first valid defensive reaction since your previous turn; successive defenses cost Energy. For bow Arrow free aim: move mouse + left-click to shoot, drag in the 3D arena + STRIKE on touch, or use keyboard arrows + Space. Gamepad right stick/trigger is supported. The camera stays on the player's side during enemy attacks; Restart (R) resets the battle.

Run `pnpm typecheck`, `pnpm test`, and `pnpm build` before submitting a pull request.

## Architecture

- `packages/combat`: pure TypeScript turn rules, reaction grading and resolution; no dependency on Three.js or DOM.
- `packages/core`: common interfaces and contracts.
- `apps/web`: Three.js rendering, browser UI, controls and presentation adapter.
- `docs`: architectural direction and development milestones.

Strict TypeScript is enabled. The core has no global mutable state and combat updates return a new state. CI validates types, tests and builds.

## Next milestones

1. Replace placeholder characters with animation-driven combat actors and event-driven presentation.
2. Add input buffering, accessibility options, telemetry and multi-character encounter models.
3. Build a standalone authored-mask + erosion terrain baker, then stream compressed tiles with LOD.
4. Prototype a Ramayana story region with scalable vegetation and rivers.

Future console releases will need a separate porting strategy: Three.js web builds are not direct console exports.

## How to verify the live build

Every Vite build exposes a unique **BUILD <commit> · <UTC time>** badge below the Trilok title. Tap it to see the full Git SHA, build timestamp, playable version and combat engine version, or copy the report. The same data is published at `/build-info.json`.

The playable version is **v0.4.0-preview.18**, the combat engine version is **v0.4-D13**, and the channel is **preview**. Versions are managed in `apps/web/build-version.json`; the build ID is automatic for each compiled deployment.

See [Build verification](docs/build-verification.md) for deployment checks and mobile smoke tests.

### Cinematic combat HUD — v0.4-D2

The action and equipment dropdowns are replaced with an original medieval brass-and-parchment command deck. Click/tap move cards, press **Q** to cycle legal moves, and use **1/2** for equipment. Free aim and STRIKE/FIRE use the existing cross-platform input contract. The graphics preset is a HIGH/MOBILE toggle. The player-side decision camera has a gentle breathing pan (disabled when reduced motion is preferred).

See [v0.4-D2 UI and camera notes](docs/combat-v0.4D2-medieval-hud.md).

### Continuous projectile clashes — v0.4-D3

A ranged interception **fires the defender's arrow once during the intercept animation**. Both arrows travel together and collide before the original impact. Depending on timing and authored projectile strength, the incoming arrow survives, both shatter, or the defender's **same original arrow** continues automatically toward the attacker. No separate bow counter-attack or second projectile is created. Melee perfect parries still invoke authored sword ripostes. See [D3 projectile-clash technical notes](docs/combat-v0.4D3-projectile-clash.md).

### Ballistic and homing-ready interception — v0.4-D6

Incoming and defensive arrows now use the **same deterministic ballistic trajectory sampler** for physics and rendering. The shared solver calculates feasible interception inputs, prefers a path through both the incoming projectile and the predicted opponent position, and publishes an **early green feasibility band** plus a **gold perfect band** on the reaction bar. A surviving arrow retains its original trajectory and can still miss a moving target. The trajectory API supports straight, ballistic and future guided/homing **piecewise analytic segments**; a production homing controller is not implemented yet. See [D4 ballistic system specification](docs/combat-v0.4D4-ballistics.md).

### D5 / D6 — Contact-synchronized impact and persistent critical wounds

A ballistic arrow now resolves on the **first swept body contact**, not at an independently scheduled impact timestamp. Damage, recoil, sound, camera impact, numbers and authored effects share the same contact event. Precision-arrow criticals may spawn brief blood particles and **transfer the original projectile into the struck animated body part**; low-impact recovery shots cannot leave an embedded arrow. Criticals are still armor-aware: the rakshasa's helmet suppresses headshot criticals, while its exposed neck is a smaller, targetable precision weak point. Impacts select effect IDs through a reusable pure-combat move policy, supporting future burn/freeze visual handlers without changing damage math. Real gameplay status effects remain a separate future system. [D5 / D6 technical design](docs/combat-v0.4D5-D6-hit-feedback.md).

### D7 — Reliable bow aiming, fletched arrows and anatomical wound marks

Camera-selected regions now aim a shallow distance *inside the actual selected hit volume*, mitigating bow-camera parallax and surface-grazing misses without turning off deterministic collision or granting hits on empty space. The arrow visual's **tip**, not its shaft center, follows the authoritative trajectory; arrows now include a metal head, wooden shaft, nock and three feather vanes. Critical-hit preview arrows author a persistent `wound_mark` effect along with blood and optional arrow embedding. The wound is attached at the confirmed contact position to the moving anatomical rig and is pooled independently from arrows. The renderer supports configurable surface mark styles (wound, scorch and frost) without implementing unrequested gameplay statuses. See [D7 design and verification](docs/combat-v0.4D7-aim-wounds.md).


### D8 — Adaptive defense and satisfying melee

The preview now includes a free first-action rapid melee attack (zero Energy, no ordinary action spent, once per turn) and one free equipment switch each turn. Enemy utility AI remembers targeted regions, scales awareness and reaction precision with intelligence tier, evaluates exposed body-region vulnerability and armor, and can target unprotected weak spots. The incoming defensive timing indicator turns red when a vulnerable player region is under attack. Distinct rapid/heavy clip timelines, heavier impact shake and layered slash/hit sounds improve sword feel. [D8 verification notes](docs/combat-v0.4D8-adaptive-melee.md).

### D9 — Accumulating arrow wounds

Every confirmed damaging precision or warbow arrow leaves its **original projectile** lodged in the struck animated body region and adds a surface wound mark. Minor injuries persist for two encounter turns, deeper wounds for three turns, and severe or critical impacts remain for the encounter. The combat HUD counts arrows lodged in each fighter. Active projectile cleanup never erases wounds; multiple arrows can coexist (bounded to 16 on screen), with temporary arrows preferred for eviction when at capacity. Restart and disposal clear all attached arrows and decals. The persistence policy is purely visual and does not change damage or introduce bleeding-over-time. See [D9 notes](docs/combat-v0.4D9-wound-history.md).

### D10 — Combat reliability and browser validation

The D10 preview adds bounded early defense input buffering (110ms, without widening combat timing windows), an in-memory phase watchdog, visible restart/copy-report recovery after animation-loop errors, and diagnostic tracking of combat transitions and frame cadence. Tests now replay 1,000 seeded encounters through the combat adapter, and CI launches real Chromium desktop/mobile smoke checks against the production build. The runtime report is local until the player chooses to copy it; it is not sent to an analytics service. See [D10 reliability details](docs/combat-v0.4D10-reliability.md).

### D11 — Cinematic melee impact

Rapid, standard and heavy melee attacks now have distinct authored strike anticipation, swing events, trail sizes, hit-stop and layered synthesized audio. A confirmed heavy contact produces stronger camera emphasis while a parry gets a shorter metallic guard clash. Presentation effects never change contact, damage, Energy or legal reaction timing, and reduced-motion preferences disable camera accents and hit-stop. See [D11 cinematic melee](docs/combat-v0.4D11-cinematic-melee.md).

### D12 — Rhythmic offensive combat

While an attack is committed, a short gold timing lane offers an **optional** `F`/tap strike beat. Perfect or good beats add modest, deterministic damage after contact and defense checks. A per-turn rhythm chain rewards consecutive connected, well-timed attacks, up to a strict limit; ungraded, blocked and missed attacks reset it. Early presses do not bypass the window, and duplicate input cannot grant extra damage. Combat-domain timing policies are validated and snapshotted on attack commitment, with no influence on projectile collision, energy or defense windows. [D12 notes](docs/combat-v0.4D12-offensive-rhythm.md).

### D13 — Adaptive enemy attack patterns

Rakshasa gains **Crosscut** (two independently defendable hits), **Deceiver** (false swing before true contact), and **Delayed Heavy** (prolonged windup). Fighting-style profiles influence legal utility decisions and adapt to bounded player dodge/parry history. The choreography derives real contact markers from the domain catalog; feints never deal damage. See [D13 notes](docs/combat-v0.4D13-enemy-patterns.md).
