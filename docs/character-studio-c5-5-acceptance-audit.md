# C5.5 — Integrated Weapon Handling Acceptance Evidence Ledger

**Status:** IN PROGRESS; NOT PHASE-ACCEPTED (2026-11-17).  
**Tracking:** [Issue #81](https://github.com/Tejasdmanjeshwar/Trilok/issues/81).  
**Inspected starting main:** `64ac634c91198eea30e83c583b08c70e0868d43f`.  
**Starting main CI:** [Verify #44088605750](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44088605750) completed successfully, including TypeScript, 88 passing Vitest files (including the existing deterministic combat replay), production Vite build, pinned MakeHuman source asset verification, and compiled identity `64ac634c-20261117T130914645Z`. The version and SHA in a *served* Cloudflare `/build-info.json` have not been independently retrieved by this audit. PR CI is not C5 Phase Acceptance.

## Implementation and audit inventory

C5.1 reference sword and anatomical digit grips (PR #83), C5.2 two-handed sword/staff and bounded IK (PR #84), C5.3 independent shield handling (PR #86), C5.4 bow and nock/draw/aim/release (PR #87), source-skinned arrow-rest clearance (PR #88), and bounded source-hand index caching/solver evaluation instrumentation (PR #89) are merged. Previous owner feedback approved each subphase's *observed* visual behavior, not an integrated phase-level gate.

The current `main` exposes single-hand sword (left/right), long sword/staff (both leads), sword+shield (both sides and guard/attack-ready/parry), and bow (both hands, rest/nock/partial/aim/release). Existing quantitative contact/pose tests include source-skinned sword, staff, shield, bow, mirrored symmetry, seeded morphology, partial progression and arrow-rest clearance. Existing e2e coverage includes the equipment classes. This audit additionally captured and inspected new desktop/touch screenshots from runs #44105630904 and #44106999189, without claiming complete physical-contact or owner visual acceptance.

**Corrected integration issue:** the draw slider was applied to the full-aim torso shooting-plane yaw even though it should control only partial draw. A range event outside partial draw also re-solved settled FK and reconstructed bow meshes. [Focused PR #90](https://github.com/Tejasdmanjeshwar/Trilok/pull/90) passed [Verify #44105174808](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44105174808), and merged to main at `5114afedc6a2e4ba6473404f2274752e44a184c4`. Merged-main [Verify #44106663782](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44106663782) passed 488 tests across 89 files, TypeScript, build and compiled identity `5114afed-20261117T145447019Z`. The browser visual and performance acceptance gates remain open.

**Browser evidence:** merged [PR #91](https://github.com/Tejasdmanjeshwar/Trilok/pull/91) retains a Chromium evidence test for manual Phase Acceptance that previously recorded screenshots for each equipment choice and both bow hands at 0%, 25%, 50%, 75% and 100% partial draw, along with Studio GPU geometry/texture counters and per-input synthetic-event-to-two-requestAnimationFrame timing. The latter is an *approximate render-opportunity latency*, **not measured hardware input-to-paint, compositor presentation or GPU time**. The first baseline [Chromium workflow #44105630904](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44105630904) passed and uploaded screenshots and JSON observations (artifact 14337468322). In that baseline, 14 synthetic input-to-two-rAF samples per viewport gave desktop mean/median/p95/max 360.8/339.8/569.8/569.8 ms and touch 367.0/353.7/575.8/575.8 ms. No uncaught page errors; GPU geometry counters returned from 3 to 3 after removing equipment while textures moved from 1 to 2 (potential lazy initialization, not proven leakage). Actual screenshots were examined, but the original hand-closeups captured a transitional camera and cannot certify finger contact. The browser audit was amended to settle the camera and collect a second resource cycle, and rebased onto merged PR #90; its updated run [#44106999189](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44106999189) passed with revised close-ups (artifact 14339497035). The temporary auto-run workflow was removed to satisfy existing phase gating policy; the Playwright test remains. The owner has not accepted the images.

## Gate table

| Gate | Evidence | Current verdict |
| --- | --- | --- |
| TypeScript / full Vitest / 1,000-seed replay / compiled identity on starting main | [Verify #44088605750](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44088605750) | PASS on starting SHA only |
| Integrated left/right weapon combinations | [Browser run #44105630904](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44105630904) succeeded on pre-fix candidate; follow-up [#44106999189](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44106999189) | Both baseline and merged-fix renders captured/reviewed; comprehensive closeup/contact and owner acceptance pending |
| Continuous posed-source skin and physical bow/arrow digit clearance | Existing guarded sampled tests; no full swept triangle collision certification | PARTIAL / needs screenshot and extreme-case audit |
| Partial-draw slider isolation | [PR #90](https://github.com/Tejasdmanjeshwar/Trilok/pull/90), [Verify #44105174808](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44105174808) | MERGED; CI and browser pass; responsiveness still open |
| Full end-to-end IK cold/warm and objective-work profiling | [manual solver benchmark](../.github/workflows/studio-solver-benchmark.yml) exists; no comparable full-pipeline results captured | OPEN |
| Actual browser input-to-paint, p95, maximum, mobile responsiveness | [Baseline Chromium #44105630904](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44105630904): desktop median 339.8 ms, touch median 353.7 ms; two-rAF proxy, not actual paint time | OPEN; latency warrants profiling |
| Resource cleanup under reload/repeated switching, WebGL context loss, cancellation and hidden tab | Ownership/disposal code exists; repeated measured resource snapshots not yet reviewed | OPEN |
| Desktop/touch screenshot matrix and visual review | [Phase Acceptance](../.github/workflows/phase-acceptance.yml) not dispatched; PR #91 targeted captures pending | OPEN |
| Accessibility / keyboard / reduced motion / Lab compatibility | Existing e2e and code paths inspected; dedicated integrated audit incomplete | OPEN |
| No C5 combat migration; existing replay | Combat visual adapter unchanged, starting-main CI passed | PASS for starting main; rerun on merged candidate |
| Exact Cloudflare deployed commit and notices | Starting-main compiled identity only, direct production fetch unavailable | OPEN |
| Final manual C5 Phase Acceptance, owner approval, issue closure | Not dispatched | OPEN |

## 2026-11-17 measured performance and CI policy follow-up

**Browser results (same Playwright spec, different GitHub runner moments):**
- [First Chromium run #44105630904](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44105630904) tested pre-fix preview and reported desktop median/p95 339.8/569.8 ms and touch median/p95 353.7/575.8 ms.
- [Merged-fix Chromium run #44106999189](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44106999189) passed desktop/touch against a candidate incorporating merged PR #90, reporting desktop median/p95 546.8/938.8 ms and touch median/p95 579.8/1023.3 ms. All 14 samples per viewport are synthetic slider input to the second requestAnimationFrame, **not actual browser paint/GPU latency**. No page errors or grip warnings were reported. GPU geometry counters returned to 3 after the equipment cycle; texture counters stabilized at 2 after the repeat cycle. No statistically controlled browser comparison or leak certification can be inferred from the two runs. The revised screenshot evidence includes settled hand focus, but continuous skin contact and owner approval are unverified.

**Policy correction:** The original automatic `c55-browser-audit.yml` triggered a failure in the repository's legitimate `tests/ci-phase-gating.test.ts` (CI [#44106999290](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44106999290)). The workflow was **removed** from PR #91 without weakening the test; its `e2e/c55-integrated-audit.spec.ts` remains for the existing manually dispatched Phase Acceptance workflow. Historical successful screenshots and JSON artifacts remain attached to the earlier Actions runs.

**Controlled end-to-end Node solver benchmark:** [run #44107261407](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44107261407) completed on one ubuntu-latest runner / Node v22.23.4, sampling 130 operations per revision (110 grouped scenarios), original `64ac634c` and post-fix `5114afed`. Representative before/after timings:
- Neutral bow-left cold equip: 274.44 / 260.52 ms; neutral bow-left partial 50% rapid slider: 392.26 / 390.77 ms.
- Asymmetric seed 2929832126 bow-left cold equip: 1201.04 / 1219.95 ms.
- Asymmetric seed's bow-left partial 50% rapid slider: 4925.28 / 4867.03 ms, **unreachable** and repeated across other partial fractions.
- Asymmetric seed bow-right partial 50% rapid slider: 1262.97 / 1268.17 ms.

The fixed-slider branch removes needless settled-pose recomputations but does not materially improve genuine partial draw solves. Approximately 4.8–4.9 seconds blocking for each distinct unreachable partial input on the asymmetric left bow is an **active C5 acceptance blocker**. A repair must preserve reachable partial states, source-skinned validity, and deterministic fallback. These serial Node measurements are neither device FPS nor GPU times; the runner and sample count are not enough to assert broad speedups.

**Current corrective follow-up:** [PR #94](https://github.com/Tejasdmanjeshwar/Trilok/pull/94) is evaluating bounded failed endpoint-status reuse. This can eliminate redundant nock/aim solves on consecutive partial slider changes but cannot by itself guarantee interactive frame times; full benchmark and CI pending.

**Phase state:** C5 remains **NOT ACCEPTED**. Exact final merged main, full phase browser matrix, independent Cloudflare served build identity, performance remediation, integrated resource/visibility/context testing, and owner visual approval remain required.

## Required closure sequence

1. PR #90 merged following green CI. Verify its resulting main build and original accepted partial/full/nock visuals; fix UI regressions in a separate PR when demonstrated.
2. Run PR #91 Chromium desktop/touch job, preserve JSON and actual screenshot artifacts, inspect all material contrasts. Update/fix tests after measured findings; merge only after required CI success.
3. Run controlled Node solver benchmark on **the same runner** across relevant candidate SHAs; report mean/median/p95/max and objective counts, **not browser FPS**. Separately capture browser responsiveness and GPU memory/resource lifecycle evidence. Do not use unstable wall-time pass/fail thresholds.
4. Audit source-skinned contact, root transform invariance, extreme symmetric/asymmetric morphology, context loss, Studio/Lab regeneration and accessibility; fix measured defects with focused PRs.
5. Merge accepted corrections, verify final main SHA and independent production `/build-info.json`, then dispatch manual `Phase Acceptance` with phase `C5` and notes `C5.5 integrated weapon handling, anatomical IK, browser and combat compatibility acceptance`.
6. Inspect desktop/touch screenshot artifacts, obtain explicit owner approval, record exact run/SHA and benchmark limitations, update issue #81 and roadmap, and close #81 **only** after all gates are met.

**Boundaries:** no C6 animation architecture, C7 archetypes, C8 injuries, C9 baking/Save/Load, new IK engine, Cloudflare deploy-gate bypass, or automatic combat-renderer migration. Green CI is not source-contact proof or owner visual approval.

## Rebased C5.5 endpoint cache and follow-up diagnostics — November 17, 2026

The latest inspected main before further optimization remained `83fe948ec947f87529e83a8e60074a00118a358f` (merged browser evidence PR #91). Draft [PR #94](https://github.com/Tejasdmanjeshwar/Trilok/pull/94) was rebased onto that exact SHA at `1e5ae10b380873e9cf2b1a262e32896e71bb0cc3`. [Controlled same-run comparison #44148219958](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44148219958) passed on a GitHub Linux Node/Vitest runner:

| CPU scenario | Main baseline (ms) | PR #94 candidate (ms) |
| --- | ---: | ---: |
| Asymmetric seed 2929832126, left bow partial warm | 3,855.6 | 1,917.3 |
| Asymmetric left bow rapid slider 0% | 3,858.8 | 1,898.9 |
| Asymmetric left bow rapid slider 50% | 3,858.2 | 1,914.0 |
| Asymmetric longsword-right warm | 1,027.8 | 1,012.2 |
| Neutral bow-left partial warm | 300.8 | 295.7 |

The roughly 50% saved in the failing-endpoint case comes from skipping repeated *invalid endpoint fits*, not bypassing the current partial draw's full contact solver. **The remaining ~1.9-second synchronous partial solve and ~1.0-second longsword warm solve are acceptance blockers.** These single-run timings do not demonstrate browser FPS, latency-to-photon or supported mobile responsiveness. [PR #94 full Verify #44148219972](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44148219972) passed TypeScript, tests, build and compiled identity; the rebased Cloudflare check and review/merge gate remain separate. The 2026-11-17 candidate SHA replaces older PR #94 benchmark examples when discussing current branch performance, not older historical evidence.

Follow-up draft [PR #95](https://github.com/Tejasdmanjeshwar/Trilok/pull/95) caches immutable source-torso ownership and triangle topology per model with geometry/attribute revision invalidation. Current posed MakeHuman skin, envelope construction and final source-surface checks remain active; it is not yet a **measured** improvement. [PR #96](https://github.com/Tejasdmanjeshwar/Trilok/pull/96) adds opt-in per-action deterministic IK objective/iteration and source-skin/collision work counters to the controlled benchmark. Their latest checks and comparisons must be reviewed before merge. Neither PR adds async/worker cancellation or proves interactive responsiveness.

Cloudflare production `/build-info.json` could not be independently retrieved from this environment (cache miss). It remains **unverified**, even when GitHub compiled build identity checks are green. No exact-final-main C5 phase-acceptance run, mobile/browser responsiveness certification, full rendered source contact approval, or owner integrated visual acceptance exists at this checkpoint. Leave C5.5 unchecked and issue #81 open; do not start C6.

## 2026-11-18 performance follow-up checkpoint (not acceptance)

**Merged:** [PR #94](https://github.com/Tejasdmanjeshwar/Trilok/pull/94) passed current-branch full [Verify #44148219972](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44148219972), controlled [comparison #44148219958](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44148219958) and its Cloudflare *preview build* check before merging as main `52026cdbb778019dbdfb6628f117642b0eb78a32`. [PR #96](https://github.com/Tejasdmanjeshwar/Trilok/pull/96) then passed [Verify #44153470783](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44153470783) and [controlled comparison #44153470794](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44153470794), merging opt-in diagnostic counters as main `6e78f4091143a56572c4b19e022b8b4c2417e8c4`.

**Measured work, not device latency:** the original severe left-bow partial warm benchmark on the unoptimized source, when instrumented in draft #96, recorded about **55,834 full IK objectives** and **9,045,178 source-skinned string/pad/cylinder vertex evaluations** in one operation; asymmetric longsword-right warm recorded about **7,155 IK objectives**. These counts expose CPU workload but were gathered on the instrumentation branch before the endpoint cache merged. Instrumentation adds overhead, so do not compare its wall timings naively with uninstrumented revision timings. The controlled #94 baseline/candidate comparisons in the table above remain the grounded time improvement record.

**Current review candidates:** [PR #95](https://github.com/Tejasdmanjeshwar/Trilok/pull/95) caches immutable torso vertex ownership/triangle indices; the first test improperly compared a stale calibration across changed roots, then was corrected to compare fresh envelopes at the same root. The latest rebased PR CI and controlled benchmark must pass before merge; this does **not** certify root-transform invariance by itself. [PR #97](https://github.com/Tejasdmanjeshwar/Trilok/pull/97) introduces a draft, latest-only worker for **partial bow draws only**, using a separately owned true MakeHuman source/IK. It checks generation, pose, hand, draw and root ownership, and re-evaluates the live finger/string and arrow-shaft skin before displaying an accepted result. Heavy initial equip, sword/staff and other Studio transitions remain synchronous. Worker build correctness, desktop/touch Chromium responsiveness, skin-contact screenshots, cancellation, memory and disposal require independent evidence; **PR creation is not runtime certification**.

**Still blocked:** exact-final-main C5 Phase Acceptance, validated desktop 60 FPS/mobile 30 FPS, device-specific input latency, owner visual approval, full integrated contact/lifecycle acceptance and an independently fetched Cloudflare production `build-info.json`. GitHub Verify and preview deploy success do not establish a served production SHA. Do not close issue #81 or begin C6.
