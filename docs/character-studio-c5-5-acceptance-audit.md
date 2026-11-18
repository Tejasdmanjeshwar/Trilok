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

## Reconciled torso-cache merge and off-thread candidate — November 18, 2026

[PR #95](https://github.com/Tejasdmanjeshwar/Trilok/pull/95) passed its latest [Verify #44155513745](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44155513745) and [same-run comparison #44155513738](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44155513738), then merged to main as `68903d3704083c10d3f34b28d4c268957a6d5f57`. The comparison, run against instrumented post-#94 main, recorded:

| Instrumented Node scenario | Main baseline | Topology-cache candidate |
| --- | ---: | ---: |
| Asymmetric seed 2929832126, left-bow partial warm | 2,086.7 ms | 2,037.8 ms |
| Asymmetric longsword-right warm | 1,021.2 ms | 1,010.3 ms |
| Neutral bow-left partial warm | 325.0 ms | 312.0 ms |

Source-skinned, FK and contact objective counts were unchanged by this cache. The reduction is modest and **does not resolve the remaining synchronous two-second worker-cost problem**. The new root-transform topology test covers independently recalibrated envelopes at the same transformed root, not a claim of complete physical root-transform invariance. A separate full root-transform equivalence/contact audit remains a C5 gate.

[Draft PR #97](https://github.com/Tejasdmanjeshwar/Trilok/pull/97), rebased onto merged #95, implements a candidate source-skinned partial-bow Web Worker. No numerical tolerances or combat authority were changed. Its correctness, source parity, cancellation/resource ownership and desktop/touch browser results must be established before merging; it does **not yet** fix synchronous heavy sword/staff or initial equipment transitions. The full manual C5 Phase Acceptance workflow must not be dispatched as a subphase acceptance substitute.

**Release boundary:** main `68903d3704083c10d3f34b28d4c268957a6d5f57` is a verified interim engineering checkpoint, not the accepted C5 release commit. The served production Cloudflare SHA remains independently unverified; no owner integrated visual approval has been recorded. Keep issue #81 open.

## C5 Phase Acceptance cancellation and workflow remediation (2026-11-18)

Manual [Phase Acceptance #44179896528](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44179896528) was dispatched for **C5** on the exact then-latest merged `main` `c1b6ac644ed8c6da097eab2fd4c10fae25f13ed0` (including worker PR #97). Typecheck, all **498** unit/replay tests, production build, build-identity verification and Chromium setup passed. The 88-test, single-worker desktop+touch Playwright execution ran until the job's 40-minute limit and was cancelled. The UI had already completed random generation, but `e2e/studio-generator.spec.ts` waited for a removed `New character created` message instead of the real `Character generated from seed …` confirmation; with two viewports, 150-second waits and one retry, this unnecessarily consumed roughly ten minutes. **This is a broken UI assertion, not evidence that generation failed.** Other unresolved browser failures cannot be ruled out because execution was incomplete. The run retained 428 screenshots in [artifact #14373833442](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44179896528/artifacts/14373833442).

This corrective slice updates the generator browser assertions to check the actual reported seed against the seed field and current recipe (while retaining Undo/Redo and visual checks), reduces their failure-detection window, and splits **only the manually dispatched** browser acceptance into separate desktop/touch jobs, each with one worker, full project coverage, source-SHA build identity and independent screenshot/JSON artifacts. Deterministic checks still gate the expensive browser jobs; `fail-fast: false` retains evidence for both viewport failures. The existing PR/main `Verify` workflow remains free of browser tests. The intent is to eliminate avoidable serial and timeout overhead; actual wall-time improvement and browser correctness remain **unverified until a fresh exact-main C5 run**.

**C5 remains NOT ACCEPTED.** A green post-remediation exact-main full acceptance run, inspected artifacts, independent production build identity and owner visual sign-off are still required; keep #81 open.

## C5 first-load double-tap stabilization (2026-11-18)

Manual [C5 Phase Acceptance #44239291037](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44239291037) **completed successfully** on exact main `2496e936f103c4a2225e9631eaf5f7cd0fff1da5`: 498 deterministic/unit tests, build and identity checks, 43 browser tests passed plus one passing-on-retry test in each of desktop and touch Chromium. [Desktop evidence](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44239291037/artifacts/14400470571) and [touch evidence](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44239291037/artifacts/14400111724) were preserved. The double-tap inspection test `e2e/studio-inspection.spec.ts` failed on its first attempt in **both** projects because `#studio-return-focus` stayed disabled, then passed on retry. Treat the green workflow as positive **but flaky** evidence, not a pristine full-first-attempt browser pass.

The Studio viewport was initialized by `resetView()`, starting a 430ms animated camera transition from the new camera's origin. OrbitControls explicitly cancels camera transitions on pointer start. If the first pointer arrives before the initial camera completes its render flight, the camera/ray can remain in a partial startup pose and miss the real human. The corrective first-load patch positions the camera/target at the documented three-quarter default **synchronously**, updates camera and posed source-root transforms before double-tap raycast, and uses browser input event timestamps for gesture recognition rather than a potentially delayed event-handler wall time. It retains exact skinned-triangle ray hits, gesture safety limits, subsequent animated view changes, reduced motion, and combat independence. The browser regression still verifies double-tap focus, semantic area selection, persistent focus across camera angles, return navigation and reset; it waits for two rendered frames (no fixed timeout sleep) and uses genuine Playwright double-click mouse input.

**Evidence status:** This code correction requires PR Verify, a fresh manual complete C5 Phase Acceptance on the *resulting merged main* to establish whether both browser projects pass on their first attempts, independent production `/build-info.json` verification, and actual rendered evidence/owner review. No acceptance or production deployment is implied by this note; leave issue #81 open.

## November 18, 2026 — C5 acceptance upstream download failure

[Manual Phase Acceptance #44251207529](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44251207529)
tested exact main `17c97f701b775a1229623bc38ac19069e3b151d6`, after the double-tap
startup fix merged. TypeScript passed, but the deterministic job aborted in
`scripts/fetch-makehuman-facial.mjs` with upstream `read ECONNRESET` during
pinned facial asset acquisition. Unit/replay tests **did not execute**, and
desktop/touch browser jobs were **skipped**. This does not indicate a gameplay
or browser regression and cannot be treated as C5 acceptance.

Follow-up acquisition reliability change: shared bounded transient retries
for pinned base/rig/facial/body sources, conservative body request concurrency,
and an integrity-checked cache reused by the PR/main Verify and all manual
acceptance jobs. Cached source digests and licenses are still verified before
use; no alternate revision or relaxed gameplay tests. Validate through PR CI,
merge after green checks, then run one full manual C5 Phase Acceptance against
the *new* exact main SHA. Inspect the first-attempt double-tap browser result,
desktop/touch artifacts and deployment identity before owner sign-off; keep
issue #81 open.

## November 18, 2026 — exact-main C5 browser result and remaining touch timing follow-up

The post-asset-retry [manual C5 Phase Acceptance #44255721030](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44255721030) completed **successfully** against exact main `1aa93ae356e39ed961ae0080415782f8ce8ca6a8`: 503 tests in 95 unit files, TypeScript, production build, compiled identity, and full 44-test runs for each Chromium project. **Desktop passed all 44 on their first attempt. Touch had 43 first-attempt passes and one passing-on-retry flaky test:** `e2e/studio-inspection.spec.ts` double-tap focus again left `#studio-return-focus` disabled on first attempt. No overall browser failures remained, but that result is not evidence of a fully stable touch gesture. [Desktop artifact](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44255721030/artifacts/14406847549); [touch artifact](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44255721030/artifacts/14407915853). Do not close C5 without rendered owner review or deployed identity verification.

The touch double-tap recognizer historically required successive pointer-up events within 380 ms—the same threshold as desktop mouse, while the browser test uses two genuine sequential touchscreen events. A candidate correction extends **only touch** to 650 ms; mouse and pen retain 380 ms, and each tap still must complete within 400 ms, move at most 12 CSS pixels, and remain within 26 pixels of the prior tap. New unit tests explicitly cover the upper touch boundary and the shorter mouse/pen bounds. This is a constrained, plausible mobile timing remediation, not a proved diagnosis of the first-attempt failure: the skinned-ray focus still requires a real character hit. Confirm with a fresh full C5 exact-merged-main browser run and record first-attempt and retry results before marking this gate resolved.


## November 18, 2026 — targeted double-tap investigation (in progress)

The previous touch-only 650 ms cadence change in PR #101 is **unproven** until retry-free repeated browser results distinguish gesture timing from skin intersection and UI state. PR #101 now instruments the actual pointer-up → real skinned-mesh raycast → skin-triangle anatomical classification → focus callback sequence, enabled only with `?studio-focus-diagnostics=1`. The existing double-tap Playwright test enables this switch and attaches the stage events on failure; a successful button state without the actual character hit is not accepted.

Separate CI-only PR #102 proposes a manual `Studio Interaction Diagnostics` workflow with an exact-ref checkout, pinned MakeHuman assets, production build/identity verification, one worker/project, zero retries, and repeat counts up to 20. The default 10 repeats per project should run against PR #101 **after** the workflow lands on main, followed by related Studio focus tests, review of stage logs and trace/screenshots, and further tests/fixes if any first attempts fail. No targeted browser attempts have yet been verified in this note. Do not merge PR #101, dispatch full Phase Acceptance, mark C5 accepted, or assert deployment parity on this preliminary evidence.


## November 18, 2026 — targeted diagnostic run and bounded desktop correction

[Manual Studio Interaction Diagnostics run #44269189726](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44269189726) exercised the original real-skin double-tap test **10 times per project without retries**, on PR #101 SHA `ba7e6a7c264eea70d32c34acad2e5358cdeb043b`. Touch Chromium: **10/10 first-attempt passes**. Desktop Chromium: **9/10 first-attempt passes**, with the third iteration failing. [Desktop failure artifacts](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44269189726/artifacts/14412340377) contain the screenshot, trace and emitted diagnostic stages.

The failing trace proves a *gesture recognition* rejection rather than an anatomical skin-ray miss or UI callback problem **for that desktop attempt**. Both mouse taps were short, same pointer type and identical at canvas coordinate (561,398); their pointer-up timestamps were 1030.3 ms and 2349.8 ms (a **1319.5 ms gap**), exceeding the strict mouse 380 ms interval. The browser was driven by Playwright's single `page.mouse.dblclick(...,{delay:70})` action; its tracing shows a long input delivery gap inside that single action. Exact scheduling mechanism remains unverified. The raycast was never attempted, so extending skinned triangle mapping or fabricating colliders would be incorrect.

Follow-up on PR #101 retains normal pointer-based touch/pen recognition and mouse 380 ms timing. It provides a second, narrowly gated path for a **trusted browser-native mouse `dblclick`**, requiring two independently validated short mouse presses at nearby coordinates, a trusted primary-button event with detail 2, recent delivery after the second pointer-up, and a nearby event coordinate. It uses the **same real posed skinned mesh raycast and anatomy classification** as the normal double-tap; it does not accept script-created double-clicks, unbounded touch sequences, empty-canvas hits, or dragged pointers. New unit checks cover the negative constraints and a related Playwright test deliberately delays CDP mouse clicks while checking browser-native gesture recognition and real `skin-hit`/`focus-committed` events.

**Gate still outstanding:** latest corrective commit must pass Verify; repeat the original exact browser test `focus-repeat` ×10 per viewport (zero retries) *and* `related` interactions in the manually dispatched workflow. Check first-attempt failures and review any trace before merging. Additional fresh-browser/reload runs and owner visual review remain necessary for C5 phase acceptance. The previous 650 ms touch interval is still not independently established as necessary. Do not launch full C5 Phase Acceptance as a debugging method.


## November 18, 2026 — timeboxed stabilization disposition and continuation

[Follow-up manual focus-repeat #44275565876](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44275565876), candidate `2de4b28aa8869ae9d01330d8f193adf20ed7a9d5`: desktop Chromium **10/10**, touch Chromium **5/10** (zero retries). The five failed touch diagnostic event records show both individual short taps accepted at the same position, separated by **859.4–962.4 ms** between pointer-up events, exceeding the 650 ms touch bound. In those attempts no surface raycast was invoked. Browser long-task entries did not establish a WebGL block *between* the taps. This is a test input-delivery issue for those five failures; it does not prove every possible user-gesture fault is absent.

To avoid burning more time, the original browser test now uses one Chromium `Input.synthesizeTapGesture` call with `tapCount:2` on the **touch project only**, instead of awaiting two separate Playwright `touchscreen.tap()` operations with unbounded scheduling gaps. This drives browser touch input (not DOM-dispatched synthetic pointer events), preserves the real skinned-surface hit and expected UI focus, and asserts two actual accepted touch events + recognized gesture + `skin-hit` + `focus-committed` in the diagnostic stage record. The browser app's 650 ms double-touch limit is unchanged. The desktop trusted native mouse fallback, actual surface-raycast requirements, and background rejection remain unchanged.

**Timebox policy:** run standard Verify and at most one focused diagnostic on this revision. If a browser timing problem remains, file/retain a narrowly scoped follow-up and continue unrelated roadmap work rather than repeatedly dispatching 28-minute full Phase Acceptance. Do not silently mark the flaky browser gate green, disable the test, weaken actual gesture rules, or claim official C5 acceptance without the separately required evidence and owner approval.
