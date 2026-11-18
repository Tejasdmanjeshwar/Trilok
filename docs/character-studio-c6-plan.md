# Trilok C6 — Hybrid Animation Production, Retargeting & Runtime Integration

**Status:** C6 planning document; C6.1 contract/reference implementation merged in [PR #106](https://github.com/Tejasdmanjeshwar/Trilok/pull/106) with successful post-merge Verify on `aaab465120f214337ba69db438925faf9f7bce67` (see [C6.1 implementation audit](character-studio-c6-1-foundation.md)); C6.2 implementation is under review in [draft PR #112](https://github.com/Tejasdmanjeshwar/Trilok/pull/112); C6.3–C6.6 and overall phase acceptance remain unimplemented. Created 2026-11-18 after owner explicitly authorized optional Blender/external animation software for **internal workflows**.

**Parent roadmap:** [Character Studio C0–C9](character-studio-roadmap.md)  
**Tracking:** [C6 Issue #104](https://github.com/Tejasdmanjeshwar/Trilok/issues/104)  
**C5 predecessor:** [Issue #81](https://github.com/Tejasdmanjeshwar/Trilok/issues/81) (formal acceptance remains separately tracked)  
**Nonblocking browser automation follow-up:** [Issue #103](https://github.com/Tejasdmanjeshwar/Trilok/issues/103)

## 1. Objective and acceptance meaning

Produce high-quality, anatomically credible, reusable character animations by combining **scriptable external/offline production**, **reproducible animation baking**, **shared Three.js-compatible runtime clips**, and **lightweight runtime IK/procedural correction**. Gameplay and character Studio must preview/play the **same skeleton representation**, not merely similar copies.

AAA-aspirational quality is a target, not an assertion. A playable procedural proof-of-concept or a successfully exported GLB is *not* visual acceptance. Evaluate real captured animation at several morphologies and on low-power devices; report defects and evidence.

### Explicit developer tool policy

1. **Allowed internal development tools:** Blender (including headless Python scripting), authored animation tools, compatible mocap/retargeting tools, modeling helpers and other external software, if materially better for production efficiency or quality. Automated generation/ingest is preferred over manual work. Do not ask the owner to install Blender, animate by hand, or use third-party editors.
2. **Optional, not a runtime requirement:** No Blender executable, Python integration, proprietary service, external editing account, or user-side download may be required for the public Game/Studio to load, customize, animate or play. If a build-time tool is unavailable, fall back to checked-in, already validated distributable motion assets or a documented browser-native procedural reference; never silently invent tool output.
3. **Tool evaluation gate:** Verify whether the chosen tool is installed and executable in the actual agent/CI environment. Compare quality, scripting/headless support, source licensing, output redistribution rights, maintainability, platform constraints, worker cost, tool pinning and reproducibility with a browser-native Three.js alternative. Blender is authorized, not mandatory. Do not assume tools exist in a new session.
4. **Legal provenance:** Track source URL/creator, license version, attribution, commercial-use/redistribution permissions, download revision, SHA-256, derived clip lineage, exporter/solver versions and transformation scripts. Distinguish licenses of a tool's code from rights over its generated data. Never incorporate unverified animation packs, restrictive mocap datasets or AGPL source code into the proprietary runtime without specific review. Update `THIRD_PARTY_NOTICES.md` when real third-party assets/dependencies are added; don't assert new licenses without evidence.

## 2. Verified starting boundaries (re-audit HEAD before implementation)

When this plan was drafted, the latest checked `main` was `706207c942137a36c9d53df58e2d1666cce9ccff`; standard main Verify `#44287189170` succeeded. **These are a historical planning baseline, not a fixed future SHA.**

- `apps/web/src/studio/StudioPosePreview.ts` owns procedural anatomical FK, source rig joint constraints and C5 equipment pose/IK alignment. Avoid creating a second human rig or losing current bow, shield, sword and two-hand contact behavior.
- `apps/web/src/actors/AnimatedWarrior.ts` is the existing combat-facing presentation adapter with locally authored Three.js QuaternionKeyframeTracks for an older simplified actor. Preserve its public methods/commands as the adapter is incrementally migrated; don't replace combat data or break D14 timing.
- `packages/choreography/src/index.ts` provides elapsed-millisecond timelines and validated event ordering. Authoritative game events are supplied by combat; sampled animation and annotations must never independently award damage, create projectiles, alter legal dodge/parry windows or choose targets.
- `apps/web/src/characters/geometry/AnatomicalFK.ts`, `SkinningSpike.ts`, `AnatomicalPoseMatrix.ts`, `HumanPoseCorrectives.ts`, `apps/web/src/studio/StudioHumanModel.ts` and `packages/character-core/` establish anatomical transforms, skin and semantic metadata. Verify actual files, coordinate conventions and interfaces before coding.
- `apps/web/vite.config.mjs` currently compiles game and Studio as separate pages in **one output bundle**; `wrangler.jsonc` currently deploys that output as **one Cloudflare Worker**. Distinct app URLs/deployment cadences are *not* implemented just because routes have isolated bootstrap modules.
- `package.json` currently builds via Vite/pnpm; no Blender development dependency is declared. Do not impose a Blender install on normal PR Verify until a reproducible optional workflow is demonstrated.

## 3. Architecture: authored source vs baked motion vs runtime state

Use explicit, versioned data contracts rather than serialized anonymous Three.js scene graphs:

- **Authoring source:** optional `.blend`, authored scripts, generated motion parameters, mocap source and retarget rules stored/pinned with provenance where licensing and size permit. External software is a build-time producer only.
- **Canonical reference rig:** typed skeleton/joint identifiers, hierarchy, bind/rest transforms, orientations, units (meters), handedness, forward axis, scale, joint constraints, IK effectors, grip/socket identities and optional future extension joints. Determine mapping from existing Trilok semantic graph; do not re-root deform rigs arbitrarily.
- **AnimationClipV1 (proposed):** schema version, id, source asset provenance/hash, rig topology/bind compatibility ID, duration/sample rate, pose tracks (local quaternions with normalized continuity plus translations only where legal), masks, root trajectory policy, additive/base modes, contact metadata, optional labels, hashes and migration rules. Source clip sampling should be deterministic given the same toolchain/version and inputs. Reject NaN/infinite values, invalid channels, missing joints, path traversal, incorrect units, malformed time samples, discontinuous quaternion signs and invalid source licenses.
- **Offline bake/ingest:** deterministic sampling of rigs/motion into canonical motion tracks; optional thinning/compression with bounded tested error; origin normalization; explicit Blender/glTF import normalization; export canonical clips in a Three.js-compatible representation and sidecar validated metadata. Build-check assets and exact checksums. A binary export alone is not validated rig retargeting.
- **Runtime evaluator:** one canonical pose buffer and ordered stages: sample base/masked clips → layer/additive blending → morphology retarget → constrained torso/limb/foot/hand IK → pose correctives → apply skeleton and render. This order is *proposed*; profile/verify solver dependencies and contacts rather than assuming these passes commute. Cache allocations and dispose resource owners correctly.
- **Presentation vs authority:** simulation owns location/velocity, attack intents, reaction window, hit result, projectile origin/trajectory, limb status and damage. Animation/root motion is presentation-driven or explicitly requested through validated simulation commands. Rendering cannot generate gameplay events or stretch a defensive window.
- **Morphology strategy:** bake a curated **reference motion library** for stable skeleton families and retarget to valid proportions. Runtime solves contact/foot and socket alignment; optional cached morphology-specific derived clips only where measurements justify them. Preserve C5 bone/skin and weapon grip semantics.
- **Portability:** browser needs Three.js-compatible decoded clips or a versioned runtime-specific compact format; internal tooling output (e.g. source GLB) is not an unconditional dependency. Make GLB import/export possible as tooling, but C9 owns production-level full character GLB packaging.
- **Safety/ownership:** tooling that bakes animation has no ability to mutate combat authority; tests ensure no double damage, early hit, changed projectile coordinates or altered reaction grace.

## 4. Explicit work packages (implementation suggestions, not completed milestones)

### C6.1 — Audit, canonical rig/clip contracts and tool feasibility

- Re-read latest `main`, current files, roadmap, issue #104, C5 capabilities, tests and source rights.
- Measure existing actor/Studio skeletal compatibility and animation costs; list known coordinate axes, semantic bones, root/hip movement, current grip constraints and performance baselines.
- Define versioned clip schema/validators, skeleton ID/reference bind metadata, deterministic sampling API, root-motion and timeline synchronization policies and adapter interface for `AnimatedWarrior`.
- Spike headless Blender availability/scripting **without making it a normal runtime dependency**; assess alternate offline methods if tool unavailable or headless nondeterminism is high.
- Implement a tiny readable reference pose/clip and pure validation/sampling tests to prove the contracts; **do not yet attempt a new complete animation UI or game actor migration**.
- Exit: TypeScript tests + determinism/replay CI green, documented source/tool feasibility, single-clip round-trip and no C5 regression.

### C6.2 — Reproducible clip ingest, bake and Studio playback

- Add a narrowly scoped offline generator/importer (external Blender/GLB where viable; Three.js procedural fallback) with pinned versions, content hashes, asset provenance and safe inputs.
- Validate a few reference motions (idle, step, one weapon gesture), including rest-pose bind, quaternion continuity, sampling bounds, clip compression errors and export/import equivalence.
- Render them against the **existing Studio skinned human** with controllable speed, pause/seek, side/front/rear camera and frame stepping; no proxy rigs.
- Keep the baking UI minimal; persist content artifacts as development assets, not user-facing character Save/Load.
- Exit: deterministic source-to-clip rebuild evidence, render captures, and verified resource disposal.

### C6.3 — Locomotion, body weight and grounded foot contacts

- Implement forward/backward/strafe/turn transitions, gait phase, ankle/toe joint limits, support-foot/ground detection, pelvis balancing and root displacement separation.
- Test different heights, weights, proportions, mirror symmetry and extreme poses; detect foot slide, knee inversion, sinking, stretching and clipped geometry.
- Runtime motion must follow navigation/game authority; reduce-motion and mobile fallback required.
- Exit: repeatable movement and measured cost, no pose discontinuity or foot-contact regressions.

### C6.4 — Masked layers and weapon-aware full-body IK

- Blend upper-body attack/aim with lower-body locomotion; implement spine/shoulder/forearm/twist correction and priority of paired hand grips and support contacts.
- Maintain sword/shield/bow accuracy from C5 through blend boundaries and morph changes; no detached weapons, off-string arrow or unbounded solver loops.
- Exit: anatomical acceptance matrix, contact measurements, captured multi-angle renders, stable memory/perf.

### C6.5 — Combat presentation synchronization and expressive motion

- Add authorable reference motions for normal/rapid/heavy melee, feints, parry/intercept, dodge, bow aim/release, hit reactions and recovery as data-defined clips and additive overlays.
- Play and retarget clips from **authoritative** combat state and choreography time. Annotation markers are presentation hints, not a new source of hits or defense timing.
- Preserve D14 multi-hit/feint/rapid/normal/heavy mechanics, AI, projectile ownership, lodged arrows and reaction windows; run deterministic replays and browser encounter checks.
- Incrementally adapt existing `AnimatedWarrior` at a stable API seam rather than replacing its public contract in a single PR.

### C6.6 — Retargeted library, QA, optimization and phase acceptance

- Retarget across supported human morphology ranges (and prepare extension hooks for C7 wings, extra arms/heads and different anatomy without falsely declaring those implemented in C6).
- Optimize clip storage, decode time, blending, worker opportunities, GPU/CPU resources and mobile cost using measurements, not guessed speedups.
- Audit source licenses/provenance, memory disposal, performance regression, pose correctness, accessibility, reduced motion and visual quality across environments.
- **One formal C6 Phase Acceptance** on final exact merged `main` after required CI, desktop/touch browser passes and owner-rendered review; record exact SHA, build identity and separately verified deployment. C5 closure remains its own acceptance decision.

## 5. Acceptance matrix and non-goals

For each work package, require:
- Strict TS, unit and deterministic timing/replay tests, source hash verification, stable clip validation and build identity.
- Automated checks for quaternion normalization/sign continuity, clip bounds, root speed/contact drift, retargeted wrist/foot contacts, grip/socket error, and no out-of-range joint rotation. Calibrate numerical thresholds from the current rig and frame sampling; document them rather than inventing fixed numbers.
- Rendered side/front/back inspections for representative nominal and extreme morphology on desktop/touch; annotate actual failures. Validate playable game and Studio compatibility, contact correctness and shader/skin behavior.
- Profiler evidence: CPU sample, worst-frame time, WebGL draw/skin cost, memory allocations and device dimensions. Report observed numbers and disposal, not blanket AAA claims.
- Check all combat gameplay invariants are unaffected: damage, projectile origins, hit region, parry/dodge windows, AI action legality and replay determinism.
- All new third-party sources and license obligations remain traceable. Reduce-motion and keyboard-accessible controls are non-negotiable.

**Non-goals:** Shipping Blender in browser; requiring the owner to manually animate; building a full custom Blender competitor before clip playback works; complete C7 nonhuman rigs; C8 dismemberment and damage consequences; C9 persistent Save/Load and final character GLB bakes; new combat authority; photorealistic quality claims without real images and measurements.

## 6. Delivery and parallel app deployment

**Repository stays a monorepo initially.** Studio and Game already have different Vite HTML entrypoints but share packages and a single Cloudflare output. An independent infrastructure phase can produce `trilok-game` and `trilok-studio` deployables with independent build-info manifests, separate Cloudflare Workers/deploy pipelines and explicit channel promotion, while sharing the canonical character/animation packages. This is a **proposal**, not an existing capability. Do not claim new public URLs until deployed and verified. Neither C6 nor the next campaign should depend on duplicate repositories or duplicated runtime rigs.

For each C6 slice: audit latest main → scoped feature branch → implementation + tests/docs → Verify PR CI → review/merge only after green CI → verify main SHA and deploy when applicable. Keep manual full Phase Acceptance reserved for C6 completion. C5 residual browser test timing [#103](https://github.com/Tejasdmanjeshwar/Trilok/issues/103) is tracked without delaying unrelated C6 work.

## Major-phase hygiene requirement

At C6 closure, complete the [mandatory cleanup gate](phase-closeout-cleanup-policy.md), including tracked dead-code/legacy Lab retirement and CI workflow rationalization against the [November 2026 repo audit](repository-cleanup-audit-2026-11-18.md). Supply the committed `Phase: C6` cleanup report to manual Phase Acceptance. Preserve C5 contacts, active `SkinningSpike`, legacy-combat adapter until proven replaced, and unique MakeHuman/visual regression tests. Do not interpret subphase CI as formal C6 acceptance.

## 7. New-session handoff

**First task:** Start **C6.1 only**. Use this plan, roadmap, Issue #104 and live GitHub `main` as authority. Audit current Studio `AnatomicalFK`/pose systems, `AnimatedWarrior` combat adapter, `packages/choreography`, MakeHuman skeleton/skin, C5 grips, Vite/CI and source rights. Probe the actual available headless Blender tooling (or justify no-Blender fallback). Implement a small, versioned canonical rig/clip definition with validation, one sample clip, deterministic baked sampling, and a minimal compatibility/round-trip test. Do not launch C6.2–C6.6, create a separate character rig, rewrite authoritative combat, or build a full timeline editor now. Open a focused PR; run CI; merge only with verified checks; report true deployment status and next work. Distinct Game/Studio deployments can be a separate independently approved infrastructure PR.
