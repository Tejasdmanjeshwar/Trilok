# Trilok Character Studio — Browser-Native Character System Roadmap (C0–C9)

**Status:** C0/C1 contracts and C2 anatomical foundation are accepted; C2 Phase Acceptance #43289499861 passed on SHA 7d2b888afd8ffa3fe26a5fd1b611b55fe9c81ac5 with owner Cloudflare/Character Lab sign-off (Issue #15 closed). C3.1 merged via PR #40; C3.2 localized shaping and opt-in Character Lab preview are merged; C3.3 corrections, C3.4 human morphology and prior experimental animal-head previews have merged; C3.5 human facial topology is under review. C3 remains unaccepted; C4 and combat migration have not begun.
**Repository baseline at planning time:** main @ db8348bd296a412262781d20a9f444fea474c692; playable 0.4.0-preview.19; combat 0.4-D14.  
**Scope:** shared, reusable character technology for Ramayana and subsequent campaigns.  
**First implementation phase:** C0 architecture audit/specification. Review the [C0 ADR](character-studio-c0-architecture.md) and its verification before starting C1.  
**Hard constraint:** authoring, customization, preview, rigging, validation, and game-ready baking/export must run within Trilok's own Three.js/TypeScript browser application. No Blender, Maya, separate character-creation service, or manual sculpting is required of the user.

## 1. Product intent and non-goals

Build a standalone lazy-loaded **/studio** experience, reachable from a separate tab/navigation entry in the existing Trilok website. Character Studio, the combat renderer, and future gameplay must instantiate the **same versioned character runtime representation**. The Studio should create, customize, validate, preview, save and bake playable characters directly in the browser, including human, Rakshasa/orc-like, Vanara, winged avian-headed **humanoid** (Jatayu-like), and custom animal-headed humanoid archetypes. Later support multiple arms, legs, heads, tails and other anatomy extensions without assuming a fixed humanoid bone count.

The target is high-quality **stylized** RPG characters with convincing anatomy and credible motion. Compilation or numerical topology validity is not evidence of AAA visual quality. Visual acceptance needs rendered deformation review and realistic weapon/armor contact. Do not describe an asset as production-quality before those checks.

**Not included in C0/C1:** a completed character sculpt, detailed facial animation, procedural combat animation, full dismemberment simulation, a new combat/damage model, or a Cloudflare production deployment. These belong to later independently tested phases.

## 2. Immutable compatibility boundaries

- The pure combat domain and its hit/damage/reaction logic remain authoritative; presentation animations must never invent damage or widen legal defensive windows.
- Preserve D1–D14 systems: deterministic ballistic arrows and interception, selected anatomical hit regions, embedded projectile identity, accumulated wound marks, adaptive AI, timed rapid/normal/heavy attacks, offensive timing, multi-hit/feints, and Rakshasa boss phases.
- Preserve the public actor-facing behavior of **apps/web/src/actors/AnimatedWarrior.ts** through a compatibility adapter until the renderer migrates.
- Existing **apps/web/src/combat/CombatHitVolumes.ts** currently derives visual proxy anchors from named groups/offsets. Replace this incrementally with live rig-following anatomical proxies mapped to stable combat region IDs; do not silently change hit legality or damage outcomes.
- Existing **apps/web/src/effects/ProjectileClashEffects.ts** transfers the original projectile mesh into a persistent rig attachment; preserve that original identity and lifetime policy when reparenting effects or detaching limbs.
- **apps/web/src/effects/SurfaceMarks.ts** needs deformation-following anchors in later phases; a bone-local position alone is not sufficient for accurate skinned-surface tracking.
- Keep domain code independent of Three.js and DOM. No large character-generation module in **apps/web/src/main.ts**.
- Changes to rig proportions must update skin bind transforms, socket positions, IK lengths, anatomical hit proxies and valid equipment contact, not apply arbitrary world-root scaling.

## 3. Proposed architecture (to be validated in C0)

Favor small packages/interfaces and data-defined archetypes. Names below are proposals, not implemented modules.

