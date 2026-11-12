# C2 anatomical source import — first implementation slice

**Status:** Experimental, does not satisfy C2 anatomy/animation acceptance. Builds import a pinned **MakeHuman bundled core** source asset, and the isolated C2 lab renders it using the existing C1 skeleton with provisional semantic skin transfer. No combat, editor, baking or C8 cutting changes.

## Pin, licensing and provenance

- Original upstream: [makehumancommunity/makehuman](https://github.com/makehumancommunity/makehuman)
- Immutable upstream commit: `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`
- Exact file: `makehuman/data/3dobjs/base.obj` (1,749,303 bytes)
- Full original asset SHA-256 (verified from GitHub Actions workflow run 43180257937): `8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c`; enforced on every web build.
- Git object blob SHA-1 from upstream GitHub contents: `d26635e9326e3cca30778fd7b9c00062b03cce09` (checks over canonical `blob <length>\\0<bytes>` object)
- Human-readable manifest: [assets/makehuman-core.json](../assets/makehuman-core.json)
- Rights: original MakeHuman bundled core geometry is explicitly CC0 under upstream [LICENSE.md](https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/LICENSE.md); the bundled `base.mhclo` independently includes a CC0 attribution notice listing Data Collection AB, Joel Palmius and Jonas Hauquier. This approval applies only to core bundled graphical assets, **not** AGPL MakeHuman application logic nor third-party contributed libraries or asset repositories. No MakeHuman code is imported.
- Immutable URL: `https://raw.githubusercontent.com/makehumancommunity/makehuman/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/makehuman/data/3dobjs/base.obj`
- **Integrity:** `node scripts/fetch-makehuman-core.mjs` verifies byte count and Git blob SHA-1 **before** publishing the asset into `apps/web/public/anatomy/`; it verifies the recorded SHA-256 in `assets/makehuman-core.json` (in addition to the Git blob hash) and logs the measured digest. Failing any checksum blocks the production build. Development environments without network may use a previously verified cache. The downloaded 1.75 MB asset is ignored in Git and copied into Vite output.
- License obligations: CC0 permits commercial use, modification and redistribution; attribution is retained voluntarily here, with the raw file unmodified and the runtime geometry derived in-memory. A separate policy/legal review is still advised before release.

## What the importer actually does

`AnatomicalTemplate.ts` reads bounded OBJ `v`, `vt`, `g` and `f` records, imports **only the `body` group** from official MakeHuman core (excludes its visually overlapping helper/collision mesh and facial accessory groups), triangulates polygon faces, preserves every original `v` index via the `sourceVertexIds` mapping, duplicates render vertices **only** for UV-corner differences, computes smooth seam-consistent vertex normals from the original source indices, and reports connected components, boundary and non-manifold edges from *source topology* (not from UV duplicates). This provides stable correspondence for future MakeHuman morph delta targets and cut-zone analysis.

Coordinates: importer assumes upstream Y-up/+Z-forward; converts source units explicitly into an approximately 1.88 m baseline using **included body-group** Y bounds (not helper bounds). Center X/Z and ground Y are baked into CPU geometry, **without scaling the scene root or skeleton**. This is a *provisional* head-to-ground alignment, not calibrated anthropometry: landmark localization and source orientation need visual validation. The exact source dimensions and polygon/UV counts are reported by parser/lab on real source input after build. No source vertex IDs are dropped or renumbered; source faces may produce multiple disconnected shells (eyes/teeth), and diagnostic component counts must not be misrepresented as a single watertight body.

Skinning uses actual Three.js `SkinnedMesh` and C1 `SemanticCharacter` joint/bone lookup. A reproducible distance-to-semantic-limb projection assigns at most four finite normalized weights per vertex. **This is not validated anatomical weighting**, and especially does not solve finger identity, axilla deformation, correctives, or head/jaw deformation. The C1 human descriptor's coincident/underspecified finger chains must be calibrated rather than masked by mesh cosmetics.

The original implicit surface remains selectable to compare failures. The lab adds overhead, T-pose, hip abduction and neck poses, an explicit source indicator, skeleton overlay, wireframe, and source topology statistics. Existing animation gameplay/collision remains unmodified.

## Resource and performance boundaries

- Import is bounded at 4 MB OBJ input / 100,000 source vertices, avoids dependencies, caches the downloaded immutable source at build time, and uses a single parsed GPU geometry per loaded lab character. Replacing the active lab surface disposes its geometry, material and Skeleton through the existing owned-resource lifecycle; UV/source ID mapping is retained for future morph/face correspondence.
- Temporary parsing creates full source text plus vertex/face arrays and several topology maps. The initial parser/weight transfer runs on the main thread and is a **feasibility implementation only**. Later worker/cancellation, compact indexed pre-baked representations, LOD, profiling, and mobile memory budgets are required before Studio interaction.
- Unit tests cover deterministic face order, UV seam remapping, topology diagnostics, weights, bounds, disposal, and malformed input. Chromium checks require **imported** geometry rather than silently passing on the fallback; screenshots collect neutral, overhead, shoulder, crouch and wireframe desktop/touch views. These screenshots require explicit human review.
- First workflow run [43180257937](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43180257937) completed successfully: TypeScript, 37 Vitest files / 216 tests, build-time asset hash, 12 desktop+touch Chromium checks, and build identity. A 10-image screenshot artifact was downloaded for inspection. **Initial page-level screenshots were inadequate:** desktop clipped the character's lower legs below the browser fold and mobile screenshots showed only the long header/controls and no character. The e2e suite was corrected to capture the **actual WebGL viewport** and the camera was moved closer. The first screenshot set does not constitute anatomical quality signoff; the revised viewport screenshots require a second actual review. All acceptance claims remain provisional pending that review.

## Gates remaining before calling C2 complete

1. Verify full source geometry statistics, source forward orientation, polygon groups, actual source SHA-256 and selected source topology (especially lips, eyelids, palms, 5 individual fingers, groin, axillae).
2. Calibrate actual bind-pose anatomical landmarks against C1 bone positions and separate digit joints. Import/retarget correctly weighted MakeHuman rig data or design anatomy-aware smooth weight painting with twist chains and pose corrective shapes. Current heuristic weighting is for preview, **not production**.
3. Review full deformation images with face/hand and underarm closeups and objective unacceptable artifact descriptions, resolve bind-pose errors, and add pose-space correctives/UV tangent validation.
4. Author **metadata-only** candidate sever boundaries from validated source edge loops, source segment ownership and injury anchors. Do **not** slice or dismember runtime meshes yet.
5. Profile parsing/rendering and regeneration/cleanup on low-end touch and desktop; evaluate compact asset conversion and future morph targets. Verify 1,000-seed combat regression plus normal D14 e2e tests.
6. Do not unlock C3 parameter customization, C4 Studio, or replacement of `AnimatedWarrior` based on a recognizable neutral face alone.

## Body-only topology and visual review (2026-11-12)

[GitHub Verify run 43182529817](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43182529817) passed TypeScript, **37 Vitest files / 217 tests**, pinned SHA-256 production build, **12 desktop and mobile Chromium tests**, and built-identity verification. Browser logs reported for the **body group alone**:

| Metric | Incorrect all-group import | Corrected body-only import |
| --- | ---: | ---: |
| Rendered vertices (UV seam split) | 21,833 | 14,517 |
| Triangles | 36,972 | 26,756 |
| Source `v` records retained (for morph indexing) | 19,158 | 19,158 |
| Connected source-face components | 154 | **1** |
| Topological boundary edges | 784 | **0** |
| Non-manifold edges (>2 incident triangles) | 0 | **0** |
| Source topology height (Y units, before metric conversion) | 16.946 (includes helpers) | **16.659 (body only)** |

The body-only surface is a single connected closed manifold by the tested *edge-incidence* definition, not yet by a complete self-intersection/solid-winding test. Measured render geometry is materially better than the earlier capsule/implicit mannequin. **Excluding helper surfaces** fixed an observed floor-length skirt artifact. The additional e2e checks now reject helper import regressions by asserting the real source has one topology component and zero open/non-manifold edges on both device projects.

**Actually inspected, not just collected:** WebGL viewport screenshots (desktop and simulated mobile touch) for neutral A-like pose, shoulder raise, arms overhead, deep crouch and wireframe/skeleton overlays. Neutral now has distinct feet, individual fingers, recognizable facial features and visible hip/leg anatomy. The skirt artifact is absent. The shoulders/elbows and crouch are visibly deforming without an obvious detached shell in these views. These images are *engineering review evidence*, not professional deformation signoff: shoulder elevation/wrist twist silhouette and groin folding still need close frontal/side/back inspection; hand grip poses do not prove finger articulation; full materials/face/eye topology, corrective shapes, robust weight painting, severing loops and performance baselines are **not** validated. Keep issue #15 open and do not enable C3/C4 or swap D14 actors.

**Repeatable screenshot review:** The CI workflow uploads the `c2-pose-screenshots` artifact for 14 days. This review used the viewport-only screenshots from run 43182529817, not the earlier unusably cropped full-page captures. Future releases need more complete pose/device/budget gates.

## C2.4 targeted skin-weight ownership audit (in progress)

The pinned 163-bone MakeHuman source rig contains intermediate articulated segments absent from the C1 semantic graph. An explicit cross-check of the source hierarchy and skin-weight tables found three segment-boundary assignment errors: `shoulder01` weights were driving upper-arm elevation despite the source being parented directly to `clavicle`; `lowerleg02` weighted shin vertices to the C1 ankle; `foot` weighted foot surface to the C1 forefoot. The source `toe*-1` metatarsal/forefoot segment was also assigned to the distal toe joint. For C2.4, retarget these to C1 clavicle, knee, ankle and foot respectively, while retaining both sides, the original source vertices, UV splits, four normalized influences and the existing calibrated FK frames.

This is a targeted semantic skin-ownership correction, not independent twist-bone implementation or full corrective deformation. `upperarm01/02` and `lowerarm01/02` still collapse to shoulder and elbow joints respectively. The shoulder, hip/groin, wrist/palm, forearm twist and facial/jaw silhouettes still need focused actual WebGL visual assessment before any C2.4 completion claim; the full combined stress-pose matrix is reserved for C2.5.

## C2.4 forearm skin twist distribution — incremental slice

The imported source has distinct `lowerarm01.L/R` and `lowerarm02.L/R` weighted regions. Previously both became a single C1 elbow skin transform, so full pronation rotated the entire forearm abruptly from the elbow. The C2.4 lab adapter now optionally installs **two skin-only sibling references** at the calibrated elbow (one per side). The proximal `lowerarm01` vertices follow elbow flexion and parent shoulder movement without forearm-axis rotation; distal `lowerarm02` vertices follow the full semantic elbow transform, with existing source blend weights interpolating across the seam. Wrist and hand remain children of the original C1 elbow and receive full rotation. The original source vertex IDs, UVs, C1 bone mapping, four normalized GPU weights, bind matrices and deterministic FK remain intact. The synthetic C1 prototype does not add helpers.

This is a *two-reference linear blend skinning compromise*, not independently simulated radius/ulna bones, validated muscle bulging, dual-quaternion skinning, or proof of visual volume quality. Possible candy-wrapper collapse, wrist creasing and hand intersection require close actual CC0 browser-render review before final C2.4 acceptance. C2.5 retains the complete combined-pose stress matrix.

## C2.4 shoulder / axilla skin connector (incremental)

The verified CC0 source hierarchy is `clavicle -> shoulder01 -> upperarm01`. Per side, `shoulder01` has 569 weighted vertices (sum of weights 43.98), with 396 overlapping `clavicle`, 514 `upperarm01`, and 491 `spine01`. Collapsing all `shoulder01` weights onto the C1 clavicle prevented the intermediate shoulder/axilla skin from following humeral elevation. This slice creates two additional skin-only connectors with their original shoulder01 head landmarks, preserving the calibrated semantic shoulder's position and parent. The connector's rest-local quaternion follows half the current semantic shoulder rest-relative orientation, so original source weights provide the blend. The exact 0.5 split is a limited engineering approximation, **not** an anatomically calibrated scapulohumeral rhythm. The connector is not a C1 semantic bone and cannot alter authoritative gameplay; neutral transforms and inverse binds remain preserved. Synthetic diagnostic meshes do not add these helpers.

Regression gates cover source bone ordering, source-index weight ownership, four normalized weights, original geometry/UV/index/vertex ID invariance, helper placement, finite inverse binds, deterministic FK, bilateral rest recovery and independence from earlier C2.3 hand/jaw mechanics. Re-check actual 3D poses after deployment (front/back overhead, 1.5-radian shoulder elevation and forward-flexion, underarm close-ups): it is not yet proven that the shoulder avoids collapse, pinching or self-intersection. Reassess the partial motion fraction using measured rendered outcomes rather than claiming AAA-quality volume preservation. The complete Phase Acceptance run remains reserved for C2.5.

## C2.4 elbow bend and wrist skin-band blending (incremental)

The pinned CC0 source independently weights `upperarm02`, `lowerarm01`, `lowerarm02`, `wrist`, and metacarpals. Each side has 207 source vertices shared between upperarm02/lowerarm01, 288 shared between lowerarm01/lowerarm02, and 176 shared between lowerarm02/wrist. Previously, proximal lowerarm01 skin followed full elbow flexion while the upper arm was unbent, concentrating the skin fold at the elbow. The existing *render-only* proximal forearm reference now receives 50% of elbow flexion (and no axial pronation); the original semantic elbow still receives the complete bend and twist. Original source weights determine skin interpolation over the region. There is no extra authoritative gameplay joint.

The CC0 `wrist.L/R` source region (248 vertices per side) previously mapped directly to the full C1 wrist transform alongside the metacarpals. Two additional presentation-only wrist skin bridges are placed at the calibrated wrist bind centers, parented as wrist siblings so existing hand/finger FK remains unchanged. Official `wrist` weights now follow half of the rest-relative semantic wrist quaternion; the metacarpal/palm and finger chains retain full wrist flexion/deviation. All original source vertex IDs, indexed triangles, UV seams and normalized four-influence skin weights are retained. Bind inverses are calculated after calibration and deterministic rest-pose commands restore each helper.

The 50% blend in each region is a **provisional limited linear-blend skinning approximation**, not anatomically measured muscle-volume correction or proof of improved real renders. Potential elbow fold collapse, candy-wrapper twist, wrist narrowing and finger-palm intersections require actual front/side/close-up WebGL review. Do not equate unit-test success with visual signoff; the complete Phase Acceptance Chromium matrix belongs to C2.5.

## C2.2 experimental official CC0 rig/weight retarget

The follow-up branch `feat/c2-2-official-rig-weights` adopts two additional data-only
files from the **same immutable upstream MakeHuman core revision**
`a8bc2d54ff0ac92e78ff71431b1023eda42bf482` as the imported body mesh:

| Source path | Upstream Git blob SHA-1 | Raw bytes | Upstream license field |
| --- | --- | ---: | --- |
| `makehuman/data/rigs/default.mhskel` | `b02cbecae00143856410d7561adf006d83bf9b3e` | 117,790 | CC0 |
| `makehuman/data/rigs/default_weights.mhw` | `66185806afacf87749be8e5cf6dbf66496b2a6b0` | 897,521 | CC0 |

Source copyright: Data Collection AB, Joel Palmius, Jonas Hauquier.
The fetch script validates immutable Git blob hashes, exact file sizes and CC0
metadata before serving the data. This is **licensed data**, not MakeHuman
AGPL application logic. It is fetched at build time without modeling tools.

`OfficialHumanRig.ts` performs anatomical source vertex-ID weight transfer onto
UV-split imported render vertices, collapses source twist chains onto existing
C1 semantic roles, resolves hand finger IDs by explicit left/right module path,
normalizes and truncates to four influences, and calibrates joint positions from
source vertex-index landmark averages in the same meter-space conversion as
the imported mesh. Skeleton inverse bind matrices are recalculated after
calibration. No C1 IDs, rig schema, gameplay authority or D14 actors change.

**Known quality limitations:** This is an engineering retarget, not complete
production-grade weight painting. MakeHuman's detailed 163-bone default rig
does not map 1:1 to C1's simplified source-neutral skeleton. Source twist
chains, facial controls, metacarpals and toe chains are reduced to fewer
degrees of freedom; finger rotations need measured local-axis calibration.
Incomplete source coverage is reported and currently guarded by the loader,
which falls back to an explicitly labeled diagnostic prototype if necessary.
Deep crotch, elbows, shoulders, jaw and grip silhouettes require screenshot
review. The template must not be promoted to the live arena.

Browser stress-pose coverage is extended with fist, approximate two-handed
grip, wrist and jaw poses, front/side/rear camera views, and screenshot
capture. E2E screenshot existence is **not** proof of acceptable deformation.
The issue #15 anatomical quality gate stays open until measured source coverage,
visual signoff, performance baselines, and all CI checks are verified.
