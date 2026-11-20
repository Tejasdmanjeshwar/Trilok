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
