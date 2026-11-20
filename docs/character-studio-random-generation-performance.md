# Character Studio random generation: performance recovery (in progress)

## Source inspection (2026-11-20)

Base: `main` at `9d32e2a19da304784a0312144c64be47ff3bab26`.
The neutral Studio human bypasses the body/facial atlases. First random generation
activates native MakeHuman modifiers and triggers atlas preparation. Its body
atlas comprises 846 original targets in checksum-verified gzip JSON chunks,
fetched with four-way concurrency. The main thread currently parses JSON
chunks. The anatomical-human loader previously fetched and reparsed the same
OBJ, rig and weights on every full rebuild, followed by fresh skin fitting,
joint calibration and morphology. Atlas loaders already memoize their promises
and retry after failed loads.

These are **source-inspection candidates, not measured dominant costs**. The
owner reported a first-generation delay exceeding one minute, but there is
not yet a before/after browser trace establishing causation.

## Changes on the performance branch

- `AnatomicalTemplate.loadAnatomicalHuman` now prepares pinned immutable
  OBJ/template, rig and weight definitions once per page, with a shared
  in-flight promise. Failed preparation clears the promise for retries.
- Every new character receives an independently cloned BufferGeometry. No
  skeleton, bind inverse, calibrated pose, mutable vertex array or GPU
  allocation is shared. The same existing `bindTemplateToSemanticRig`
  performs the authoritative calibration and skin-weight fitting for each
  new human. The original MakeHuman vertices, indices and morphs are unchanged.
- The body atlas is now prepared in a one-shot module Web Worker. The
  worker calls the *same* source index/chunk loader and SHA-256/decompression
  validation; it packs original number rows into Float64Array for zero-copy
  buffer transfer and terminates after transfer. The main thread owns the
  transferred numeric arrays thereafter. Unsupported/crashed worker paths
  retry through the original main-thread source loader. Concurrent callers
  share one in-flight worker preparation; a rejection clears the promise.
- After the initial neutral model is attached, the Studio schedules
  low-priority atlas preparation via `requestIdleCallback` (timeout 6 s),
  or a delayed callback where unavailable. It uses the exact existing
  `loadBodyAtlas`/`loadFacialAtlas` promises, so a concurrent Generate
  reuses in-flight requests. Failures reset independently in the loaders.
  Preparation is skipped if the page is hidden when the callback runs and
  pending scheduling is cancelled during viewport disposal.
- The existing opt-in `trilok:studio:request-metrics` event now returns the
  last three generation timings in `detail.generations`. Each includes the
  elapsed model-build duration and separate source-cache wait, OBJ clone,
  parse/fetch (when cold), rig/weight work, head/body/facial atlas and
  morphology stage durations. These timers are synchronous wall-time per
  stage, not a full CPU/GPU trace or first-painted-frame measurement.

## Memory ownership and limitations

Immutable source positions, source IDs, rig and weight metadata stay cached for
the page lifetime. Per-generation geometry is deep-cloned before mutation and
disposed with its human. The atlas cache is separately owned by the existing
atlas modules. Existing source checksum and schema validation is preserved.
There is no cross-tab persistent decoded cache; full reload prepares it again.
The transferable atlas's original source number values remain exactly
representable as Float64; converting to Float32 would be lossy and is avoided.

This worker currently covers **body atlas preparation only**, not actual
body/face morphology, skin fitting, or full-character generation. Facial
atlas preparation remains on the main thread. A fuller generation worker
must await measured profiling and independent geometry/rig parity validation.
The existing archery worker remains unchanged. The worker result is a
versioned, one-shot {version:1,type:prepared|error} reply, with owned
Float64Array buffers transferred to the main thread. The worker does not
retain a persistent atlas copy; termination releases its source arrays.
Transfer and fallback outputs are validated against the same source atlas
contract. Browser worker/fallback performance parity remains unmeasured.

## Benchmark and review protocol (required before acceptance)

1. Compare the previous main SHA and the exact candidate PR SHA using the same
   browser/device, seed list and camera, with warm and cold HTTP/cache conditions.
2. Use Playwright Chromium on desktop and mobile/touch emulation. Collect
   Navigation/Resource/Performance timings and main-thread long tasks.
3. Record first, second and third Generate clicks for fixed seeds, reload,
   cold and warm network caches, GPU resource counters and frame cadence.
4. Record wall-clock click to **rendered** character, not just the model-build
   stage. Capture identical screenshots and compare anatomy, skin, rig,
   animation, weapon grips, undo/redo and supersession.
5. Document measurements, environments and trace artifacts from each actual
   run. Do not infer speedup solely from a green CI test.

`pnpm typecheck`, `pnpm test`, `pnpm build`, real Chromium screenshots,
before/after browser measurements and preview publication remain verification
gates. This branch is not proof of a few-second cold start.

No animations, combat code, production deployment workflow or retargeting data
are changed.


## Available instrumented browser measurement

`e2e/studio-generation-performance.spec.ts` records startup wall time,
click-to-next-render durations for deterministic seeds 2694905601, 1729 and
42, bounded diagnostic build stages and individual anatomy resource entries
in `test-results/studio/random-generation-performance-<project>.json`.
This is an evidence collection test, not a performance claim. Run the exact
same test on main and PR head with controlled cold/warm HTTP cache and
document both environments; static source inspection alone cannot establish
a speedup.

