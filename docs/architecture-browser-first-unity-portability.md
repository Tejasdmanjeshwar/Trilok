# ADR — Browser-first development and future Unity portability

**Decision:** Approved on 2026-11-21 by the project owner. **Status:** active architecture policy; **Unity implementation is deferred**.  
**Source of truth:** current `main`, [architecture](architecture.md), [Character Studio roadmap](character-studio-roadmap.md), [C6 plan](character-studio-c6-plan.md), and [C6.3 record](character-studio-c6-3-locomotion.md). Historical phase/commit references in those records remain historical.

## Intent and ownership

Trilok currently develops in TypeScript, Three.js, Vite and pnpm for quick iterations, browser accessibility, deterministic gameplay validation and owner-reviewable Cloudflare/Netlify builds. This remains the **active implementation**. Do not suspend, hollow out or postpone C6.3–C9 merely because Unity is intended for the future.

The browser has two first-class purposes:

1. **Gameplay Lab:** implement and test enjoyable combat, AI, movement, encounter pacing, progression, capabilities and campaign loops, using replayable deterministic scenarios and actual playtesting.
2. **Character Studio:** Trilok-specific procedural **mini-Blender**, not a general-purpose DCC clone. Support anatomy, shape/facial recipes, rigging, skinning, animation/retargeting, costume/equipment contact, inspection, injuries, both runtime generation and offline/baked assets, with high-quality visual checks. User should not need Blender or Unity.

**Unity is the intended future native production environment**, not a required current dependency. Do not create a Unity project, force the owner to install it, require an editor/license/CI runner, or promise a Unity version/build until migration is explicitly scheduled and the toolchain is verified. When feasible, port Studio and gameplay into C#/Unity, exploit native rendering/GPU and editor-time *or* runtime generation/baking, validate feature/data parity, and then retire **Browser Character Studio**. The **Gameplay Lab may remain** as a small, accessible sandbox if it remains useful; do not promise to maintain two full production engines.

## Architectural contract now

| Layer | Current owner | Portability rule |
| --- | --- | --- |
| Gameplay, combat, AI, choreography, input semantics | Pure `packages/` TypeScript | No Three.js, Unity, DOM or browser scene objects. Keep deterministic seeds, timestamps, fixed update policy and simulation-owned damage, projectiles, movement and legal reactions. Port behavior to pure C# using recorded scenario parity. |
| Character identity and authoring data | `packages/character-core` and versioned assets | Stable anatomical segment/joint/socket IDs, topology families, provenance/hashes, units, axis/rotation conventions, deterministic recipes, versioned validators and migrations. |
| Geometry, skinning, IK, procedural assets | Current browser character modules | Preserve reproducible source assets, formulas, shape constraints, source-to-output mappings and independent numerical fixtures. These algorithms are **portable by specification and test**, not automatically executable C# code. |
| Presentation/UI/rendering | `apps/web` Three.js | May be engine-specific. Keep platform glue behind adapters; do not bleed scene objects into gameplay authority. No premature Unity-specific abstractions that make current browser work harder. |
| Bakes/exports/persistence | Browser Studio C9 and source tooling | Plan editable recipe **and** generated/baked asset modes. Standard export (e.g. glTF/GLB plus versioned Trilok metadata) is a transport, not the sole authority or a substitute for custom skeletal/anatomy state. |

**Coordinate and serialization rules:** C1 contract is metres, right-handed +Y up, +Z forward, normalized XYZW quaternions and stable semantic IDs. Preserve explicit bind transforms and topology/source asset identities. On future Unity import, measure/reconcile FBX, handedness, matrices, winding, morphs, inverse binds and skin weight fidelity; never silently reinterpret source rotations or world scale.

**Runtime/editor parity:** procedural generation logic must accept the same versioned recipe and yield compatible identities and capabilities in either browser interactive mode or a baked-asset path. A future Unity port must also allow **in-game runtime generation**, not only editor-generated prefabs. GPU acceleration is an optional measured backend with CPU/platform fallback, not a correctness dependency.

**Asset rights:** track original asset license, permitted commercial/embedded distribution, hash, source and derived-asset lineage. Format conversion, browser extraction and importing into Unity do not expand license rights. Keep the rejected 100STYLE experiment retired; preserve approved Kevin/UAL1 bytes.

## Roadmap and sequencing decision

- **C6.3:** finish remaining directional locomotion, gait transitions, grounded feet/pelvis, gameplay-authoritative movement and rendered/desktop/touch regression using the **27 owner-approved Kevin animations**. No repetition of clip-selection review.
- **C6.4–C6.6:** complete useful browser weapon-aware animation, layered combat presentation and animation/retargeting quality so gameplay and Character Studio can be validated. Avoid reinventing full Unity-like engine subsystems or unbounded browser-only polish; do not reduce actual playability/quality or remove existing tests.
- **C7:** modular archetype anatomy, geometry, head/wing/limb extensions and clothing/equipment on the browser's shared character pipeline; author portable parameters, source shapes and topology contracts.
- **C8:** anatomical injury/dismemberment gameplay contracts and credible Studio/Gameplay Lab feedback; preserve domain authority and correct surface attachments.
- **C9:** implement **both** editable Save/Load and usable game-ready procedural/baked character assets in the browser; version source/recipe/asset identities, migrations, glTF/GLB exchange and metadata, runtime regeneration, resource/performance tests. Do not postpone C9 to Unity.
- **Future migration (separately approved):** portability audit and golden fixtures -> feasible pinned Unity toolchain -> one representative character/combat vertical slice -> C# authoritative replay parity -> native Studio runtime + baking parity -> production migration and asset/content pipelines -> browser Studio retirement after acceptance. No schedule or Unity-version commitment today.

**Browser Character Studio retirement gate:** a future Unity build demonstrates required human/nonhuman topologies, editable recipes, runtime generation, baked outputs, skinning/IK, animation, equipment, injuries, persistence/migration, source asset provenance, reproducible test parity, native visual quality and measured performance. Preserve user-created recipes, source files and semantic IDs. Retire only after signed-off parity and data round-trip; never delete browser tooling merely because a Unity prototype exists.

## Do and do not

**Do:** maintain one canonical anatomy graph and authoritative simulation; validate behavior with deterministic/headless tests and actual browser gameplay; verify deformation/visual output by renders; pin inputs; track costs and memory; use reusable interfaces and explicit disposal; maintain backwards-compatible, versioned recipes and provenance.

**Do not:** build an imitation of all Blender features, fork the combat rules for rendering, mix actor root travel with pelvis pose, hardcode clip/frame-specific skin fixes, require owner-operated external tooling, preemptively introduce UnityEngine/C# into the TypeScript repository, create an empty Unity project, automatically merge/deploy, or retire the browser Studio before feature/data parity.

## Current repository hygiene and acceptance

The companion [migration-readiness audit](migration-readiness-cleanup-audit-2026-11-21.md) records **evidence-backed** immediate cleanup, retained bridges and deferred changes. Small boundary checks run in ordinary fast Verify, while full Chromium remains explicit/manual and production deployment requires separate authorization. A future Unity CI workflow is not added until an actual Unity project and reproducible licensed runner exist.

**Decision review triggers:** migration tooling becomes available; a specific Unity feature proves a better production approach; C6 or C9 acceptance exposes a portability gap; a saved recipe schema changes; or significant third-party licensing/runtime compatibility changes.
