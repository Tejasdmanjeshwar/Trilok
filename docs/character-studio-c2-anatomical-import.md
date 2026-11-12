# C2 anatomical source import — first implementation slice

**Status:** Experimental, does not satisfy C2 anatomy/animation acceptance. Builds import a pinned **MakeHuman bundled core** source asset, and the isolated C2 lab renders it using the existing C1 skeleton with provisional semantic skin transfer. No combat, editor, baking or C8 cutting changes.

## Pin, licensing and provenance

- Original upstream: [makehumancommunity/makehuman](https://github.com/makehumancommunity/makehuman)
- Immutable upstream commit: `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`
- Exact file: `makehuman/data/3dobjs/base.obj` (1,749,303 bytes)
- Git object blob SHA-1 from upstream GitHub contents: `d26635e9326e3cca30778fd7b9c00062b03cce09` (checks over canonical `blob <length>\\0<bytes>` object)
- Human-readable manifest: [assets/makehuman-core.json](../assets/makehuman-core.json)
- Rights: original MakeHuman bundled core geometry is explicitly CC0 under upstream [LICENSE.md](https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/LICENSE.md); the bundled `base.mhclo` independently includes a CC0 attribution notice listing Data Collection AB, Joel Palmius and Jonas Hauquier. This approval applies only to core bundled graphical assets, **not** AGPL MakeHuman application logic nor third-party contributed libraries or asset repositories. No MakeHuman code is imported.
- Immutable URL: `https://raw.githubusercontent.com/makehumancommunity/makehuman/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/makehuman/data/3dobjs/base.obj`
- **Integrity:** `node scripts/fetch-makehuman-core.mjs` verifies byte count and Git blob SHA-1 **before** publishing the asset into `apps/web/public/anatomy/`; it prints an additional computed SHA-256 for recording with CI artifacts. Failing the checksum blocks a production build. A fixed SHA-256 value in the manifest is pending CI source retrieval; do not represent it as already recorded. Development environments without network may use a previously verified cache. The downloaded 1.75 MB asset is ignored in Git and copied into Vite output.
- License obligations: CC0 permits commercial use, modification and redistribution; attribution is retained voluntarily here, with the raw file unmodified and the runtime geometry derived in-memory. A separate policy/legal review is still advised before release.

## What the importer actually does

`AnatomicalTemplate.ts` reads bounded OBJ `v`, `vt` and `f` records, triangulates polygon faces, preserves every original `v` index via the `sourceVertexIds` mapping, duplicates render vertices **only** for UV-corner differences, computes smooth seam-consistent vertex normals from the original source indices, and reports connected components, boundary and non-manifold edges from *source topology* (not from UV duplicates). This provides stable correspondence for future MakeHuman morph delta targets and cut-zone analysis.

Coordinates: importer assumes upstream Y-up/+Z-forward; converts source units explicitly into an approximately 1.88 m baseline using observed Y bounds. Center X/Z and ground Y are baked into CPU geometry, **without scaling the scene root or skeleton**. This is a *provisional* head-to-ground alignment, not calibrated anthropometry: landmark localization and source orientation need visual validation. The exact source dimensions and polygon/UV counts are reported by parser/lab on real source input after build. No source vertex IDs are dropped or renumbered; source faces may produce multiple disconnected shells (eyes/teeth), and diagnostic component counts must not be misrepresented as a single watertight body.

Skinning uses actual Three.js `SkinnedMesh` and C1 `SemanticCharacter` joint/bone lookup. A reproducible distance-to-semantic-limb projection assigns at most four finite normalized weights per vertex. **This is not validated anatomical weighting**, and especially does not solve finger identity, axilla deformation, correctives, or head/jaw deformation. The C1 human descriptor's coincident/underspecified finger chains must be calibrated rather than masked by mesh cosmetics.

The original implicit surface remains selectable to compare failures. The lab adds overhead, T-pose, hip abduction and neck poses, an explicit source indicator, skeleton overlay, wireframe, and source topology statistics. Existing animation gameplay/collision remains unmodified.

## Resource and performance boundaries

- Import is bounded at 4 MB OBJ input / 100,000 source vertices, avoids dependencies, caches the downloaded immutable source at build time, and uses a single parsed GPU geometry per loaded lab character. Replacing the active lab surface disposes its geometry, material and Skeleton through the existing owned-resource lifecycle; UV/source ID mapping is retained for future morph/face correspondence.
- Temporary parsing creates full source text plus vertex/face arrays and several topology maps. The initial parser/weight transfer runs on the main thread and is a **feasibility implementation only**. Later worker/cancellation, compact indexed pre-baked representations, LOD, profiling, and mobile memory budgets are required before Studio interaction.
- Unit tests cover deterministic face order, UV seam remapping, topology diagnostics, weights, bounds, disposal, and malformed input. Chromium checks require **imported** geometry rather than silently passing on the fallback; screenshots collect neutral, overhead, shoulder, crouch and wireframe desktop/touch views. These screenshots require explicit human review.
- No build or visual quality gate is considered passed until GitHub CI and screenshots are inspected.

## Gates remaining before calling C2 complete

1. Verify full source geometry statistics, source forward orientation, polygon groups, actual source SHA-256 and selected source topology (especially lips, eyelids, palms, 5 individual fingers, groin, axillae).
2. Calibrate actual bind-pose anatomical landmarks against C1 bone positions and separate digit joints. Import/retarget correctly weighted MakeHuman rig data or design anatomy-aware smooth weight painting with twist chains and pose corrective shapes. Current heuristic weighting is for preview, **not production**.
3. Review full deformation images with face/hand and underarm closeups and objective unacceptable artifact descriptions, resolve bind-pose errors, and add pose-space correctives/UV tangent validation.
4. Author **metadata-only** candidate sever boundaries from validated source edge loops, source segment ownership and injury anchors. Do **not** slice or dismember runtime meshes yet.
5. Profile parsing/rendering and regeneration/cleanup on low-end touch and desktop; evaluate compact asset conversion and future morph targets. Verify 1,000-seed combat regression plus normal D14 e2e tests.
6. Do not unlock C3 parameter customization, C4 Studio, or replacement of `AnimatedWarrior` based on a recognizable neutral face alone.
