# C2 — CC0 continuous human body and procedural skinning research prototype

**Status:** C2 technical implementation and deformation validation; **not art-approved**, not combat-integrated, and not the later parametric Character Studio. Built entirely within Trilok using TypeScript/Three.js and a locally bundled anatomical mesh. See [C0 architecture](character-studio-c0-architecture.md), [C1 contracts](character-studio-c1-contracts.md) and [roadmap](character-studio-roadmap.md).

## Source asset and license

Source: [MakeHuman community, `makehuman/data/3dobjs/base.obj`](https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/3dobjs/base.obj), `hm08`. Original upstream Git blob SHA: `d26635e9326e3cca30778fd7b9c00062b03cce09`. The OBJ begins with an explicit CC0 declaration, dated September 2020, citing Data Collection AB, Joel Palmius and Jonas Hauquier. Bundled **unmodified source file** at `apps/web/public/characters/hm08/base.obj`. Source license declaration is preserved verbatim in the file; CC0 grants modification and redistribution. Do not infer that unrelated MakeHuman plugins, target data, clothing or textures share this status. No external editor, downloader, runtime service, hosted asset dependency or manual sculpting is needed.

The source OBJ has 19,158 vertices, 21,334 UV coordinates and 18,486 quad faces across 154 vertex-connected components. C2 selects the largest **watertight body surface**: 13,380 source vertices, 13,378 quads (26,756 output triangles) and zero open/non-manifold body edges. Separate original islands (eyes, teeth, tongue or other detached components) are excluded intentionally, so the current face/eyes and oral anatomy are incomplete. This remains a continuous body component; its mesh UV seams generate additional rendered vertices but are normal-smoothed against original source vertex identities.

## C2 runtime boundary

- `apps/web/src/characters/geometry/Hm08Topology.ts`: deterministic OBJ reader, connected component union/find, largest component choice, source-edge manifold test, triangles, source-split UV buffers, shared normals, **height baked into vertices** at 1.75m; no arbitrary character-root scale.
- `apps/web/src/characters/runtime/createC2Human.ts`: C1 `createAnatomyPreset` semantic metadata, C2-specific adjusted bind translations, `THREE.Bone` hierarchy, `THREE.Skeleton`, `THREE.SkinnedMesh` and `SemanticCharacter` composing one shared runtime representation. The reference skeleton is not a separate animation/Studio rig. C2 has zero corrective morphs.
- `apps/web/src/characters/geometry/validateSkinnedHuman.ts`: indexed attribute checks, finite normals/UVs/positions, 4 influence indices and weights per vertex (sum tolerance), no degenerate triangles, finite invertible inverse bind matrices.
- `apps/web/src/characters/pose/C2PoseStress.ts`: deterministic neutral, T, shoulder raise, overhead, elbow flexion, forearm/wrist twist, crouch, neck and asymmetry pose probes; CPU-skinned vertex samples checked for numerical failure.
- `apps/web/c2-preview.html` + `apps/web/src/characters/preview/c2-entry.ts`: independent diagnostic route `/c2-preview.html`, Three scene, orbit controls, camera positions, skeleton overlay and wireframe. Separate Vite HTML entry; the original `/index.html` and `apps/web/src/main.ts` remain unchanged.
- `tests/c2-human.test.ts` and `e2e/c2-preview.spec.ts`: topology, deterministic regeneration, skin inverse and weight constraints, all poses, disposal and Chromium preview smoke/screenshot fixtures.

**Weighting is provisional:** C2 uses an approximate distance-to-semantic-joints four-bone distribution with regional classification. It validates mechanically but does not yet solve anatomical skin-weight painting, axillary/crotch deformation, twist joint distribution, fine finger articulation, pose-space correctives or physically convincing elbow and shoulder bending. No automatic correction has been validated visually. The **C2 output is a diagnostic first skinned anatomy**, not a production model, even though the source topology is real anatomical art.

## Cut and injury reservations

The original largest body component is watertight and has UV-seam-aware vertex IDs, which supports future prevalidated cut-loop research. **It is not currently pre-segmented, cut-ready or detachable**. The base mesh is not yet split at shoulder, neck, wrist, knee or hip sever zones, and cut cap meshes/ownership and per-LOD anchor remap are future C3/C8 design gates. Do not populate fabricated valid `SeverZoneV1` entries before seam loops and caps pass validation. No injury transfer or combat-state mutation occurs in C2.

## Quality and performance gates

C2 automated invariants: exact source topology counts and manifold body component, 1.75m geometry bounds, deterministic skin weights and normals, four normalized finite influences, valid bone indices/inverse binds, stable socket lookup, positive nondegenerate faces, finite pose-deformed samples, restored rest pose, and idempotent owned-resource disposal. Test `pnpm typecheck`, `pnpm test` (including D14 1,000-seed replays), `pnpm build`, and desktop/touch Chromium `pnpm test:e2e` on GitHub Actions.

**Visual review is an independent gate:** inspect neutral, T, overhead, elbow, twist, crouch, neck and asymmetry screenshots from the preview on desktop/mobile. Specifically flag shoulder collapse, torso–arm weight discontinuities, elbow candy-wrapper artifacts, deep-crouch groin deformation, wrist twisting, absence of eyes/teeth, missing facial controls and texture quality. Passing finite-value checks is **not** evidence of attractive animation or production-ready anatomy. Desktop/mobile FPS, memory usage, weight smoothing and dismemberment performance are not yet measured. Current asset is an uncompressed ~1.75 MB public OBJ, fetched only by the C2 route (not combat).

## Follow-up gates (separate reviewed phases)

- Improve anatomical skeleton landmarks using source-template measurements and actual joint weighting/rotation tests, not fixed guessed bones or global scaling.
- Upgrade from rough distance-based weights to anatomical heat/voxel/rigged guide weights, validate shoulder/crotch loops, fingers and twist bones; capture golden pose images and reject obvious deformation artifacts.
- C3 adds validated body/face parameter ranges, compatible morph targets, corrective shape deltas, neck/head family and skin/socket/collider recalibration.
- C4 adds independent lazy-loaded `/studio` editor, immutable recipe state and preview controls; keep using the **same** underlying semantic runtime builder, not an unrelated editor-only rig.
- C5+ calibrates weapon grips/IK and animations; C8 handles actual anatomy-aware combat hits, wounds, persistent arrows and validated dismemberment. D14 remains the authoritative, unchanged gameplay engine.

**Deployment:** GitHub checks and Cloudflare branch preview are not proof that the production URL has deployed. Check `/build-info.json` SHA independently. The C2 diagnostic route becomes available at `/c2-preview.html` only after that deployment.
