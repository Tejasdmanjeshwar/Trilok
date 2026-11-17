# C5.5 — Integrated Weapon Handling Acceptance Evidence Ledger

**Status:** IN PROGRESS; NOT PHASE-ACCEPTED (2026-11-17).  
**Tracking:** [Issue #81](https://github.com/Tejasdmanjeshwar/Trilok/issues/81).  
**Inspected starting main:** `64ac634c91198eea30e83c583b08c70e0868d43f`.  
**Starting main CI:** [Verify #44088605750](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44088605750) completed successfully, including TypeScript, 88 passing Vitest files (including the existing deterministic combat replay), production Vite build, pinned MakeHuman source asset verification, and compiled identity `64ac634c-20261117T130914645Z`. The version and SHA in a *served* Cloudflare `/build-info.json` have not been independently retrieved by this audit. PR CI is not C5 Phase Acceptance.

## Implementation and audit inventory

C5.1 reference sword and anatomical digit grips (PR #83), C5.2 two-handed sword/staff and bounded IK (PR #84), C5.3 independent shield handling (PR #86), C5.4 bow and nock/draw/aim/release (PR #87), source-skinned arrow-rest clearance (PR #88), and bounded source-hand index caching/solver evaluation instrumentation (PR #89) are merged. Previous owner feedback approved each subphase's *observed* visual behavior, not an integrated phase-level gate.

The current `main` exposes single-hand sword (left/right), long sword/staff (both leads), sword+shield (both sides and guard/attack-ready/parry), and bow (both hands, rest/nock/partial/aim/release). Existing quantitative contact/pose tests include source-skinned sword, staff, shield, bow, mirrored symmetry, seeded morphology, partial progression and arrow-rest clearance. Existing e2e screenshots cover the equipment classes, but they were not rerun and visually inspected in this audit session.

**Discovered integration issue:** the draw slider was applied to the full-aim torso shooting-plane yaw even though it should control only partial draw. A range event outside partial draw also re-solved settled FK and reconstructed bow meshes. [Focused PR #90](https://github.com/Tejasdmanjeshwar/Trilok/pull/90) isolates slider state and adds mirrored regression tests. Until CI and visual comparison succeed this is only a proposed correction.

**Browser evidence:** [PR #91](https://github.com/Tejasdmanjeshwar/Trilok/pull/91) introduces a path-scoped Chromium evidence workflow recording screenshots for each equipment choice and both bow hands at 0%, 25%, 50%, 75% and 100% partial draw, along with Studio GPU geometry/texture counters and per-input synthetic-event-to-two-requestAnimationFrame timing. The latter is an *approximate render-opportunity latency*, **not measured hardware input-to-paint, compositor presentation or GPU time**. The workflow is pending and the screenshots have not been inspected by the owner.

## Gate table

| Gate | Evidence | Current verdict |
| --- | --- | --- |
| TypeScript / full Vitest / 1,000-seed replay / compiled identity on starting main | [Verify #44088605750](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44088605750) | PASS on starting SHA only |
| Integrated left/right weapon combinations | Existing test coverage; additional [PR #91](https://github.com/Tejasdmanjeshwar/Trilok/pull/91) | Browser recheck pending |
| Continuous posed-source skin and physical bow/arrow digit clearance | Existing guarded sampled tests; no full swept triangle collision certification | PARTIAL / needs screenshot and extreme-case audit |
| Partial-draw slider isolation | [PR #90](https://github.com/Tejasdmanjeshwar/Trilok/pull/90) | Correction pending CI and merge |
| Full end-to-end IK cold/warm and objective-work profiling | [manual solver benchmark](../.github/workflows/studio-solver-benchmark.yml) exists; no comparable full-pipeline results captured | OPEN |
| Actual browser input-to-paint, p95, maximum, mobile responsiveness | [PR #91](https://github.com/Tejasdmanjeshwar/Trilok/pull/91) render-opportunity proxy proposed; true paint timing unmeasured | OPEN |
| Resource cleanup under reload/repeated switching, WebGL context loss, cancellation and hidden tab | Ownership/disposal code exists; repeated measured resource snapshots not yet reviewed | OPEN |
| Desktop/touch screenshot matrix and visual review | [Phase Acceptance](../.github/workflows/phase-acceptance.yml) not dispatched; PR #91 targeted captures pending | OPEN |
| Accessibility / keyboard / reduced motion / Lab compatibility | Existing e2e and code paths inspected; dedicated integrated audit incomplete | OPEN |
| No C5 combat migration; existing replay | Combat visual adapter unchanged, starting-main CI passed | PASS for starting main; rerun on merged candidate |
| Exact Cloudflare deployed commit and notices | Starting-main compiled identity only, direct production fetch unavailable | OPEN |
| Final manual C5 Phase Acceptance, owner approval, issue closure | Not dispatched | OPEN |

## Required closure sequence

1. Review PR #90 correction against original accepted partial/full/nock visuals; fix CI or UI regressions before merge.
2. Run PR #91 Chromium desktop/touch job, preserve JSON and actual screenshot artifacts, inspect all material contrasts. Update/fix tests after measured findings; merge only after required CI success.
3. Run controlled Node solver benchmark on **the same runner** across relevant candidate SHAs; report mean/median/p95/max and objective counts, **not browser FPS**. Separately capture browser responsiveness and GPU memory/resource lifecycle evidence. Do not use unstable wall-time pass/fail thresholds.
4. Audit source-skinned contact, root transform invariance, extreme symmetric/asymmetric morphology, context loss, Studio/Lab regeneration and accessibility; fix measured defects with focused PRs.
5. Merge accepted corrections, verify final main SHA and independent production `/build-info.json`, then dispatch manual `Phase Acceptance` with phase `C5` and notes `C5.5 integrated weapon handling, anatomical IK, browser and combat compatibility acceptance`.
6. Inspect desktop/touch screenshot artifacts, obtain explicit owner approval, record exact run/SHA and benchmark limitations, update issue #81 and roadmap, and close #81 **only** after all gates are met.

**Boundaries:** no C6 animation architecture, C7 archetypes, C8 injuries, C9 baking/Save/Load, new IK engine, Cloudflare deploy-gate bypass, or automatic combat-renderer migration. Green CI is not source-contact proof or owner visual approval.