| Boundary | Responsibility | Suggested location |
| --- | --- | --- |
| Character schema | Pure TypeScript versioned archetype IDs, recipe parameters, topology family, anatomical capabilities, serialization/migration, deterministic seed | packages/character-core |
| Anatomy graph | Semantic region IDs, parent/child segment ownership, required/optional anatomy extensions, detachable regions and joint semantics | packages/character-core |
| Geometry generator | Stable-topology template loading, indexed mesh modification, UV/normals, landmarks, morphs, skin-weight evaluation, optional segmentation, worker pipeline | packages/character-geometry |
| Rig and sockets | Canonical humanoid roles, additional limb/wing/head chains, bind-pose contracts, validators, grip/socket metadata | packages/character-rig or cohesive character-runtime package |
| Runtime assembler | Three.js Skeleton/SkinnedMesh/morphs/materials; bone lookup; camera preview; disposal/LOD | apps/web/src/characters/runtime |
| Animation/IK | Layered pose evaluation, retargeting, constraints and calibrated weapon/foot/hand contacts | dedicated character animation module |
| Studio | Lazy-loaded /studio route; model preview; editing state, undo/redo, diagnostics, bake tools | apps/web/src/studio |
| Combat bridge | Adapter maintaining AnimatedWarrior-facing API, anatomical proxy mapping, wound anchors and event integration | apps/web/src/characters/combat |
| Browser asset baker | Deterministic recipe freeze, geometry/rig validation, optional optimization/LOD, GLB + Trilok metadata export, round trip | apps/web/src/characters/baking |

C0 must decide exact package cuts based on repository reality; do not create empty speculative packages.

### Canonical rig design

Use a **standard humanoid foundation**, plus validated **anatomical extensions**, not a single hardcoded two-arm/two-leg skeleton. Stable semantic identifiers must distinguish anatomical regions, rig joints, IK targets, equipment sockets, and detachable segments. An extra arm needs a unique segment namespace rather than reusing LeftArm/RightArm names.

C0 should ratify:
- Three.js/world conventions: meters, right-handed space, Y-up, unambiguous local character forward/right, neutral A/T pose, bone local axes and quaternion rotation standards.
- Root motion versus pelvis motion; bind-pose and inverse-bind-matrix rules.
- Spine, head/jaw/eyes, clavicle/arm/forearm twist/wrist/finger chains, pelvis/leg/foot/toe chains; optional facial controls.
- Wings as **independent articulated extensions** to a humanoid torso (not a replacement avian body), tails and horns as appropriate, and extra head/limb attachment semantics.
- Deformation joints versus non-exported authoring controls; joint limits and calibrated rest poses.
- Semantic socket contracts: primary/secondary grip, shield, back/hip attachments, arrow nock, bow-string release, projectile origin and severed-limb equipment transfer.

All structural additions must have an explicit capability model. A missing hand invalidates that hand's equipment capability; a wing loss can invalidate wing-dependent locomotion only when gameplay rules implement it.

### Anatomy/topology strategy

Do **not** replace primitive characters with more decorated primitive assemblies. Prefer continuous, indexed, deformation-friendly anatomical mesh topology with meaningful loops near shoulders, elbows, hips, knees, neck, face and hands.

1. Evaluate importing **appropriately licensed, bundled anatomical template data** (e.g. CC0 human base with morph data), with no external editor or hosted dependency. Legal provenance, redistribution, formats, repo size and compatibility must be verified **before** inclusion.
2. Evaluate browser/Three.js-compatible candidates such as Three.js SkinnedMesh/morph targets, humanoid-kit, three-mesh-bvh, glTF-Transform, Manifold WASM and glTF Validator. These are **research candidates, not approved dependencies**. Inspect maintenance, licenses, CPU/GPU cost, API maturity, build size and whether each actually addresses a requirement.
3. Partition topology **families**: conventional two-arm humanoid, multi-shoulder/multi-arm torso, alternative animal/avian head families, and optional wing attachments. Only allow compatible morph targets within a single stable-index topology family.
4. Parameter adjustment coordinates bone placements, morph targets, attachment sites, clothing fit and collision proxies. Supported ranges, coupled constraints and pose-space corrective targets prevent broken extreme combinations.
5. Evaluate anatomy under high-stress test poses from C2 onward; visual quality is not postponed until C6.

C0 must document how to produce or adopt the **first continuous human template with no manual sculpting**, including an honest fallback if candidate assets are unsuitable. The user must not be asked to install Blender or sculpt.

## 4. Injury, disfigurement and dismemberment — first-class design constraints

Represent **character recipe**, **baked base asset**, and **runtime injury state** separately. Injury events originate in the authoritative combat model; visuals do not create combat results.

