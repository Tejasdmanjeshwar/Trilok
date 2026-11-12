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
