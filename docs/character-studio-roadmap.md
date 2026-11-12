# Trilok Character Studio — Browser-Native Character System Roadmap (C0–C9)

**Status:** C0 architecture and C1 contracts implemented; C2 research now includes a skinned implicit prototype and an experimental, checksum-verified MakeHuman core anatomical source import ([C2 implementation notes](character-studio-c2-anatomical-import.md)). Neither mesh has passed full anatomical/visual/deformation gates. No playable Character Studio, procedural customization, or combat migration is present.  
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
- **C2.5 Validation and C3 readiness:** examine complete pose matrix, topology, deterministic FK and skin correspondence, actual desktop/mobile renders, performance and repeated disposal; document C3 shape-ready bind and landmark APIs. Record remaining caveats without declaring AAA quality.

**Deliberately deferred:** C3 anatomical body/face shaping and male/female morphology presets (gender identity must remain independent of morphology); C4 full studio UI; C5 calibrated grips/hand IK; C6 full-body IK, animation layers and retargeting; C7 additional archetype appearance; C8 actual disfigurement, severing and wound integration; C9 baking/export/reimport. Track all in Issue #15 without reclassifying them as C2 failures. No swap of the D14 combat actor or combat-domain changes in C2.

### C3 — Parametric shaping and head families

Create bounded body/face parameters, topology families, corrective morphs, bone/IK/socket/refit calculations, stable hashes and extreme-combination tests. Provide custom humanoid heads including primate, avian and bear-like profiles through compatible template families. Dismemberment/disfigurement state remains separate.

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

For **each** phase: inspect live repo state and existing relevant source; document intended scope and risks; create a feat/** branch; implement only scoped contracts/features; add tests and docs; run the available pnpm typecheck, test, build and appropriate browser checks; inspect full CI; open a PR; merge to main only when required CI is verified; record new merged SHA and compare deployment identity independently where possible. A docs-only PR still needs the repository's checks if they are required. Never assert Cloudflare deployed just because GitHub merged.

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