- **Surface injuries:** wound marks, scars, burns, lodged arrows, retained via anatomical region plus skinned triangle/barycentric or equivalent stable surface coordinate anchor; cleanup must be bounded.
- **Disfigurement:** persistent asymmetrical morphs, scars, and limited joint/posture modifications with validated deformations; do not permanently mutate the pristine recipe.
- **Dismemberment:** a versioned anatomy graph of segment ownership and allowed sever points/bands (neck, limb joints, wrists, wings, tails, and optional anatomy), plus cut-ready topology/edge loops, caps/interior materials, and detached-component metadata.
- **Detached objects:** must inherit posed world-space transforms and keep relevant embedded projectiles, surface marks, socket-bound equipment and stable identity. No duplication, phantom limb collision or memory leaks.
- **Combat consequences:** missing limb/head/wing capability must map to explicit domain rules at a separately reviewed combat phase; never quietly change combat semantics in C0/C1.
- **Implementation approach:** prevalidated, bake-time severable boundaries and detachable sections first. Arbitrary slicing of dynamically skinned/morphed surfaces is a future research feature, not an assumption. Generic Boolean geometry libraries do **not** automatically preserve bone weights, morphs, UVs and animation semantics.

C1 establishes metadata and validation contracts; C2/C3 must reserve/validate topology for severable sections; C8 performs actual combat injury and severing integration.

## 5. Browser-native Studio and baking contract

**Studio sections:** archetype selection; body/face morphs; anatomy modules; skin/hair/materials; clothing/armor; rig/IK diagnostics; weapons/grips; deformation and combat pose tests; wounds/dismemberment preview; save/bake. Include orbit and orthographic cameras, lighting presets, visibility controls, keyboard-accessible parameter editing, reduced-motion behavior, undo/redo, deterministic random seed, readable errors and non-destructive reset.

**Live edit:** mutate immutable recipe state; validate/canonicalize parameters; debounce heavy recomputation; generate in worker where viable; cancel/ignore stale generations; update preview with latest valid version; dispose replaced GPU/CPU resources.

**Save editable:** versioned recipe, topology-family ID, dependency identifiers/versions, seed, archetype schema and optional separate injury state.

**Bake game-ready:** freeze recipe; regenerate deterministically; validate mesh topology/normals/UVs/weights/joints/morphs/sockets/cut boundaries; produce optimized usable SkinnedMesh, materials and LODs; export GLB via Three.js GLTFExporter and sidecar Trilok metadata; **re-import** and verify rig, bounds, region metadata and socket transforms. Retain skeleton/morphs needed at runtime; do not bake an unanimated static mesh. GLB alone does not encode Trilok-specific combat/injury semantics.

Texture/normal baking and automatic appearance refinement may be implemented with procedural maps, authored bundled assets, or GPU/CPU passes under explicit quality assessment; a glTF exporter by itself is **not** a high-to-low normal-map baker. Avoid promising automatic photorealistic sculpt detail.

## 6. Phases and acceptance gates

### C0 — Audit, standards and feasibility (FIRST; own branch/PR)

**Inspect actual main** and these files before modifying runtime code:
- apps/web/src/actors/warrior.ts
- apps/web/src/actors/AnimatedWarrior.ts
- apps/web/src/combat/CombatHitVolumes.ts
- apps/web/src/effects/ProjectileClashEffects.ts
- apps/web/src/effects/SurfaceMarks.ts
- apps/web/src/main.ts
- apps/web/src/combat/sequences.ts
- packages/choreography/src/index.ts
- package.json, CI, build identity, tests, and any existing asset conventions

**Deliverables:** an ADR/spec with precise axes and units, canonical semantic bone/region/socket naming, archetype-capability graph, injury-segment contract, topology/morph/corrective strategy, asset license/provenance evaluation, candidate-library evaluation, browser Studio architecture, bake artifact schema, migration map, initial performance and asset-size budgets, quality gates, test matrix, risks and no-sculpt human-template feasibility decision. Mark unresolved risks honestly. Optionally add small pure contract/schema prototypes only if covered by tests and within C0 scope.

**Acceptance:** D14 logic untouched, TypeScript/tests/build/replays/e2e baseline confirmed if executable, docs internally consistent, no unlicensed assets or unjustified dependencies, no claimed visual quality without inspection, PR reviewed and CI verified before merge.

