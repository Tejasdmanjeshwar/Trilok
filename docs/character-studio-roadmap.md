> **C6.3 update (2026-11-19):** C6.2's four owner-approved UAL1 clips merged through [PR #112](https://github.com/Tejasdmanjeshwar/Trilok/pull/112), main SHA `89130350df0c05f38afe85a3ed2194b2ac93ef97`. C6.3 is being implemented in **one** [draft PR #118](https://github.com/Tejasdmanjeshwar/Trilok/pull/118); preliminary canonical gait blending and foot contact are not final acceptance. Directional authored motion, anatomical bounds, measurements and rendered validation remain open. See [C6.3 record](character-studio-c6-3-locomotion.md).

# Trilok Character Studio — Browser-Native Character System Roadmap (C0–C9)

**Mandatory phase closeout hygiene (2026-11-18):** At the end of each major C0–C9 phase and subsequent engine milestone, audit and remove genuinely retired code, routes, duplicate implementations, workflows and dependencies **without weakening regression coverage**. Retroactive C0–C5 debt is tracked in the [repository audit](repository-cleanup-audit-2026-11-18.md); C6 closure is gated on a committed phase cleanup report under the [phase-closeout policy](phase-closeout-cleanup-policy.md). This is separate from formal browser Phase Acceptance. C6.1 and C6.2 are merged, with C6 full phase acceptance still open; C6.3 is under active implementation in [draft PR #118](https://github.com/Tejasdmanjeshwar/Trilok/pull/118), and C6.4–C6.6 remain planned.

**C6 planning update (2026-11-18):** Blender and other external tools are explicitly allowed for optional **internal, automated animation production**. No user-side Blender dependency; runtime keeps the shared canonical rig, procedural corrections and authoritative combat timing. See [replanned C6 implementation](character-studio-c6-plan.md) / [Issue #104](https://github.com/Tejasdmanjeshwar/Trilok/issues/104). This policy supersedes any older language that forbids Blender in the development pipeline; the rule against *requiring the user to use Blender* remains intact.

**C5.5 audit status (2026-11-17):** C5.1–C5.4 have merged through PRs #83, #84, #86, #87, #88 and #89; this is **implementation progress, not C5 phase acceptance**. Verified starting `main` is `64ac634c91198eea30e83c583b08c70e0868d43f` with successful [Verify #44088605750](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44088605750). C5.5 remains in progress: [slider isolation PR #90](https://github.com/Tejasdmanjeshwar/Trilok/pull/90) passed CI and merged as `5114afedc6a2e4ba6473404f2274752e44a184c4`; [browser evidence PR #91](https://github.com/Tejasdmanjeshwar/Trilok/pull/91) passed CI and merged as `83fe948ec947f87529e83a8e60074a00118a358f`; [controlled benchmark PR #93](https://github.com/Tejasdmanjeshwar/Trilok/pull/93) also merged; [endpoint-cache optimization PR #94](https://github.com/Tejasdmanjeshwar/Trilok/pull/94) is being validated. Full browser visual audit, end-to-end latency/resource profiling, verified Cloudflare production SHA, exact-main C5 Phase Acceptance and owner approval remain outstanding. See [C5.5 evidence ledger](character-studio-c5-5-acceptance-audit.md). The following older phase snapshots are historical and should not be interpreted as the current branch state.

**C5 implementation progress (2026-11-15):** C5.1 single-hand source-rig grips merged via [PR #83](https://github.com/Tejasdmanjeshwar/Trilok/pull/83), owner visually accepted, with guarded source-surface contact tests. C5.2 two-hand reference longsword/staff, constrained bilateral arm IK, semantic secondary sockets and Studio preview are under review in [PR #84](https://github.com/Tejasdmanjeshwar/Trilok/pull/84). C5.2 sword/staff and body-clearance preview has owner visual sign-off, with green PR CI and Cloudflare feature-preview deployment at `0898994`. C5.2 can merge through normal PR checks; full desktop/touch Phase Acceptance is reserved for closure of C5 as a whole. C5.3–C5.5 remain planned. This supersedes historical snapshot lines below that describe C5 as not yet started.

**Status (2026-11-14):** C0/C1/C2 foundations accepted; C3 human morphology and integration changes through PR #64 merged. Final exact-`main` C3 Phase Acceptance [#43596286416](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43596286416) passed on `19fbef9ec931c42e7545c30ca9f44ba495bfac67` (307 unit/replay tests, 48 browser tests); owner accepted the infant mesh fix. C3 tracking [Issue #41](https://github.com/Tejasdmanjeshwar/Trilok/issues/41) remains open for its final record/signoff and independently verified deployment identity. C4.1 Studio foundation has merged via [PR #67](https://github.com/Tejasdmanjeshwar/Trilok/pull/67) ([implementation record](character-studio-c4-1-foundation.md)); C4.2 human body/facial customization has merged via [PR #69](https://github.com/Tejasdmanjeshwar/Trilok/pull/69) ([implementation record](character-studio-c4-2-customization.md)); C4.3 immutable memory-only editing and history are implemented in [PR #71](https://github.com/Tejasdmanjeshwar/Trilok/pull/71) ([implementation record](character-studio-c4-3-history.md)); C4.4 functional human appearance and modular capability descriptors have merged in [PR #72](https://github.com/Tejasdmanjeshwar/Trilok/pull/72) ([implementation record](character-studio-c4-4-appearance.md)); C4.5 camera, pose and inspection merged via [PR #74](https://github.com/Tejasdmanjeshwar/Trilok/pull/74) ([implementation record](character-studio-c4-5-inspection.md)); C4.6 UX/accessibility/performance implementation is tracked via [PR #78](https://github.com/Tejasdmanjeshwar/Trilok/pull/78) ([implementation record](character-studio-c4-6-polish.md)); C4.7 seeded human generator delivered in [PR #79](https://github.com/Tejasdmanjeshwar/Trilok/pull/79) ([implementation record](character-studio-c4-7-generator.md)); rendered screenshots, owner sign-off and final C4 acceptance remain outstanding in the [approved C4 plan](character-studio-c4-plan.md) / [Issue #65](https://github.com/Tejasdmanjeshwar/Trilok/issues/65). C5–C9 and combat migration have not begun.
**C4 acceptance update (2026-11-15):** Exact-main [Phase Acceptance #43630233758](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43630233758) passed on `67976101c887a79c5b833cac63eda18bafe8500c` (349 unit/replay tests, 74 desktop/touch Chromium tests, 208 screenshot captures). Owner confirmed Cloudflare serves the tested build and approved the Studio/random generator; [Issue #65](https://github.com/Tejasdmanjeshwar/Trilok/issues/65) is closed. **Next:** [C5 detailed plan](character-studio-c5-plan.md), [Issue #81](https://github.com/Tejasdmanjeshwar/Trilok/issues/81). This current status supersedes the older historical C4 status lines below.

**Repository baseline at planning time:** main @ db8348bd296a412262781d20a9f444fea474c692; playable 0.4.0-preview.19; combat 0.4-D14.  
**Scope:** shared, reusable character technology for Ramayana and subsequent campaigns.  
**First implementation phase:** C0 architecture audit/specification. Review the [C0 ADR](character-studio-c0-architecture.md) and its verification before starting C1.  
**Hard constraint:** authoring, customization, preview, rigging, validation, and game-ready baking/export must run within Trilok's own Three.js/TypeScript browser application. No Blender, Maya, separate character-creation service, or manual sculpting is required of the user.

## 1. Product intent and non-goals

Build a standalone lazy-loaded **/studio** experience, reachable from a separate tab/navigation entry in the existing Trilok website. Character Studio, the combat renderer, and future gameplay must instantiate the **same versioned character runtime representation**. Across the planned phases, the Studio should create, customize, validate, preview, and eventually (in C9 only) save, load and bake playable characters directly in the browser, including human, Rakshasa/orc-like, Vanara, winged avian-headed **humanoid** (Jatayu-like), and custom animal-headed humanoid archetypes. Later support multiple arms, legs, heads, tails and other anatomy extensions without assuming a fixed humanoid bone count.

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
| Studio | Lazy-loaded /studio route; player-facing responsive editor, shared human preview, in-memory recipes/history, advanced inspection, seeded character generation (no C9 baking or Save/Load) | apps/web/src/studio |
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

**Studio sections:** the C4 player-facing UI provides functional human selection/presets, existing body/face morphs, available appearance/material controls, pose/expression previews, camera/lighting tools, optional advanced rig/IK diagnostics, non-destructive editing, undo/redo and meaningful deterministic human generation. Future anatomical modules, fitted clothing/armor/hair, weapons/grips, wounds and dismemberment are exposed **only after their respective C5–C8 functionality exists**, never as fake controls. Save/Load and baking are reserved for C9. Support orbit and orthographic cameras, visibility controls, keyboard-accessible editing, reduced motion, failure recovery and section resets. See the [C4 product/UX plan](character-studio-c4-plan.md).

**Live edit:** mutate immutable recipe state; validate/canonicalize parameters; debounce heavy recomputation; generate in worker where viable; cancel/ignore stale generations; update preview with latest valid version; dispose replaced GPU/CPU resources.

**C9 deferred — Save/Load editable:** only after C4's Studio UI and C5–C8's weapon, animation, archetype and anatomy integrations are complete, add user-facing persistent Save/Load for versioned recipes, topology-family ID, dependency identifiers/versions, seed, archetype schema, and optional separate injury state. Internal in-memory recipe structures, stable hashes, deterministic regeneration and validation may exist earlier; they are **not** a persistent save feature.

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

Create bounded body/face parameters, topology families, corrective morphs, bone/IK/socket/refit calculations, stable hashes and extreme-combination tests. C3 validates internal recipe consistency and deterministic reconstruction, but **does not deliver a user-facing Save/Load feature**. Provide custom humanoid heads including primate, avian and bear-like profiles through compatible template families. Dismemberment/disfigurement state remains separate.

**C3 implementation record (human morphology):** C3.1 [morphology base](character-studio-c3-1-morphology.md), C3.2 [localized shaping](character-studio-c3-2-local-morphology.md), C3.3 [pose correctives](character-studio-c3-3-correctives.md), and C3.4 [human head morphology](character-studio-c3-4-human-head.md) retain the shared C1/C2 anatomical mesh. C3.5 [pinned MakeHuman human facial morphology](character-studio-c3-5-makehuman-facial.md) merged in [PR #54](https://github.com/Tejasdmanjeshwar/Trilok/pull/54). C3.6 [native MakeHuman human body controls](character-studio-c3-6-makehuman-body.md) are the current [PR #56](https://github.com/Tejasdmanjeshwar/Trilok/pull/56) candidate. C3.7 remains combined morphology integration and **manual C3 Phase Acceptance**. Old Primate/Bear procedural previews and unaccepted 3D model reconstruction experiments are retired from C3. Species-specific head reconstruction is deferred to C7; Save/Load is deferred to C9. [Issue #41](https://github.com/Tejasdmanjeshwar/Trilok/issues/41) remains open for C3 closure.

### C4 — Standalone Character Studio

**Approved detailed implementation specification:** [C4 Product, UX and Implementation Plan](character-studio-c4-plan.md); **tracking:** [Issue #65](https://github.com/Tejasdmanjeshwar/Trilok/issues/65). Build one incremental, reviewable slice at a time:

1. **C4.1 — Studio Foundation & Design System:** lazy-loaded /studio (deep link, desktop/touch), premium minimal responsive layout and accessible design tokens, centered 3D human viewport, orbit/view/lighting and proper loading/error/retry; existing shared runtime only.
2. **C4.2 — Character Customization:** complete original human MakeHuman body and facial controls, source fidelity, search, progressive basic/advanced groups, numeric precision, presets and resets, no forced camera focus.
3. **C4.3 — Editing Workflow:** immutable versioned **in-memory** recipe, undo/redo, grouping, selective reset, safe cancellation, staged validated regeneration and rollback.
4. **C4.4 — Functional Appearance & Extensibility:** actual available material/skin appearance controls, modular authoring capability contracts; defer unsupported hair, armor, equipment or anatomy without fake buttons.
5. **C4.5 — Preview & Inspection:** explicit cameras/orthographic views, pose/expression previews, optional advanced wireframe, skeleton and rig diagnostics, camera stability and responsive viewport.
6. **C4.6 — UX/Accessibility/Performance:** designer task testing, desktop/touch/keyboard/reduced-motion behavior, visual consistency, lifecycle and error recovery, device-measured performance.
7. **C4.7 — Final Meaningful Seeded Human Generator:** correlated profile-driven variations, deterministic/versioned seed, subtle-to-distinctive control, feature and section locks, regenerate unlocked groups, preserve validation, full editable output and history; new archetypes are C7.

**Player-facing hard requirement:** Studio UI and accessibility text must contain **no C0/C1/C2/C3/C4 (or later) phase labels, issue/PR numbers, source asset identifiers, engineering diagnostics or Git build details**. The only permitted technical metadata in the product interface is an unobtrusive **public app version** (About). Internal docs, issue tracking and test selectors may use phase codes. The UI must be an uncluttered, polished, mobile-responsive RPG character creator, not a replication of Character Lab.

C4 uses the same runtime character builder as Lab and game; it must not duplicate mesh logic or alter gameplay authority. The final exact-`main` C4 Phase Acceptance requires desktop/touch Chromium, rendered screenshot inspection, performance and owner signoff, independent Cloudflare build identity and full source/determinism tests.

**Do not implement user-facing persistent Save/Load, recipe-file import/export, or baking in C4**; C9 owns these after C5–C8. C5–C8 own real weapon handling, animation, additional archetypes and injury integration.

### C5 — Weapon handling and IK

**Approved implementation breakdown:** [C5 Weapon Handling, Anatomical Grips & IK Plan](character-studio-c5-plan.md); **tracking:** [Issue #81](https://github.com/Tejasdmanjeshwar/Trilok/issues/81). C4 was owner-accepted following exact-main [Phase Acceptance #43630233758](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43630233758); C5 is not yet implemented.

Implement calibrated hand grips, finger pose profiles, secondary-hand IK, sword/shield, bow/string nock/draw/release alignment and grip testing across parameter ranges. Ensure world-space weapon/arrow origins agree with authoritative projectile data **without changing the combat authority, projectile physics, or combat timing**. Work in focused independently reviewed phases:

1. **C5.1 — Anatomical weapon grip foundation:** validated data-driven grip/socket metadata and source-derived finger articulation, one replaceable procedural sword (blade, guard, handle and pommel), functional accessible Studio preview with hand Focus, morphology/pose/contact tests and visual screenshots.
2. **C5.2 — Two-handed coordination:** constrained secondary-hand targets and arm/wrist IK on a two-handed sword or staff with reachability and solver tests.
3. **C5.3 — Sword and shield:** independent hand/forearm contacts, equipment previews and morphology/pose validation.
4. **C5.4 — Bow and arrow alignment:** bow hand, string/nock/draw/release preview and measured agreement with authoritative arrow-origin rules, with no invented gameplay events.
5. **C5.5 — Integration and acceptance:** comprehensive contact, lifecycle, accessibility, performance, desktop/touch Chromium and deterministic regression tests; exact-main C5 Phase Acceptance, screenshot review, deployment identity and owner sign-off.

The existing continuous MakeHuman human rig and `AnatomicalFK` supply hand and finger DOF; the legacy `AnimatedWarrior` and its approximate weapon origins remain intact until explicitly parity-validated. Procedural reference weapons are for visual/contact testing, not production-ready art. Evaluate official MakeHuman/MPFB references and individual asset licenses; do not require Blender or add unverified community models.

### C6 — Hybrid full-body animation, reproducible clip baking and procedural controls

**Updated owner workflow (2026-11-18):** The developer/automation pipeline **may use Blender or other appropriately licensed external animation, rigging, retargeting, mocap or asset-generation software** whenever this improves animation quality, implementation time or reproducibility. The user does **not** need to install, operate, sculpt or manually animate in those tools. The deployed browser Game and Character Studio must function without them. Prefer scripted/headless external-tool generation with pinned tool versions and repeatable export/validation; availability, automation and licensing must be audited rather than assumed.

**C6 implementation plan:** [C6 Hybrid Animation Production Plan](character-studio-c6-plan.md); **tracking:** [Issue #104](https://github.com/Tejasdmanjeshwar/Trilok/issues/104). Use one canonical Trilok runtime skeleton shared by Studio and combat. Implement versioned semantic clip and retargeting contracts, a traceable asset-ingest/bake pipeline, layered and motion-masked animation, full-body torso/shoulder/foot IK, grounded locomotion, joint/twist/corrective constraints, weapon-aware attacks and defense presentation, validated root-motion policy, and a browser preview/iteration workflow. Preserve C5 grip alignment and deterministic D14 combat authority, reactions, hit windows and projectile events. Bake reusable clips rather than recalculating all motion each frame; retain runtime IK, procedural reactions and morphology correction. Avoid baking a separate complete library for every body morph.

**Boundary with C9:** C6 may precompute, version, export, import, test and cache **animation clips and their metadata**, including offline Blender-produced assets, as part of the development content pipeline. C9 still owns final **character asset baking**, persistent user-facing recipe Save/Load, full production GLB/asset packaging, optimized LODs and end-to-end round trips. Do not scope-creep C6 into C9.

**Execution:** C6.1 rig/clip contracts and tooling feasibility; C6.2 verified minimal bake/import and playback; C6.3 locomotion/feet and root-motion policy; C6.4 layers, torso/shoulder/weapon contact; C6.5 combat motion and deterministic event synchronization; C6.6 retargeting, optimization, broad visual/functional integration and **single phase-level acceptance**. These work packages are an updated implementation proposal pending individual slice audits, **not** assertions of implementation. An ambitious browser animation authoring UI may be developed incrementally once the pipeline works; do not reinvent Blender before verifying external-tool production.

**Parallel game/Studio delivery:** Keep the monorepo and shared character packages. Separate deployment artifacts, release identities and URLs for Game and Studio through an independently reviewed infrastructure change before claiming that their deployments are isolated; the current Vite multi-page build and one Cloudflare Worker still share a deployment.

### C7 — Archetypes and modular appearance

Implement Rakshasa/orc-like and Vanara proportions, optional multi-arm/multi-head variations, Jatayu-like **winged humanoid** with independent wing rig, interchangeable custom animal heads, garments, armor, horns, hair and accessories. Validate fitted clothing and LODs per supported archetype.

### C8 — Combat injury and anatomy integration

Migrate hit proxies, precision contacts, melee reach, equipment capabilities, parry/intercept origins, wounds, embedded arrows, surface anchors, disfigurement and **prevalidated anatomical dismemberment**. Preserve deterministic domain authority; add explicit reviewed rules for actual functional consequences.

### C9 — Production hardening and baking

After the Lab, C4 Studio UI and C5–C8 character-related systems are complete, implement **user-facing Save/Load** of editable characters (versioned recipe data, dependency identity, anatomy topology family, deterministic seeds and migrations), restoring the same appearance and compatible pose/rig state in a fresh Studio session. Then optimize skinning/LOD/texture/meshes and workers; bake and export/import presets and assets; validate GLB and round trips; run mobile/desktop profiling, seeded regeneration/replay regression, device browser tests, screenshot/pose review, resource-lifecycle and failure-recovery checks. No incomplete save UI or premature on-disk format should be required in C3/C4. Asset production claims need rendered inspection and measurements.

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


**C4.7 owner-directed revision:** The approved UI is one-click Random character, replacing the previously merged style/lock/seed panel. Broad source-supported body/facial randomization is implemented in the focused follow-up; final visual inspection is still required. See [generator record](character-studio-c4-7-generator.md).