## Measured exact-SHA Chromium comparison (2026-11-20)

[Run 44724810054](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44724810054),
base `9d32e2a19da304784a0312144c64be47ff3bab26`,
candidate `3e0b3f3a3d9c8a6f8c19a8d506d085121c84fe49`.
Both desktop and Pixel 7 touch-emulated Chromium comparison jobs passed.
One before/after sample per seed/viewport on the same respective runner
using identical Playwright test code, localhost Vite static bundles, and
pinned sources. No performance throttling or production-network emulation
was applied. Times are wall clock to two animation frames following model
completion; they do not include an independent GPU execution timer.

| Scenario | Desktop base (ms) | Desktop candidate (ms) | Touch base (ms) | Touch candidate (ms) |
| --- | ---: | ---: | ---: | ---: |
| Initial Studio ready | 943 | 997 | 564 | 595 |
| First Generate seed 2694905601 | 6230 | 2728 | 3811 | 2966 |
| Second Generate seed 1729 | 1866 | 2036 | 1066 | 1043 |
| Third Generate seed 42 | 1987 | 1955 | 886 | 1082 |
| Warm page reload ready | 1955 | 3579 | 1454 | 1218 |
| First Generate after warm reload | 6589 | 3971 | 3454 | 2966 |

First-generation speedup is 2.28× on desktop and 1.28× on touch emulation
in this run. Subsequent generations do not consistently improve. Desktop
warm page reload ready became **slower** (1955 → 3579 ms) on this sample;
do not infer repeatable regression or reliability from a single run.
The production-reported minute-long first generation was **not reproduced**.
Cold-network benchmarks, repeat runs, CPU/memory profiles, measured GPU work,
and independent real devices remain outstanding.

The candidate's measured **actual body-morph main-thread stage** still takes
1608 ms on the first desktop seed and approximately 1518–1530 ms on subsequent
desktop seeds; on touch emulation, 886 ms first and 777–787 ms subsequent.
The first body atlas wait measured 247 ms desktop, 1631 ms touch.
Anatomical source instantiation and skin fitting measured ~234 ms on the
first desktop seed; generation does not skip per-character calibration.
These are staged browser measurements, not a full main-thread long-task
trace, but demonstrate that atlas loading is only part of the cost and
**the main-thread responsiveness requirement is not fully met**.

Desktop and touch screenshot pairs for deterministic seeds 2694905601,
1729 and 42 are in the run's
`studio-generation-desktop-chromium-3e0b3f3...` and
`studio-generation-touch-chromium-3e0b3f3...` artifacts.
Direct RGB pixel comparison at identical screenshot dimensions found
all differing pixels (>5 channel units) localized to the **build SHA text
at the top of the viewport** (desktop bbox x=840–892, y=114–121;
touch x=883–1019, y=172–194). The character and viewport pixels are
otherwise identical across all three seeds in each browser project.
This is strong rendered equivalence evidence for those seeds, but does
not substitute for full C6.3 pose/equipment/animation regression tests.

## Next optimization barrier

To satisfy responsiveness rather than only wall-time improvement,
profile and isolate the expensive `MakeHumanBodyController.apply` path,
especially its synchronous body target accumulation, source-to-render
mapping, pose-sensitive joint fitting and geometry diagnostics.
Move only confirmed independent numeric work behind a shared typed worker
contract; retain authoritative source precision and morphology algorithms.
Per-character skeletal fitting must remain anatomy-dependent. Repeat
visual/determinism tests, collect long tasks, verify memory overhead, and
measure actual device cold starts before considering acceptance.

## Owner-shareable first-generation timing diagnostics (PR #120 follow-up)

The Generate panel now exposes **Copy timing report**. This works during a
pending generation and after it completes or fails. The JSON includes the
first attempt and the four most recent later attempts (first is never
discarded), exact build SHA, a reproducible seed, per-stage wall time,
currently pending stage, bounded browser long-task observations, first-party
asset resource loading durations / decoded sizes, Studio frame/GPU counters
where available, and browser/network information. It is collected locally
and is **never uploaded or stored automatically**. If clipboard permissions
are unavailable, a selectable read-only text area contains the same report.

To isolate the >60 second owner-specific cold-first-generation delay:
open a fresh development preview session; go to Generate; perform the first
Random character action, allow it to finish or use Copy timing report if it
remains pending; then generate again one or two times and copy the updated
report into the engineering conversation. Preserve the exact SHA label.
Do not paste other application logs, cookies, tokens, or private URLs.
Resource entries include **pathnames only**, not full URLs or query tokens.
Long-task sampling is best effort (only browsers supporting the observer);
missing entries do not mean the main thread was responsive.

Stage `source` encompasses verified anatomy loading and calibrated rig
generation, and `source:*` details overlap it; `body-atlas`,
`body-morph`, `facial-atlas`, and `facial-morph` remain individually
reported. The new `finalize` stage covers pose setup and viewport swap.
The attempt duration is click-to-Generate resolution, not independent GPU
completion. No generator values, render geometry, source assets, or
authoritative gameplay mechanics are changed by instrumentation.