### C1 — Canonical skeleton and runtime contracts

Implement tested, strict-TS versioned rig/anatomy/socket schemas; canonical humanoid bone semantics; optional extra limbs, wing/head/animal-head capabilities; validation of unique IDs, hierarchy, bind transforms, influence metadata, ownership and coordinate conventions; combat-compatible AnimatedWarrior adapter with no D14 change. Include deterministic rig regeneration tests, transform/socket tests, malformed graph rejection, disposable resources and skeleton visualization in a test harness where practical.

**Gate:** existing combat tests/replays and browser behavior preserved; human and representative Rakshasa/wing-extension rigs validate. Do not claim visual deform quality yet.

**C1 implementation note:** the pure character-core, semantic runtime and test-only legacy bridge are in [C1 contract notes](character-studio-c1-contracts.md). C1 has not implemented skinning, a renderable model or a Studio page.\n\n### C2 — Continuous procedural skinned human

**C2 research slice:** [feasibility notes](character-studio-c2-feasibility.md) describe the experimental unified SkinnedMesh, standalone rendered pose lab and open anatomical quality gates. The prototype is not a production-quality finished human; definitive C2 topology/skin weighting/seam approval remains pending.


Adopt or generate first deformation-friendly human topology, UVs, normals, normalized skin weights and calibrated bind pose. Evaluate Rakshasa proportions. Add pose stress-test harness now (shoulder raise, bow draw, elbow/forearm twist, crouch, torso rotation) and inspect renders. Reserve sever-compatible topology.

### C2 scope refinement (C2.3–C2.5)

C2 is limited to the reliable anatomical human mesh/rig foundation. Distinct reviewable milestones:

- **C2.3 Anatomical joint orientations and FK:** rest-relative frames for the C1 semantic skeleton; bounded anatomical controls and proximal forearm articulation. PR #19 initially merged with incorrect mirrored palm directions; PR #20 corrected the underlying frame orientation. **C2.3 accepted:** signed joint direction tests on the actual imported CC0 rig and desktop/touch Chromium visual inspection confirm inward finger curl, thumb opposition and recognizable fists (GitHub Verify run 43209802945). A subsequent jaw-open regression was traced to a generic pitch axis that moved the chin upward; the focused C2.3 correction in PR #21 adds a calibrated opening hinge, signed chin-descent checks and imported-CC0 Chromium close-up tests; the pull request records the acceptance evidence. Distributed twist, skin-volume/contact polish and stress-pose validation remain C2.4/C2.5.
- **C2.4 Skinning/deformation:** audit lost source twist/helper influences and improve shoulder, elbow, forearm, wrist, fingers, hip, knee and crouch using targeted weighting, meaningful twist support, or small correctives; preserve original vertex identity, four normalized weights and UV seams. Begin only after C2.3 has passed review and merged.
- **C2.4 focused ownership repair (PR pending):** the CC0 source hierarchy confirms that shoulder01 is a clavicle/shoulder-girdle connector rather than the mobile upper arm, that lowerleg02 remains part of the shin, and that foot begins at the ankle. Retarget these skin weights to clavicle, knee and ankle respectively, and make source toe1-* weights follow the C1 forefoot rather than the distal toe hinge. These are segment-ownership repairs, **not** new FK joints, corrective shapes or proof of quality. Documented unit and actual-render checks remain required before C2.4 is accepted.
- **C2.4 proximal forearm twist slice (PR pending):** introduce two optional **presentation-only** proximal forearm skin references (one per side) for the imported CC0 mesh, separate from C1 semantic IDs. Original source lowerarm01 weights use the flexion-following reference, lowerarm02 uses the fully rotating C1 elbow. This reduces uniform full-length pronation and leaves C2.3 elbow, wrist and finger FK untouched. Verify source-vertex/UV continuity, four-influence normalization, rest recovery and focused rendered pronation before accepting visual quality; substantial shoulder/hand/hip/jaw deformation work remains.
- **C2.4 shoulder-girdle skin distribution (focused PR):** The pinned CC0 default skeleton places shoulder01 between clavicle and upperarm01. It owns 569 weighted source vertices per side and overlaps clavicle (396 vertices), upperarm01 (514) and chest (491), but was previously collapsed onto the clavicle alone. A new optional render-only bilateral skin connector is calibrated to the source shoulder01 landmark and receives half of the original shoulder rest-relative quaternion delta, allowing source-provided skin weights to blend between chest/clavicle, connector and fully mobile upperarm. No C1 joints, FK limits, combat authority or source vertex correspondence change. **Not visually signed off**: potential skin-volume loss, scapular sliding and self-intersections require focused shoulder/armpit render checks; full matrix remains C2.5.
- **C2.4 elbow/wrist skin blend (focused slice):** Source lowerarm01→lowerarm02 and wrist→metacarpal blend regions are distinct (on each CC0 side: 288 and 176 shared source vertices respectively). The source lowerarm01 proximal skin reference now follows half the elbow flexion while full semantic elbow motion and distal lowerarm02 weights remain untouched, softening elbow skin-fold transition. A calibrated skin-only wrist bridge now preserves original source wrist weights and follows half of the semantic wrist rest-relative motion; metacarpals/palm receive complete wrist movement. No C1 joints, topology, source IDs, UVs or D14 mechanics change. This is a narrow LBS approximation, not proven volume preservation. Rendered close-up comparison and severe combined pose checks remain outstanding.
- **C2.4 wrist geometry regression repair (focused PR):** PR #26 introduced a 50%-rotating wrist skin reference for `wrist.L/R` source weights, which could visually detach the wrist surface from the complete C1 wrist motion. Revert only that wrist skin bridge; keep the earlier shoulder/forearm corrections, original CC0 wrist weights and existing C1 FK. Introduce a **headless real-asset geometry gate**: load the hash-pinned CC0 body OBJ, skeleton and weights; CPU-skin actual selected wrist/metacarpal-only source vertices using `SkinnedMesh.getVertexPosition`; check both hands against an independent rigid semantic wrist transform under flexion, deviation, pronation+flexion and elbow+wrist combinations; verify rest recovery. Confirm test sensitivity by deliberately corrupting wrist influences while retaining normalized weights. The `pnpm test` prerequisite now verifies/downloads pinned CC0 assets. This checks a measurable skin-to-bone invariant, **not** complete visual/anatomical quality; Phase Acceptance stays C2.5.
- **C2.5 Validation and C3 readiness:** examine complete pose matrix, topology, deterministic FK and skin correspondence, actual desktop/mobile renders, performance and repeated disposal; document C3 shape-ready bind and landmark APIs. Record remaining caveats without declaring AAA quality.

