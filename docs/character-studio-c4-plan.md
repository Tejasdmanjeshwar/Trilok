# Trilok Character Studio — C4 Product, UX and Implementation Plan

**Status:** Approved design/engineering plan; implementation not started.  
**Tracker:** [Issue #65](https://github.com/Tejasdmanjeshwar/Trilok/issues/65)  
**Prerequisites:** Existing C1–C3 human runtime, source-pinned MakeHuman body/face morphology, C2 Character Lab, existing Phase Acceptance workflow. Issue #41 remains a separate C3 record; do not silently claim closure.  
**Execution:** C4.1 through C4.7 in focused PRs; do not implement all slices in one branch.  
**Scope:** Responsive, browser-native, production-aspirational *human* character creator using the **same** runtime as the Character Lab. Future archetype, weapon, animation, damage and baking features are separately gated.

## 1. Non-negotiable product contract

1. **No development-phase terminology in product UI.** Visible Studio content, titles, menus, tooltips, notices, empty states, URL fragments, aria-labels, screen-reader announcements and error messages must never expose internal milestones such as `C0`–`C9`, "C3.5", engineering identifiers, issue/PR numbers, source asset filenames, internal control keys, Git SHAs or a "laboratory" label. Internal implementation filenames, tests, issue descriptions, CSS selectors and engineering logs may use those identifiers. **Only the public application version** may appear, unobtrusively, in About; no branch, commit or build identifiers in player-facing Studio. A separate engineering-only Lab may retain diagnostics.
2. **Game-style editor, not a spreadsheet.** The living 3D character is the focus. Reveal a single contextual parameter panel, not all sliders at once. Favor familiar player terms, immediate feedback, short helpful explanations, meaningful sections, contextual controls and deliberate neutral styling.
3. **Production-grade UX target requires evidence.** Coherent typography, spacing, interaction states, mobile ergonomics, performance and rendered inspection are mandatory. Existing C2/C3 model quality is not automatically AAA or ready for an asset marketplace.
4. **Shared source of truth.** Character Studio, Character Lab and future runtime instantiate the *same* versioned character definition, geometry and rig assemblies. Do not copy the Lab's monolithic UI, source data, deformation algorithms, skin weighting or pose logic. Refactor shared creation services incrementally behind interfaces.
5. **Unmodified gameplay authority.** Studio remains presentation/authoring infrastructure. No changes to combat damage, projectiles, AI or timing, and no accidental imports that start the combat scene at `/studio`.
6. **Honest scope.** Only working controls should be visible or enabled. Do not show fake hair/armor/weapon/dismemberment selectors before compatible assets and systems exist. C5 handles grips, C6 advanced animation, C7 new anatomical archetypes and fitted appearance, C8 injury, and C9 persistent Save/Load, recipe-file import/export and baking. This remains an in-memory editor through C4.

## 2. Product experience and navigation

### Entry and basic journey
- Route: **`/studio`**. Add a clear **Character Studio** navigation entry from the game without loading the combat bundle or altering the existing `/c2-lab.html` engineering workflow. Direct deep link, reload and browser back navigation must work. Configure Vite/Cloudflare delivery for the actual route; test deployed path independently.
- On opening, progressively load a supported human into a visible, attractive neutral pose with a clear loading/progress state and graceful failure/retry. No blank canvas or duplicate authoring app.
- Main journey: choose supported human foundation or preset → edit body and face → adjust appearance supported by real assets → inspect in natural pose and close-up → optionally generate a meaningful variation → refine result. The same editor remains active throughout; do not unexpectedly reset the camera, pose or unrelated parameters on tab switches.
- Primary headings: **Character**, **Body**, **Face**, **Appearance**, **Pose**, **Generate**. Nested sections are contextual. Architecture reserves additional anatomy/wardrobe/weapon/injury capabilities for later phases, using feature manifests and unavailable-state handling rather than fake tabs.
- Search across all existing body/face controls (including native modifiers) with human-readable aliases and group names. An **Advanced** disclosure exposes detailed controls and exact numeric editing while preserving original native endpoints and permanent stress extensions. Stress/unsafe extrapolation has clear optional guidance, not silent clamping of existing developer controls.
- Basic features: section-local reset, full reset with confirmation when relevant, camera reset, comparison with section defaults where performant, keyboard-accessible history. No forced camera movement on selecting a body feature; an explicit **Focus** action may frame it.

### Responsive layout
- **Wide desktop:** slim category rail + uninterrupted central 3D viewport + one contextual editor panel; top bar with Studio title, undo/redo, optional settings/About. Adjust panel sizes without hiding key portions of the character. No permanent logging or statistics in the default viewport.
- **Small desktop/tablet:** collapsible category navigation and optionally overlaid or docked inspector with predictable keyboard and pointer behavior. Maintain a minimum useful model view; simplify ornament before hiding actions.
- **Phone portrait/landscape:** full-width character viewport above a snap-height bottom sheet; thumb-friendly category tabs, large sliders/touch targets, no horizontal page scroll and no full-screen editor obscuring the character during manipulation. Portrait head-focus remains visible when editing face controls. Include keyboard and screen-reader alternatives to drag gestures.
- Respect safe areas, dynamic viewport sizes, reduced motion and high contrast. Hide truly unavailable controls; do not expose disabled dead buttons simply to imply completeness.

### Visual system
- A restrained premium fantasy character-creator aesthetic: quiet dark/neutral surfaces, clear type hierarchy, controlled metallic/warm accent, consistent 4–8px spacing rhythm, strong focus indicators and predictable transitions. Avoid ornamental clutter and illegible microtext.
- Provide coherent states for hover, selected, loading, disabled, unsaved-in-memory edits, error and retry. Use CSS tokens and reusable layout, input, tooltip, disclosure and feedback primitives.
- Professional preview: full body / portrait / regional zoom, freely orbiting camera, front/side/rear/three-quarter and orthographic views, neutral lighting presets and background changes; maintain camera/pose when editing unrelated options. Avoid auto-focus on control changes. Accessible model manipulation and explicit reset view.
- Diagnostics (skeleton, wireframe, bone inspection, rig/IK and source/pose warnings) belong in an advanced **Inspection** mode and/or Lab, not the everyday user workflow. Friendly errors must not surface source IDs or internal phase terms.

## 3. Shared architecture, editing state and runtime

- Adopt an incremental **shared character editor service**, not a second source for human mesh/morph code. Present pure versioned state and an adapter to the already-implemented human runtime; separate recipe/state/validation from Three.js renderer and UI.
- Recipe state is **internal, memory-only, deterministic**: schema version, supported archetype/topology-family ID, validated body and facial modifiers, procedural appearance parameters when available, selected preset, generation seed and generator version. Keep ephemeral editor view state (camera, selected tab, pose, expanded sections) separate from the anatomical recipe. No persistent Save/Load or file serialization UI in C4.
- Centralized command/reducer model for edits, section reset, presets, undo/redo and generator actions. Snapshot boundaries are semantic: one drag gesture produces one undo entry; programmatic updates never silently bypass history. History is bounded, non-destructive and replayable; invalid input does not commit.
- One canonical control metadata catalog maps source IDs to UI labels, group, bounds, precision, visibility and capability requirements. Avoid duplicating MakeHuman math or generating inconsistent slider limits in multiple UI components. Preserve native values, negative/positive target semantics and user's accepted extreme sliders.
- Preview pipeline: validate/canonicalize the next recipe, compute changes deterministically, stage changes and commit only the latest valid generation (request token/cancellation). Use targeted incremental updates when possible; debounce expensive work and evaluate workers only where measurable. Preserve the previous good mesh on error. Refit bones, binding, sockets and IK in the same transaction as the surface. Dispose discarded geometry, textures, morph arrays, workers, listeners and GPU buffers.
- Keep the Character Lab and Studio using a common creation/runtime path; Lab stays an engineering tool and C4 changes must not regress existing pose, body, face or combat suites.
- Capability manifest determines which sections are live today and which later anatomy/presentation modules can be plugged into the editor. C4 initially targets **human** only; no misleading Rakshasa/Vanara previews or hardcoded unsupported assets.

## 4. Deliverables by implementation slice

### C4.1 — Foundation, route and design system
- Ship a real lazy-loaded `/studio` entry and link from the main site. Keep game and Lab bundles isolated; no combat scene initialization in Studio.
- Establish shell, layout design tokens, compact navigation, responsive contextual panel, rendering viewport, loading/error/retry, keyboard/touch basics, reduced-motion behavior and accessible labels.
- Render the existing CC0 human using the shared C1–C3 loader/rig. Orbit, zoom, neutral and front/side/rear camera actions function; lighting is coherent and materials are disposed correctly.
- **Acceptance:** no visible internal milestone text, no dummy controls, direct `/studio` load on desktop/touch, sensible screenshot quality, good camera/touch interactions, no Lab/combat regressions. This slice is a usable foundation, **not** a declaration that full Studio is complete.

### C4.2 — Human body and facial customization
- Integrate *every existing supported* body and facial morphology parameter from the existing registries without changing the pinned MakeHuman target evaluator, original extreme testing ranges or anatomical/rig semantics.
- Organize Body (age, stature, build, musculature, proportions, local shaping) and Face (head, brow, eyes, nose, cheek, lips/mouth, chin, jaw, ears, asymmetry) with intuitive entry-level controls, advanced modifier filtering, search, numeric precision, defaults and section resets.
- Offer curated current human presets; source-defined values and user choices remain exact. Switch presets with predictable history. Avoid camera hijacking.
- **Acceptance:** parity tests across all active controls and source extremes, deterministic mesh/body+rig alignment, age 0–0.06 regression, facial/jaw pose regression, full reset and camera stability.

### C4.3 — Professional editing and memory-only recipe workflow
- Add immutable versioned recipe, pure validation, bounded undo/redo, semantic action grouping, preset reset, last-valid preview, cancellation/rollback, error recovery and deterministic rebuild from in-memory state.
- Keep appearance controls, editor/UI state and anatomy state separate. No localStorage, cloud storage, project files or save/load dialogs.
- **Acceptance:** full edit→undo→redo round-trips including during in-flight regeneration, order independence where defined, no leaked GPU or worker resources, no stale result overwriting the latest recipe.

### C4.4 — Appearance and modular UI readiness
- Integrate real controllable skin/material properties and appearance presets available on current human. Offer accurate thumbnails/previews only when data/material support exists.
- Define data-driven plugin/control descriptors for future hair, garments, fitted armor, anatomy extensions and equipment. Do **not** create fake functioning widgets, fabricated assets or pretend C5–C8 implementations exist.
- **Acceptance:** all exposed appearance controls demonstrably affect the rendered character, remain undoable, and preserve materials/lighting/accessibility. Defer unsupported content explicitly in technical documentation.

### C4.5 — Camera, pose and anatomy inspection
- Add player-friendly pose/expression previews, independent orbit/orthographic/preset cameras, silhouette/light/background checks and explicit regional Focus without overriding manual camera state.
- Keep advanced inspection separate (skeleton/wireframe, region/bone overlays, skin/rig/IK diagnostics, supported stress poses). Extendable hooks for future weapons and injury, without implementing either here.
- **Acceptance:** correct front/side/three-quarter and close-up captures, jaw/shoulder/knee/finger pose comparisons, touch camera testing, no damage/combat authority changes.

### C4.6 — UX/accessibility/performance polish
- Conduct real designer-task walkthroughs: make a distinct adult, adjust infant morphology, sculpt asymmetry, modify one facial area, undo it, restore preset and inspect a posed character.
- Keyboard focus order, dialog/slider semantics, labels, contrast, screen reader announcements, 44px-ish mobile touch target goal, reduced motion and platform gestures. Measure initial load, edit latency, FPS and memory/resource disposal on representative desktop and constrained mobile; set release budgets from measured baselines, not invented benchmarks.
- **Acceptance:** desktop and touch Chromium screenshots reviewed, responsive widths/rotations, no blocking UI, no WebGL leaks across repeat navigation/rebuild, robust context-loss and error retry where feasible.

### C4.7 — Meaningful seeded human generator (final feature)
- Implement last, after the editor's shared state and supported controls are stable. Use deterministic, versioned PRNG and **profile-based correlated sampling** rather than randomizing every slider independently.
- Human starter profiles include balanced, athletic/warrior, lean/scout and sturdy/guardian **as design distributions, not fixed hardcoded meshes**. Sample sensible linked groups: age ↔ overall proportions/head ratio; stature ↔ limbs/torso; muscle/fat/build ↔ shoulder/chest/limb mass; face ↔ related nose/cheek/jaw/eye morphology. Respect ancestry/body values without stereotyping or making assumptions about identity.
- User controls: seed, subtle↔distinctive variation, choose style, lock Face/Body/Age/Appearance or selected features, regenerate only unlocked groups, inspect resulting differences, undo/redo and refine the output manually. Generator seed and version belong in the internal recipe; identical input must reproduce identical full parameters.
- Reuse existing target validators, supported native ranges, topology and deterministic rebuild. Define bounded retries or safe fallback on anatomically invalid combinations; never yield nonfinite values, collapsed binding or incomplete previews. Avoid indefinitely searching for a valid candidate.
- **Acceptance:** fixed-seed snapshot and property-based tests, locked-group invariants, same-seed reproducibility, diverse-but-valid profiles, age and extreme regression, editable output, desktop/touch UI screenshots and user visual sign-off. No persistent Save/Load in C4.

## 5. Verification and release gates

For every focused slice: inspect latest `main`, create a feature branch, update tests/docs, open PR, require exact PR-head `verify` green (strict TS, full Vitest including seeded combat replays, production build and build identity), review, merge, confirm latest `main`. Run focused Chromium/visual checks for relevant graphics-heavy changes. Do not claim deployed verification from CI alone.

For **final C4**: dispatch the full **Phase Acceptance** workflow on exact candidate `main` SHA with phase `C4`, require **desktop/touch Chromium** matrix, inspect actual screenshots and interaction recordings where available, verify live Cloudflare `/studio` and `/build-info.json` SHA separately, record owner visual/usability acceptance in Issue #65 and roadmap. Any subsequent commit invalidates previous exact-SHA signoff.

Mandatory test axes:
- No player-facing milestone/internal strings in Studio DOM/aria/loaded copy (automated audit; About version explicitly allowed); no inaccessible hidden technical labels.
- Shared runtime and source-target parity, unchanged C1/C2/C3 controls, full supported range, baby-to-child mesh/rig/skin alignment, facial+jaw and shoulder/knee poses; no accidental new topology or art assets.
- Navigable with keyboard, touch, screen reader semantics and reduced-motion; responsive screenshot coverage at typical phone/tablet/desktop viewports and zoom.
- Preset, control, reset, history, generator seed/locks, asynchronous cancellation/retry, no stale preview, and complete disposal across repeated sessions.
- Measured initial loading and interaction responsiveness on representative devices; record actual benchmarks/limitations, avoid unverified claims of constant 60 FPS.
- C4 must not modify gameplay damage resolution, AI timing or current authoritative combat semantics.

## 6. Explicitly deferred

- **C5:** real weapon grips, retargeted hand contacts and weapon IK.
- **C6:** full-body animation/retargeting, layered animation and locomotion IK.
- **C7:** new Rakshasa/Vanara/winged/animal-headed or extra-limb topology families, modular fitted clothing/armor/hair and archetype-specific generation.
- **C8:** runtime wound/disfigurement/dismemberment behavior and combat integration.
- **C9:** persistent Save/Load, file import/export, finalized baking and GLB round-trip, LOD/production hardening.

C4 UI contracts may support these in the future, but actual navigation must not promise them ahead of functionality.

## 7. Immediate handoff — C4.1 only

Inspect latest main, README, roadmap, this plan, C0 ADR, Character Lab runtime, Vite entrypoints and CI. Implement a new responsive lazy-loaded `/studio` with attractive accessible layout, large existing skinned human preview, essential camera/lighting actions, loading/failure states, a main-site navigation link and clean first-class product wording. Never show development phase codes or engineering strings in Studio. Use the shared human builder; no duplicate morphology, no generator implementation, no C4.2–C4.7, no C5–C9, no user-facing Save/Load. Add strict TS/unit and focused desktop/touch Chromium UI/visual checks, update docs, open PR, merge only after exact-head Verify, then check resulting main and deployed preview separately.
