# C2.5 — Anatomical validation, pose matrix and C3 contract gate

**Status:** In progress; this document is not a claim of full C2 acceptance.
This phase may close only after the exact accepted commit has passing Fast CI and
manual C2 Phase Acceptance, actual inspected desktop/touch screenshots, performance
measurements, geometric outlier adjudication and updated Issue #15 evidence.

## Source of truth and implementation slice

Starting `main`: `be949d92913ddf4dbe860acc0dc2d45036e55db8`
(PR #32, completed C2.4). Versioned data-driven diagnostic definitions live in
`apps/web/src/characters/geometry/AnatomicalPoseMatrix.ts`. Every pose has a
stable identifier, expected anatomical behavior, targeted region and camera
views, explicit C1 role/motion targets, geometric invariant IDs (descriptions),
and separate **visual** acceptance criterion. Existing C2 laboratory pose IDs
remain stable for browser automation; additional pose buttons are generated
from the shared matrix. This is not C3 morphing or a new editor.

The resolver fails closed on missing/ambiguous C1 roles, unsupported freedoms,
duplicate commands and out-of-range target angles. AnatomicalFK still owns
calibrated local axes, fixed DOF application order and rest restoration.
The supported matrix includes bilateral, isolated unilateral, asymmetrical,
proximal + distal limb, finger/thumb, head/neck/jaw and combined whole-body
diagnostics. `tests/character-c2-5-pose-matrix.test.ts` evaluates the *pinned
official CC0 OBJ + skeleton + source weights*, not a schematic avatar. The test
uses Three.js CPU skinning, compares duplicate source vertices across UV seams,
evaluates finite and bounded positions, verifies target-order deterministic
replay, neutral recovery, original topology/vertex identity and unchanged
inverse bind matrices.

### Interpretation and limitations

The headless test deliberately **does not** accept appearance using a global
strain threshold: earlier C2.4 source-patch local edge outliers reached 531.9%
(shoulder), 496.0% (hip/groin), 101.5% (isolated knee) and 138.8% (jaw).
These are *single-edge* outliers, not visibly damaged surface percentages.
Investigate source scale, affected area, absolute distance, p95/RMS, silhouette,
self-intersections and plausible joint range before deciding whether to change
skin weights. Preserve the existing C2.4 source-fidelity, mutation, hand,
shoulder, wrist and real-body tests. Do not weaken them to make this matrix pass.

### Required end-of-phase validation still outstanding

- Review every relevant full-body/close-up rendered view (front, rear, side,
  bilateral axilla, shoulders, elbows, wrists/hands, hips/groin, knees, ankles,
  head/jaw, combined poses) at desktop and touch viewports.
- Measure phase timings for asset fetch, OBJ parse, joint calibration, source
  weight processing, shoulder influence fit, instantiation, pose application,
  CPU skinning diagnostics, GPU FPS and construction/disposal cycles; note
  unavailable browser memory metrics explicitly rather than approximating.
- Adjudicate localized edge-length and volume/area deviations in anatomical
  context, plus reliable self-intersection checks; record any justified blockers.
- Execute manual **Phase Acceptance → phase C2** on exact candidate SHA;
  download and **inspect** screenshot artifacts. Confirm required Fast CI,
  full replay and compiled identity first; rerun if candidate changes.
- Record resulting run URLs, tested SHA, photographs/render observations,
  quantitative performance, unresolved limitations, final acceptance verdict
  and separate Cloudflare deployment identity in tracking Issue #15.

## C3-safe anatomy boundary (design contract; implementation not yet complete)

These invariants define the **proposed** C3 adapter contract and require
validation before C2 completion:

| Contract | Existing C2 field or ownership | C3 requirement |
|---|---|---|
| Semantic identity | `spike.graph.joints[].id` | Preserve C1 IDs, parent hierarchy and semantic roles |
| Original vertex numbering | `template.sourceVertexIds`, `template.sourcePositions` | Keep one source-space value for each original vertex; UV duplicates map to the same source ID |
| Surface topology and UV | `template.geometry.index`, `geometry.attributes.uv` | Preserve index meaning and UV seams unless creating a new explicitly versioned asset |
| Space | `conversionMetersPerSourceUnit`, `sourceOrigin` | Y-up, +Z forward, meters in C1 space, unit root/skeletal scale |
| Landmarks | `makeSourceLandmarks` calibrated from source indices | Regenerate after rest-mesh morphology; do not move the posed mesh alone |
| Joint frames | `AnatomicalFK.frames` captured at construction | Recompute after anatomical rest proportions/landmark changes |
| Bind transforms | `calibrateHumanBones`, `skeleton.calculateInverses()` | Rebind inverse matrices after rest changes, before first posed frame |
| Skin correspondence | CC0 source weights; four normalized GPU influences | Re-evaluate source mapping and compaction for morph-modified rest geometry; preserve deterministic transfer |
| Rest ownership | `sourcePositions` + template geometry | Treat pinned rest source as immutable; rebuild new owned geometry rather than mutate canonical source |
| Bounds/collision | Current visible geometry; no finalized cut seams | Recompute bounding volumes and downstream proxies after shaping; no claim of sever-ready topology |
| Lifecycle | Owned `geometry`, `material`, `skeleton`; idempotent disposal | Rebuild atomically; dispose replaced owned resources and cancel stale async loads |
| Failure reporting | Throws on malformed sources, missing DOFs and bad skin | Surface machine-readable diagnostic results in a future versioned bake schema |

The implemented read-only `AnatomicalMorphologyContract.ts` exposes
`ANATOMICAL_MORPHOLOGY_CONTRACT_VERSION = 1` and
`inspectAnatomicalMorphologyBaseline(human)`. It validates current original
source numbering, indexed triangles, seam position/weight identity, four
normalized influences, semantic C1 bone alignment, inverse bind validity,
unit root scale, source-unit conversion and canonical Y-up/+Z conventions;
returns bounded immutable metadata without mutating a posed rig or authoring
any C3 shapes. An explicit error code differentiates contract failures.
The headless real-source test corrupts a GPU skin weight to ensure the audit
fails closed; it then restores the weight and verifies repeatability.

Do **not** treat this read-only baseline as a completed *serialized* C3
morphology editing/bake interface or evidence that geometry is safe for
arbitrary procedural shape changes. No body sliders, face shaping, archetype transforms, morphological
baking, new combat actor, or C4 editing was introduced here.

## CI policy

Run `pnpm typecheck`, `pnpm test` (including 1,000 combat replay seeds),
`pnpm build`, and `node scripts/verify-build-identity.mjs` for each slice.
The manual Phase Acceptance workflow includes actual Chromium desktop/touch
tests and screenshots, which require direct review. Never close C2 based only
on Fast CI or generated images.

## C2.5 performance/lifecycle instrumentation slice (not a benchmark verdict)

The browser-only CC0 importer exposes an optional typed `AnatomicalTimingSink`.
It uses the browser's monotonic `performance.now()` and records actual
wall-clock durations for OBJ network/text fetch, body-group OBJ parsing,
skeleton/weights network fetch, JSON parsing, semantic FK calibration,
shoulder motion envelope sampling, four-weight source-influence fitting,
and total character instantiation. The callback is opt-in; it does not
change generated geometry, FK or the public CC0 asset hashes.

Character Lab's expandable *measured timings* diagnostics additionally
samples actual FK pose application, bounded 256-vertex Three.js CPU skinning,
JS render submission time and median requestAnimationFrame interval.
These values are **environment-specific observations**: RAF interval is not
GPU execution time or guaranteed FPS; JS render submission is not GPU frame
time; browser privacy restrictions may prevent reliable process/GPU memory
measurement. Do not invent a memory value or declare a mobile performance
budget from a simulated viewport.

The manual C2 Phase Acceptance Playwright matrix includes a desktop/touch
scenario that records three import observations and switches the CC0 and
implicit prototypes three times, asserting the single live Bone Inspector,
correct imported CC0 source and hand/jaw direction sentinels. It logs the
empirical timing text to the workflow output and captures the panel as an
artifact. This is *observability*, not proof of no GPU leaks: browser GPU
resource residency is opaque and requires separate inspection. Headless
idempotent geometry/material lifecycle assertions remain mandatory.

When screenshots and empirical timings are available, record device/viewport,
browser version, first versus cached resource fetch, medians/range across
runs, and whether sampled frame interval was reduced-motion/throttled.
No unmeasured target or inferred optimization is accepted. Candidates for
future worker/caching investigation include OBJ parsing, source-weight JSON
processing, pose-envelope skin compaction and geometry regeneration; prioritize
only after production measurements identify meaningful costs.

## C2.5 numerical whole-surface audit (non-visual evidence)

`AnatomicalGeometryAuditor` snapshots the indexed pinned CC0 render surface
and original source edge correspondence at **rest**; after authoritative
AnatomicalFK, it samples all rendered vertices using
`SkinnedMesh.getVertexPosition`. It measures global rendered triangle area,
absolute closed-surface signed-tetrahedron volume, area and volume ratios
from rest, source-edge RMS/p95/worst-relative stretch for original edges at
least 3mm, worst absolute displacement and original source edge IDs.
It reports degenerate and nonfinite triangles and does not mutate geometry.
The 3mm cutoff is for *relative edge strain conditioning only*, not an
unspoken removal of small triangles from surface area or volume.

These diagnostics run on selected high-risk matrix poses in ordinary Vitest.
A deliberately misbound wrist patch demonstrates that global statistics
change even when the corrupted weights remain normalized, and restoring
weights must recover the original metrics. Source-region-specific C2.4
thresholds and mutations remain in their original tests.

**Limitations:** absolute enclosed volume from oriented triangles is
interpretable for a closed, consistently wound surface without self-overlaps.
LBS can invert/fold faces and introduce self-intersections without causing
a failure of finite area or volume. Whole-body volume may mask local muscle
and joint collapse. The computed values are descriptive evidence and are
**not** a certified self-intersection, local cross-sectional preservation,
corrective-shape or anatomy quality test. Compare the reported numbers to
rendered axilla, hip/groin, knee, jaw and wrist views before adjudicating any
blocker. Do not invent a global volume/strain pass threshold after the fact.

## Viewer-first Character Lab usability improvement (C2.5 diagnostic interface)

The original lab put the entire 54-pose matrix and all region cameras *above*
the Three.js canvas. Repeated scrolling made visual evaluation unnecessarily
difficult. The revised lab keeps the character viewport immediately below a
compact pose and camera toolbar, with quick poses and camera shortcuts, a
searchable, region-filtered pose library in a dismissible dialog/mobile sheet,
and a collapsible Bone Inspector and advanced geometry overlays.

The actual `ANATOMICAL_POSE_MATRIX` remains authoritative; control labels,
filters and modal presentation are defined independently in
`CharacterLabControls.ts`. The selector and browser invoke the exact same
`AnatomicalFK` target resolver used by previous diagnostic buttons.
All 54 supported poses, anatomical camera IDs, optional source switching,
Bone Inspector semantic IDs and deterministic screenshot camera states remain
accessible. Old `[data-pose]` IDs remain on generated library buttons for
diagnostics; test automation uses the user-facing selects to avoid requiring
the library to stay open when reviewing a pose.

Expected UX acceptance: the 3D viewer is visible without scrolling through
pose lists on desktop and narrow touch screens; the pose search and region
filter are keyboard-usable; the library closes with Escape or a close button,
restores focus, and uses a focus loop; selected pose remains visible outside
the dialog; the inspector remains available without blocking the viewport.
The body does not scroll while the pose browser is open. Browser screenshots,
touch interaction and accessibility checks must be inspected as part of the
manual C2 phase gate; a passing fast PR CI alone does not prove visual polish.

No C1 semantic contract, FK angles, skin weights, geometry, combat behavior or
C3 morphology features were changed for this UI-only slice.

### C2.5 viewer-first follow-up — sidebar pose/camera placement

Owner feedback identified that native pose/camera dropdowns positioned in the
stage toolbar could cover the actual rendered character while expanded,
especially on smaller screens. The pose selector, camera selector, browse/reset
actions, and quick pose shortcuts now live in the **same dedicated diagnostics
sidebar as Display & Source**, outside the WebGL viewport and outside its
clipping/stacking context. The stage itself contains the full unobstructed
character preview and minimal passive pose/view labels plus quick camera
buttons. No FK, geometry, source weights, or C1 semantic definitions changed.

Desktop uses adjacent preview/sidebar columns. At tablet/phone widths the
viewport is displayed first, followed by the controls; a compact sticky
preview keeps the character visible while operating controls below it.
The generated searchable pose browser still works on mobile as a purposefully
invoked full-screen-overlay sheet. Existing `#pose-select`,
`#view-select`, quick pose IDs, aria labels, source select and inspector
interfaces are preserved.

An additional desktop/touch Playwright check verifies the sidebar selection
controls are physically non-overlapping with the WebGL viewport while the
pose and camera update; it captures layout screenshots. This is a UI
integration regression gate, not a replacement for the full C2 Phase
Acceptance and human screenshot review.