**Deliberately deferred:** C3 anatomical body/face shaping and male/female morphology presets (gender identity must remain independent of morphology); C4 full studio UI; C5 calibrated grips/hand IK; C6 full-body IK, animation layers and retargeting; C7 additional archetype appearance; C8 actual disfigurement, severing and wound integration; C9 baking/export/reimport. Track all in Issue #15 without reclassifying them as C2 failures. No swap of the D14 combat actor or combat-domain changes in C2.

### C3 — Parametric shaping and head families

Create bounded body/face parameters, topology families, corrective morphs, bone/IK/socket/refit calculations, stable hashes and extreme-combination tests. Keep C3 human-head and facial-morphology foundations source-compatible; defer Vanara/primate, bear, avian and other species-specific head reconstruction to C7. Dismemberment/disfigurement state remains separate.

**C3 implementation record:** C3.1 [morphology base](character-studio-c3-1-morphology.md) adds deterministic whole-body stature/breadth and neutral rebinds. C3.2 [localized shaping](character-studio-c3-2-local-morphology.md) adds bounded torso and limb proportion channels plus an experimental laboratory preset view, without starting C4. C3.3 [experimental pose correctives and alignment](character-studio-c3-3-correctives.md) adds opt-in radial shoulder/hip morphs and measured shape-derived sockets/IK chain reach. C3.4 [human head morphology](character-studio-c3-4-human-head.md) adds a versioned human-only face recipe, source-derived cranium/face shaping, jaw/orbital landmarks, and Character Lab parameter controls. C3.5 [detailed human facial topology and controls](character-studio-c3-5-facial-topology.md) adds opt-in source-derived facial landmarks and bounded local tessellation to the C2 human surface; visual acceptance and CI remain pending. Previously merged [primate and bear previews](character-studio-c3-5-mammalian-heads.md) are unaccepted legacy experiments, **not** validated anatomy. C3.6 is reusable facial morphology and morph targets; C3.7 integrates and accepts C3. Species-specific Vanara, bear and avian anatomical reconstruction is deferred to C7. C4 stays out of scope. Track [Issue #41](https://github.com/Tejasdmanjeshwar/Trilok/issues/41).\n\n### C3.5–C3.7 acceptance sequence (revised November 2026)

- **C3.5 — Detailed facial topology and control foundation:** human-only, source-derived semantic facial regions, bounded local subdivision, stable control correspondence and valid C1 jaw/head skinning. PR review, measured geometry, CI, multi-angle rendered screenshots and owner visual acceptance required.
- **C3.6 — Advanced reusable facial morphology and morph targets:** future independent eyelid, nose, nostril, lip, mouth-corner, cheek, brow, jaw and ear authoring fields; distinct bounded versioned morph recipes, stable deltas and surface compatibility. **Not begun.**
- **C3.7 — C3 integration and final acceptance:** full coupled stress, reproducibility, deformation and pose matrix, memory/browser budget and desktop/touch Playwright checks, independent Cloudflare identity and owner sign-off. **Not begun.**
- **C7 — Species-specific anatomy:** Vanara, bear, avian and other custom-head morphology and topology. Prior C3.5 mammalian previews remain experimental legacy code, not accepted reconstructions.

### C4 — Standalone Character Studio

Deliver lazy-loaded **/studio** interface in existing web application with the *same* runtime character builder, archetypes/presets, orbit + orthographic views, editable controls, undo/redo, serialization, accessibility, debugging overlays, pose previews and regeneration cancellation. UI does not duplicate mesh logic.

### C5 — Weapon handling and IK

Implement calibrated hand grips, finger pose profiles, secondary-hand IK, sword/shield, bow/string nock/draw/release alignment and grip testing across parameter ranges. Ensure world-space weapon/arrow origins agree with authoritative projectile data.

### C6 — Full-body animation and future procedural controls

Implement layered animation, retargeting, torso/shoulder/foot IK, twist and corrective motion, motion masks, joint constraints, root motion policy and later procedural pose hooks. D14 authoritative impact and defensive timing stay intact.

### C7 — Archetypes and modular appearance

Implement Rakshasa/orc-like and Vanara proportions, optional multi-arm/multi-head variations, Jatayu-like **winged humanoid** with independent wing rig, interchangeable custom animal heads, garments, armor, horns, hair and accessories. Validate fitted clothing and LODs per supported archetype.

### C8 — Combat injury and anatomy integration

Migrate hit proxies, precision contacts, melee reach, equipment capabilities, parry/intercept origins, wounds, embedded arrows, surface anchors, disfigurement and **prevalidated anatomical dismemberment**. Preserve deterministic domain authority; add explicit reviewed rules for actual functional consequences.

### C9 — Production hardening and baking

Optimize skinning/LOD/texture/meshes and workers; bake and export/import presets and assets; schema migrations; GLB validation; mobile/desktop profiling; seeded regeneration/replay regression; device browser tests; screenshot/pose review; resource lifecycle and failure recovery. Asset production claims need rendered inspection and measurements.

## 7. Quality and performance requirements

**Proposed budgets, not measurements:** standard human deform rig ~80–140 joints on desktop and ~60–100 on mobile after LOD decisions; visible hero ~30k–60k tris desktop and ~10k–25k mobile; texture assets appropriate to 1K–2K mobile/2K desktop; target 30–60 FPS depending on device and encounter. Winged/multi-limbed variants require independent budgets. Confirm actual feasibility on representative devices before ratifying limits.

Test invariants:
- No invalid finite values, zero-weight vertices, bad joint indices, unnormalized weights or broken bind matrices.
- Stable topology/UV/landmarks and deterministic recipe regeneration for identical input + generator version; no unintended global scale.
- Representative extreme morph and pose combinations do not show unacceptable mesh collapse, self-intersection, clothing clipping or grip drift; automated checks supplemented by human visual review.
- Anatomy ID and combat region ID mappings stable across archetypes, save/load and injury state.
- All generated geometry, materials, GPU buffers, morph arrays, mixers, worker tasks, detached segments and effects are disposed or reused safely.
- Reduced motion, keyboard navigation, readable viewport controls, touch behavior and graceful worker/bake failure.
- All existing CI: TypeScript, Vitest, 1,000 seeded combat replays, Chromium desktop/touch smoke tests, build manifest verification. No weakening/suppressing tests.

**Release gates:** implementation correctness, browser integration, rendered inspection, equipment alignment, combat regression, deterministic baking, memory/performance profiling, versioned metadata and documented limitations. Do not equate green CI with AAA asset quality.

## 8. One-phase-at-a-time delivery protocol

For **each implementation slice**: inspect live repo state and relevant source; document scope and risks; create a feature branch; implement tested, focused changes and docs; run fast CI (`pnpm typecheck`, the full `pnpm test` including deterministic replays, `pnpm build`, build identity); open a PR and merge only after required fast CI passes. Focused manual/browser checks remain appropriate for visual issues even before phase completion. **Do not run the full automated Playwright matrix on every intermediate slice.** At **phase completion**, manually dispatch the `Phase Acceptance` GitHub Actions workflow for the exact candidate ref/SHA, require its full Chromium desktop/touch test matrix and inspect actual renders; record run, SHA, verdict and limitations in the phase issue and roadmap. A changed SHA invalidates previous acceptance. See [CI phase-acceptance policy](ci-phase-acceptance.md). Verify Cloudflare deployment separately when relevant; a GitHub merge does not prove production is updated.

Start the next session with **C0 only**, using [C0 handoff](character-studio-c0-handoff.md). C1 begins after C0 acceptance, not in the same unreviewable PR.

## 9. Source anchors at roadmap adoption

- apps/web/src/actors/warrior.ts — primitive mesh warrior and existing WarriorRig API.
- apps/web/src/actors/AnimatedWarrior.ts — limited named-group keyframe animation wrapper.
- apps/web/src/combat/CombatHitVolumes.ts — coarse volume proxies and presentation-to-domain region mapping.
- apps/web/src/effects/ProjectileClashEffects.ts — deterministic projectile visuals and bounded persistent embedded arrow identity.
- apps/web/src/effects/SurfaceMarks.ts — rig-attached wound and material mark lifecycle.
- apps/web/src/main.ts — web combat bootstrap; keep geometry generation out of it.
- packages/choreography/src/index.ts — pure deterministic presentation cues and timelines.
- docs/combat-v0.4D14-boss-phases.md — latest authored boss mechanics to preserve.
- docs/build-verification.md — how to compare GitHub and Cloudflare deployed build identities.

**Planning note:** this document records design decisions and required future work. It does not claim C0 or C1 implementation, CI, rendered quality, or deployment.


## C2.4 wrist transition regression / inspector diagnostic slice

The continuing wrist misalignment was outside PR #27's exclusively wrist/metacarpal
vertex sample. The pinned MakeHuman source has 248 weighted wrist vertices per
side; **162 also carry lowerarm01 weights**, 176 also carry lowerarm02. The
previous half-elbow-flexion helper (PR #26) therefore moves visible forearm/wrist
skin differently from the semantic elbow/wrist chain. The focused repair restores
full elbow flexion on the proximal forearm skin reference while continuing to
omit its axial pronation. A CPU-skinned mixed-ownership patch oracle checks
rigid elbow transportation under wrist flexion, deviation, fist and thumb pose;
a half-flexion mutation must fail. C2.4 visual acceptance remains pending a
focused rendered wrist inspection; remaining regions and C2.5 are not signed off.

The lab Bone Inspector exposes live canonical C1 markers, parent links, regional
search, a selected joint, full canonical ID, side, parent and copyable report,
using the same posed skeleton. It does not expose skin-only helper bones as
semantic joints or implement C4 editing.


## C2.4 hand deformation follow-up — thumb-web source transfer

Following the wrist regression correction, the next incremental C2.4 task
audited the imported **palm, thumb and finger-base** geometry against original
MakeHuman weight ownership. The real pinned CC0 source contains 1,606 distinct
rendered source hand vertices per side influenced by the metacarpal/finger
segments. The previous top-four mapping lost the small moving thumb MCP
influence at a five-owner wrist/thumb-web patch, producing a measured maximum
1.116mm difference from the unpruned, same-pose source-weight LBS oracle.

The repair consolidates the passive C1 wrist/palm skin matrices **only when a
vertex has more than four influences and both are present**, conserving
weight and preserving the thumb influence. The C1 palm is an unarticulated
child of wrist today; tests verify their equivalent skin transforms under
finger/thumb, fist, wrist and combined elbow pose combinations. Worst sampled
four-weight-to-unpruned error falls to 0.347mm across combined hand stress
poses (0.026mm under isolated thumb). A mutation restoring the old truncation
must fail the geometric regression. Existing original source-vertex/UV seams,
four normalized influences, FK, rig identity and combat remain unchanged.

The isolated Character Lab now has thumb+wrist and combined hand stress poses,
plus left/right thumb-web close-up views for future render review. **No actual
browser visual acceptance has been established by those CPU tests.**
Remaining C2.4 work includes close-up material/crease/volume review and
shoulder/axilla, forearm, lower-body, neck and jaw deformation. C2.5 and C3
remain deferred.

## C2.4 full-body source-fidelity audit — follow-up to PR #30

PR #31 establishes headless CC0 original-source weighted surface metrics for
shoulder, elbow, hips, knees, ankles, neck, jaw and combined poses. The new
motion-compatible shoulder weight compaction addresses a measured up-to-15.7mm
four-weight truncation defect, reducing the raised-arm source-reference error
to about 5.2mm. See [C2 anatomical import notes](character-studio-c2-anatomical-import.md)
for source selection, edge-strain measurements and mutation tests. This is
**not C2.4 quality completion**: high local edge distortion in axilla,
groin, knee fold and jaw remains, the shoulder's approximate distributed
motion is not anatomically calibrated, no volume/intersection acceptance
has passed and actual rendered visual inspection remains outstanding.
Continue geometric correction incrementally before C2.5; retain the
manual Phase Acceptance Chromium gate for C2.5 and do not start C3.


## C2.4 targeted deformation acceptance — closure decision (PR #32)

**Decision scope: C2.4 only.** The project owner reviewed the Character Lab
visually on the live website and reports no major visible deformation problems.
This is **user-provided visual signoff**, not a claimed independent screenshot
review or acceptance of every possible pose. In conjunction with the measured
source-weight repairs in PRs #23–#31, bilateral CC0 CPU-skinned regression
tests, stable semantic FK, and a green Fast CI run on the closure PR, the
current **C2.4 targeted skinning/deformation implementation** may be accepted
for the next C2.5 verification gate.

The closure adds a final combined headless real-asset regression that compares
actual skinned surface positions across UV-seam duplicates, verifies stable
original source IDs, normalized four-influence ownership, order-independent
FK replay, exact neutral recovery, separate concurrent rig instances, and
exactly-once geometry/material disposal. It does not alter C1 semantics, C2
skin algorithms, D14 combat or any body geometry.

**Explicit non-acceptance / technical debt:** Existing extreme local edge-strain
outliers, small remaining differences from the complete unpruned CC0 source
skinning, approximate shoulder/forearm helpers, and unconstrained muscle
volume/self-intersection evidence remain documented in the C2 import notes.
The user considers the visible result acceptable for **this intermediate
slice**; these numerical imperfections are not proof of zero artifacts or
production-ready anatomy. C2.5 must determine if they represent blockers
under a comprehensive pose matrix, physically plausible joint silhouettes,
desktop/touch render inspection, browser import-time and runtime performance,
memory/resource lifecycle and stable C3 contracts. Any failures reopen
targeted C2.4 corrections before C2 is declared accepted.

**C2.5 is not complete; C3 must not start before C2.5 acceptance.** The
repository's manual full Chromium Phase Acceptance workflow remains reserved
for C2.5 and is not silently substituted with Fast CI or the user visual
review of this intermediate slice.

### C2.5 implementation in progress — PR #33 (not a completion verdict)

The first C2.5 slice adds a versioned, reusable full-body FK diagnostic pose matrix,
replaces Character Lab's duplicate hardcoded switch, and adds full pinned-CC0
CPU-skin regression verification of supported poses, neutral recovery, UV
correspondence, semantic identities and inverse binds. A read-only versioned
morphology baseline auditor checks source identity, topology, skin normalization,
seam ownership, canonical joints and metric conventions without introducing C3
shaping or new combat actors. Expanded desktop/touch captures are defined for
the C2 Phase Acceptance run. Full runtime performance instrumentation,
geometry-strain adjudication, inspected mobile/desktop screenshots and the
manual exact-SHA C2 acceptance workflow remain outstanding. C2 remains open.
