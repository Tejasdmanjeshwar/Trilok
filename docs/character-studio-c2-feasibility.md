# C2 — First continuous, skinned human *research* topology (feasibility slice)

**Scope and fidelity:** This PR provides a small **skinned humanoid geometry and deformation prototype**; it is **not** a completed production human model, anatomically validated asset, game-ready character generator, or Character Studio. C2 art, topology and deformation quality gates remain open. No external application, prelicensed asset, manual sculpting or dependency was added.

## What is implemented

- `apps/web/src/characters/geometry/SkinningSpike.ts`: derives a Three.js `Bone` hierarchy from the C1 semantic graph, builds a temporary indexed multi-segment deforming `SkinnedMesh`, validates finite positions/UVs, finite invertible inverse bind matrices, valid joint indices and normalized four-slot skin weights. It is a disposable rig diagnostic only.
- `apps/web/src/characters/geometry/ContinuousHumanPrototype.ts`: samples a deterministic smoothed union of anatomy-guided implicit segments, generates one **connected indexed mesh data structure** with reusable grid-edge vertices, normals, UVs and weighted joint indices, and binds it to the C1-derived Skeleton. The output uses a single SkinnedMesh instead of merely rendering separate cylinders/spheres. Spatial field primitives inform a continuously joined surface but remain an **experimental geometric approximation**, not correct anatomical loops or human sculpt quality.
- `apps/web/c2-lab.html`, `src/characters/lab/c2-lab.ts`: optional isolated lab at `/c2-lab.html`, intentionally separate from the future `/studio`. Provides orbit/zoom and deterministic neutral, shoulder raise, elbow flex, crouch, torso twist, forearm rotation and approximate bow-draw test poses; clear warning explaining missing art quality. Uses default disabled-on-reduced-motion camera damping; explicit poses work without animation.
- Vite multipage entry adds the lab without altering `apps/web/src/main.ts`, any combat sources or the root battle document. `/c2-lab.html` is for preview and screenshot review of prototype topology only; it does not introduce a new gameplay character.
- `tests/character-geometry.test.ts` and `e2e/c2-lab.spec.ts`: deterministic buffers, live skin binds, weight/UV/inverse binds, invalid parameters and repeat disposal, browser launch and scripted pose switches, followed by the unchanged D14 combat arena. Existing 1,000 seeded combat replays remain compulsory.

## Known failure modes / mandatory open gates

1. The implicit surface is assembled from simplified radial anatomical envelopes with **no proven expert-authored deformation loops** at axillae, groin or knees. It cannot be marketed as a credible AAA-aspirational finished human even if it looks smooth in a single neutral pose.
2. Current meshing is a **feasibility algorithm**; manifold/watertight tests, connected-component count, non-manifold vertices, UV seam quality and surface morph correspondence need stronger validation. A *single BufferGeometry* is not evidence of a single perfectly manifold component. No hand sculpt, face shape, muscle/fat correctives, clothing, textures or LOD assets.
3. Skin weights interpolate between neighboring semantic joints using a local closest-segment heuristic. No proper anatomical weighting, calibrated shoulder twist, dual quaternion skinning, pose-space corrections or real bow-hand contact validation; the pose buttons only expose weaknesses.
4. Baseline skeleton in C1 is structural and uses neutral joint frames; C2 still needs bind-pose calibration to a natural relaxed A-pose and revised human measurements. The prototype is not registered in `AnimatedWarrior` or `CombatHitVolumes`; a rendering change cannot alter domain hit detection.
5. Arbitrary cuts are not implemented. Seam loop and interior cap placement remain pending; prevalidated severing zones must be designed and validated *before* C8. The current implicit marching topology should not be accepted as cut-ready.
6. `/c2-lab.html` uses synchronous bounded volumetric sampling on load; browser timing, memory and GPU time need hardware measurements and later worker/cancellation. The grid is capped and no unbounded generation is exposed to users.
7. Chromium tests exercise WebGL and pose buttons; **passing them is not human visual inspection**. A reviewer must examine neutral plus extreme poses (especially shoulders/elbows/groin), with actual images and device profiles, before labeling C2 complete.

## Next C2 work before accepting anatomical model quality

- Perform direct asset-level CC0/compatible human-template provenance check and deformation-quality comparison against this generated research topology; only commit assets with original author, exact rights, source URL, checksum and legal review. The fallback implicit prototype alone does not satisfy art-quality acceptance.
- Establish continuous retopology flow and test rings for shoulder/groin, limb twists, face/hand loops, UVs, explicit cut loops/caps, and improved bone local frames/influence fields. Validate watertight/manifold topology, normal direction and severe poses; add screenshot baseline review and mobile frame/memory profiling.
- Only migrate actual in-game mesh and injury anchors after parity and movement/weapon tests, in later scoped phases. **Do not replace D14 actor from this prototype.**

## Verification and deployment

`pnpm typecheck`, `pnpm test` (including 1,000 seeded combat replays), `pnpm build`, `pnpm test:e2e` Chromium desktop/mobile and build-identity check are the CI gate. Verify actual GitHub Actions status before merge. Production Cloudflare SHA must be checked independently from the preview and source merge.
