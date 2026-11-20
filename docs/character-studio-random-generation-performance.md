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

A worker implementation is intentionally **not asserted complete**:
there are no measurements identifying which CPU stage dominates, and
transferring an atlas as deeply cloned nested JavaScript number arrays could
double memory and introduce latency. The existing archery worker is unchanged.
A generation worker remains the next step **if** a browser trace demonstrates
CPU-bound JSON parsing or morph evaluation on the main thread. A typed,
transferable numeric format and worker/fallback equivalence need testing
before adopting it.

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
