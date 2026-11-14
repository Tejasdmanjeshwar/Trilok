# Trilok

A reusable, TypeScript-based adventure RPG framework. **Ramayana** is the first planned campaign; shared gameplay will later power **Mahabharata**.

**Status:** Initial combat laboratory. This repository does not yet contain production terrain, authored campaign content or console builds.

## Getting started (phone or desktop)

1. Open this repository in GitHub Codespaces (Code → Codespaces → Create codespace).
2. Run `corepack enable` and `pnpm install` in the Codespaces terminal.
3. Run `pnpm dev` and open the forwarded Vite port (5173).
4. Select a move, then STRIKE or Space. Dodge (D) and weapon Parry (P) are free on the first valid defensive reaction since your previous turn; successive defenses cost Energy. For bow Arrow free aim: move mouse + left-click to shoot, drag in the 3D arena + STRIKE on touch, or use keyboard arrows + Space. Gamepad right stick/trigger is supported. The camera stays on the player's side during enemy attacks; Restart (R) resets the battle.

Run `pnpm typecheck`, `pnpm test`, and `pnpm build` before submitting a pull request.

## CI: development slices versus phase acceptance

Pull requests and pushes to `main` run **fast Verify CI**: strict TypeScript,
the full unit suite (including the 1,000-seed combat replay), production build,
and exact-SHA build identity verification. The expensive desktop/touch Chromium
matrix does **not** run automatically for each intermediate Character Studio
slice.

At completion of a full C0–C9 phase, use **GitHub Actions → Phase Acceptance →
Run workflow**, choose the candidate branch and phase, then inspect its browser
screenshots before declaring the phase complete. A passing run certifies only
its tested commit SHA. See [phase-gated CI policy](docs/ci-phase-acceptance.md).
Focused manual browser checks remain advisable when changing visuals; skipping
automatic E2E on slices is not a claim that those changes are visually verified.

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

## Character Studio — C3 in progress\n\nC2 owner sign-off and exact-SHA automated acceptance are recorded in [closed Issue #15](https://github.com/Tejasdmanjeshwar/Trilok/issues/15). C3.1–C3.3 body morphology and correctives are merged. C3.4 opt-in human head morphology is described in [C3.4 notes](docs/character-studio-c3-4-human-head.md). C3.5 native MakeHuman facial controls are merged with owner visual approval in PR #54. C3.6 native MakeHuman body morphology is a draft review candidate in PR #56 (not accepted). C3.7 integration/acceptance remains pending. Species heads remain experimental pending C7; Save/Load belongs to C9.

C2.4's pinned-CC0 anatomical skinning and source-weight corrections include
headless real-asset shape, seam, articulation, ownership, rest-pose and
determinism regression checks. The project owner reports no major visually
obvious deformation defects in Character Lab and accepts the appearance at
this intermediate scope. **C2.4 is not the full C2 completion gate.** The
follow-up **C2.5** still requires complete desktop/mobile pose renders,
performance/disposal validation, and manually triggered C2 Phase Acceptance
before C3 or production-quality claims. See
[Character Studio roadmap](docs/character-studio-roadmap.md) and
[CC0 source/deformation evidence](docs/character-studio-c2-anatomical-import.md).

## Switching between laboratories

The Combat Arena header includes a **Character Lab** link to the isolated
[`/c2-lab.html`](https://trilok.tejasdmjr996.workers.dev/c2-lab.html).
Select **← Combat arena** in the lab to return to the battle. This is
navigation between independent pages, not a Character Studio release or
replacement of the existing combat actors.

## Character Studio roadmap (C0–C9)

The [C2 skinned-geometry research lab](docs/character-studio-c2-feasibility.md) at [`/c2-lab.html`](https://trilok.tejasdmjr996.workers.dev/c2-lab.html) now has a follow-up **pinned CC0 MakeHuman core template importer** with source topology diagnostics, provisional C1 skin weights and an explicit legacy implicit comparison mode. See [C2 anatomical source provenance and remaining gates](docs/character-studio-c2-anatomical-import.md). **This is not finished anatomical art or the Character Studio UI**, and it does not replace D14 battle models.


The upcoming [browser-native Character Studio roadmap](docs/character-studio-roadmap.md) defines an in-Trilok Three.js workflow for procedural anatomical humanoids, rigs, customizable human/Rakshasa/Vanara/winged-humanoid archetypes, validated baking and eventual anatomy-aware disfigurement/dismemberment. No Blender, separate authoring platform, or manual sculpting by the user is required. This is a **planned** system, not an implemented feature. The [C1 canonical character contracts](docs/character-studio-c1-contracts.md) introduce a pure TypeScript anatomical graph, versioned recipes, semantic rig socket lookup and a test-only legacy warrior bridge. **They do not yet change live combat or create an anatomical mesh/Studio page.**\n\nThe [C0 audited architecture and feasibility ADR](docs/character-studio-c0-architecture.md) specifies semantic skeletal and segment IDs, no-sculpt topology feasibility, injury/severing metadata, browser-only baking, migration boundaries, quality gates and the separately scoped C1 contracts. The [C0 new-session handoff](docs/character-studio-c0-handoff.md) records the original audit assignment. C0 is documentation, **not** a playable Character Studio. Existing D14 combat is preserved.

## How to verify the live build

Every Vite build exposes a unique **BUILD <commit> · <UTC time>** badge below the Trilok title. Tap it to see the full Git SHA, build timestamp, playable version and combat engine version, or copy the report. The same data is published at `/build-info.json`.

The playable version is **v0.4.0-preview.19**, the combat engine version is **v0.4-D14**, and the channel is **preview**. Versions are managed in `apps/web/build-version.json`; the build ID is automatic for each compiled deployment.

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

### D14 — The Rakshasa's three-phase miniboss fight

The guardian now evolves through **Sentinel** (100–65% HP), **Veil of Deceit** (65–30%) and **Unbound Fury** (30–0%). New phases alter the AI's fighting style, pattern allowlist, aggression, recognition and readable stage cues. Phase banners and audio occur strictly between combat actions, never inside an arrow flight, parry counter, or Crosscut combination. Boss phase changes cannot heal or recharge, cannot make attacks illegal in the domain legal, and never skip a phase. See [D14 design notes](docs/combat-v0.4D14-boss-phases.md).
