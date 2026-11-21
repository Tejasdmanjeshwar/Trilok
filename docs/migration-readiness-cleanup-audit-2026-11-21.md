# Browser-first / future Unity migration-readiness audit

**Audit date:** 2026-11-21  
**Baseline main (inspected):** `dcfb5e1bc06f3519300d27c21f85e6fcc28a62de` (PR #123 merged).  
**Scope:** low-risk architectural, documentation and CI cleanup **before** C6.3 Steps 2–5. This is **not** the major **Phase: C6** closeout cleanup report and does not declare C6.3 accepted.  
**Architecture decision:** [browser-first future-Unity ADR](architecture-browser-first-unity-portability.md).

## Actual implementation inventory

| Area | Repository evidence | Action |
| --- | --- | --- |
| Pure gameplay semantics | `packages/combat/src`, `combat-ai/src`, `character-core/src`, `choreography/src`, `input/src`, `core/src`; package entry points use TS, no web package dependencies declared in their package manifests | Preserve the implementation; introduce a lightweight source import-boundary guard to prevent future Three.js/browser-app or Unity imports into these portable sources. **This guard certifies import boundaries only, not cross-language deterministic parity.** |
| Browser presentation | `apps/web/src/studio`, `apps/web/src/characters`, `apps/web/src/movement/CombatMovementController.ts`, `apps/web/src/actors/AnimatedWarrior.ts` | Preserve; the movement controller is explicitly presentation-only, and the legacy actor adapter remains required for gameplay. No speculative extraction or renaming while C6.3 is active. |
| C6.3 mixer / feet | `packages/character-core/src/locomotion.ts`, `apps/web/src/studio/StudioLocomotionPlayback.ts`, `GroundedFootContacts.ts` | Keep unchanged in this PR. Their real direction/phase/contact/pelvis/gameplay integration gaps are **C6.3 Steps 2–5**, not migration cleanup. |
| Source-backed animations | `assets/animations/studio-v1/kevin`, `kevin/c63`, `assets/animations/sources/kevin-basic-motions-v1.json`; 3 + 24 source-backed Kevin clips and four approved UAL1 motions | Preserve exact resources/hashes and owner approval. The 24 new clips are opt-in until C6.3 integrates them. No new FBX/ZIP import, and no 100STYLE reinstatement. |
| C121 correction | `apps/web/src/characters/geometry/SourceSkinningFidelity.ts`, C121 tests | Keep; correction is part of current render path. No opportunistic skinning refactor. |
| CI Verify | `.github/workflows/ci.yml`, `pnpm test`, `pnpm animation:verify`, exact static release seal | Preserve fast deterministic PR checks, add quick source-boundary verification. No Unity SDK/Editor install or CI cost. |
| Phase Acceptance | `.github/workflows/phase-acceptance.yml` | Preserve manual desktop/touch Chromium and required C6 phase closeout report. A future Unity pipeline will be separate and only created when Unity development begins. |
| Old C6.3 turn source probe | `.github/workflows/c63-turn-source-probe.yml`: push only on `feat/c6-3-grounded-locomotion` and scrapes third-party turn pages for exploratory source links | **Remove** obsolete one-shot source investigation. Approved Kevin has two turn clips and bake/manifest verification. No production runtime or test depends on this probe. |
| Old C6.3 Chromium workflow | `.github/workflows/c63-kevin-chromium-review.yml`: push only on old `feat/c6-3-grounded-locomotion` | Retain useful integrated-playback screenshot tests but switch to **explicit manual dispatch**, so future C6.3 review can run on selected refs without reviving the historical feature branch. Remove redundant base64 JPEG log emission; keep screenshot artifacts. |
| Old Kevin bake workflow | `.github/workflows/c63-kevin-owner-bake.yml`: push only on merged `feat/c6-3-kevin-directional-review`, `contents:write`, auto-commit/push generated clip resources | Retain **manual read-only** pinned source verification. Verify original and 24 selected canonical outputs against existing checked-in bytes; remove obsolete write/push path. CI Verify still checks regular animation hashes; source archive verification remains separately available. |
| Roadmap/docs | `docs/character-studio-roadmap.md`, `character-studio-c6-plan.md`, `architecture.md` contain historical PR #118/draft statements | Add explicit current decision/status and links; **do not erase historical diagnostics or retrospective evidence**. |
| Root README | `README.md` is a short rights notice, no architecture orientation | Add minimal accurate links to architecture, roadmap and migration ADR, leaving proprietary rights statement intact. |

## Boundary risk register / deferred structural cleanup

1. **Engine-neutral data is not yet a Unity contract.** TypeScript interfaces, validators and asset JSONs exist, but no language-neutral schema or C# golden replay runner exists. Defer schema generation, manifest migration and C# parity until a scoped portability milestone; do not introduce an empty `apps/unity`.
2. **Presentation-leaning settings live in `packages/core`.** `QualitySettings.pixelRatioCap/shadowsEnabled` are platform-oriented but still plain values. Audit usage before moving; moving now creates unnecessary cross-package churn.
3. **Combat presentation still uses a legacy adapter.** `AnimatedWarrior`, `CombatHitVolumes`, world-space movement and wound presentation must retain stable behavior until canonical integration is verified; never delete by age/name alone.
4. **Browser mini-Blender still has renderer-bound geometry/skin/rig APIs.** Document inputs, coordinate systems, topology IDs and deterministic source fixtures during C7–C9. Do not translate Three.js classes to C# now; portability is contract-level.
5. **Gameplay Lab engagement requires user evidence.** Seeded replay and CI cannot measure fun. Add repeatable playtest scenarios, encounter telemetry and documented owner/player feedback progressively, without collecting private player data by default.
6. **Asset distribution rights are a separate gate.** Source-backed Kevin/MakeHuman assets and derivatives retain their own licenses irrespective of browser or Unity; do not infer Unity-native redistribution rights.
7. **Future runtime vs baked character outputs:** C9 must implement user-facing versioned recipes plus runtime generation and actual baked/exported assets. glTF/GLB is one interchange form; do not serialize only Three.js scene graphs.
8. **Future major cleanup:** Follow `docs/phase-closeout-cleanup-policy.md` and perform full dead-code/reachability and CI-cost audit at C6 **phase closure**, not by preemptively deleting live functionality before C6.3.

## Workflow/testing acceptance

This focused PR changes documentation, source-boundary verification, and obsolete/branch-bound workflow configuration only. It **must not** change the locomotion mixer, foot solver, combat simulation, character geometry, native animation resources, or Cloudflare deployment.

- Run `pnpm portability:verify` on PR/main fast Verify and before C6 manual acceptance; no Unity installer is required.
- Existing `pnpm typecheck`, `pnpm test`, `pnpm animation:verify`, `pnpm build`, exact build identity, release sealing and C6 manual Chromium checks remain unchanged.
- Run the existing `tests/ci-phase-gating.test.ts` and new boundary tests to prevent accidental Chromium auto-runs or port dependency leakage.
- For future C6.3 fixes, audit actual latest main, work Step 2 → Step 3 → Step 4 → Step 5, with focused PRs and actual browser review. Step 1's 27 Kevin clips are **owner-approved**.
- No Unity editor, CI environment, native build, license or GPU performance has been verified; do not claim such results.

## Verification ledger

| Gate | Status |
| --- | --- |
| Latest-main README, plans, source, workflows and tests reviewed | Complete for this focused audit |
| Architecture decision checked into branch | Complete |
| Workflow cleanup and import-boundary guard | Pending exact-HEAD Verify at time of writing |
| No runtime gameplay/animation changes | Intended; inspect final PR diff |
| PR CI, final HEAD and merge | To be reported from actual GitHub runs |
| Cloudflare / Netlify deployment | Not requested; do not deploy |
