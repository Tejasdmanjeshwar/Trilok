# Trilok Character Studio — C5 Weapon Handling, Anatomical Grips & IK Plan

**Status (2026-11-15):** approved plan in execution. C5.1 merged with owner visual acceptance via PR #83; C5.2 two-hand sword/staff and morphology-aware body clearance owner-approved on the exact feature preview in PR #84; merge candidate after green normal PR CI. The manual Phase Acceptance workflow is reserved for closure of the overall C5 phase, not each subphase. C5.3–C5.5 not started.  
**Tracking:** [C5 Issue #81](https://github.com/Tejasdmanjeshwar/Trilok/issues/81).  
**Predecessor:** C4 [Issue #65](https://github.com/Tejasdmanjeshwar/Trilok/issues/65) formally closed after exact-`main` [Phase Acceptance run #43630233758](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43630233758), 349 unit/replay tests, 74 desktop/touch Chromium tests, 208 captured screenshots and owner confirmation of matching Cloudflare deployment.  
**Parent:** [Character Studio C0–C9 roadmap](character-studio-roadmap.md), [C0 architecture](character-studio-c0-architecture.md), [C1 contracts](character-studio-c1-contracts.md) and [C4 plan](character-studio-c4-plan.md).

## 1. Product outcome and hard boundaries

C5 makes the **existing shared continuous human runtime** credibly wield weapons in browser-native Three.js. A weapon should remain planted in the hand while the hand changes pose, individual digits should wrap around a real handle, and offhand contacts should remain stable where anatomically reachable. The geometry and metadata must support replacing reference assets with future production assets without rewriting grips, IK or gameplay.

- **No Blender, Maya or manual sculpting required.** The Studio is the playable/designer-facing visual acceptance surface, while Character Lab remains an engineering validation surface.
- **Authoritative combat is unchanged in C5.** `packages/combat`, AI, choreography, timing, damage, defensive windows, projectile ballistics, hit evaluation and legal attack/reaction decisions stay domain-owned. Weapon pose, string, draw and contact visualizations must not synthesize damage, projectile hits or release events.
- **Respect existing architecture.** `SemanticCharacter` owns semantic bone/socket lookup; `AnatomicalFK` owns calibrated anatomical pose limits and secondary skin helpers; Studio uses the existing skinned human runtime and immutable in-memory recipe. No second rig, hidden character mesh, magic root scaling, or replacement combat actor in C5.1.
- **C6** owns full-body locomotion, layered animation and global retargeting; **C7** owns archetype-specific rigs and production modular clothing/armor/hair; **C8** owns injury consequences and actual dismemberment; **C9** owns persistent Save/Load, asset baking, GLB export/import and final production optimization. The C5 reference weapons are validation assets, not a promise of production-quality art.
- **Player UI** must never display C5 or other engineering phase labels, semantic joint IDs, PR/issue numbers, build internals, debug metrics or unsupported future controls. Use human-readable terms such as “Equipment”, “Sword”, “Grip”, “Left hand”, “Right hand” and “Inspect”.

## 2. Starting architecture — verified against main when plan drafted

The reference commit was `67976101c887a79c5b833cac63eda18bafe8500c`; implementers **must recheck current `main` and code before each slice**.

| Existing implementation | Reuse/constraint |
| --- | --- |
| `packages/character-core/src/schema.ts`, `presets.ts`, `validate.ts` | Version-1 semantic sockets already include primary/secondary grips, shield, bow nock/string and projectile origins; they are *metadata*, not solved weapon contact. Audit duplicate/mirrored sockets, owners, capabilities and eventual migrations before extending schemas. |
| `apps/web/src/characters/runtime/SemanticCharacter.ts` | `socketWorld(id)` composes the actual joint world matrix with a validated socket-local TRS; it is the starting attachment transform API. Maintain existing consumers. |
| `apps/web/src/characters/geometry/OfficialHumanRig.ts` | Pinned MakeHuman skeleton mapping includes metacarpals, wrist, thumb and individual finger chains. Reuse role mapping, calibration and source provenance. |
| `apps/web/src/characters/geometry/AnatomicalFK.ts` | Source-calibrated finger flexion, thumb opposition, spread/rotation, wrist and elbow DOF, with joint limits and separate skin-only forearm/shoulder references. Grip poses must compose with, not replace or corrupt, the existing FK/pose-corrective workflow. |
| `apps/web/src/studio/StudioPosePreview.ts`, `StudioViewport.ts`, `StudioInspection.ts` | Shared existing skinned character, pose previews, desktop/touch camera, hand Focus, optional rig inspection, disposal, generation cancellation. Add equipment preview as an owned layer with no forced camera changes. |
| `tests/character-hand-deformation.test.ts` | Real CC0 hand vertices/source weight fidelity, finger/thumb-web tolerances and mixed wrist/elbow poses; keep these regression gates intact. |
| `apps/web/src/actors/warrior.ts`, `AnimatedWarrior.ts`, `apps/web/src/characters/combat/LegacyWarriorAdapter.ts` | Combat currently displays primitive weapons parented at approximate arm offsets; `socketWorld` is an arm-based legacy-origin approximation. **Do not silently replace these** or change combat hit/arrow origin in C5.1–C5.3. Propose presentation adapters only with parity tests and separately reviewed rollout in C5.4/5.5. |

### Architectural interfaces (design target, not pre-existing API)

Define data-driven, serializable, **versioned** weapon and grip descriptors independently from Three.js mesh resources. Likely fields: `weaponKind`, `gripProfileId`, local handle frame (axis, grasp center, diameter/shape), primary-contact frame, optional secondary-contact frame, guard exclusion geometry, visible-mesh anchor, sight/nock/string/arrow frames where applicable, equipped-hand semantic role, schema version, source/asset identifier, and optional safe finger-target curves. Distances in meters; Three.js right-handed Y-up and source-calibrated local frames; normalized quaternions; no arbitrary global scale.

- Validate unique IDs, finite invertible transforms, normalized quaternions, diameter and length bounds, correct parent joints, known capability owners and availability of required fingers/wrists. Resolve semantic roles by **scoped joint ID**, not “first hand”, hardcoded indices or raw display names; avoid C7-hostile assumptions about only two hands.
- An independent **presentation attachment controller** derives `weaponWorld = characterSocketWorld × calibratedGripOffset` (or an explicitly documented equivalent frame convention). Store grip offsets **weapon-relative** and serialize metadata only; allocate and dispose THREE resources in the renderer/preview layer.
- Finger/contact solver receives semantic rig, geometric grip descriptor, desired pose and optional offhand target; emits a **bounded immutable pose command/result** with reachability, residual errors and constraint diagnostics. It never writes combat state. Reuse existing FK joint-frame limits. Prefer tested constrained analytic/two-bone or CCD-style IK for C5.2 rather than importing a solver without assessing license, maintenance, numerical stability, bundle size and mobile cost.
- Treat asymmetric hands, source-correct volar normals, thumb opposition and supported MakeHuman hand/body shape variation as real data. No unconstrained curling; evaluate each digit's skin surface relative to handle volume, not only the bone angle. Reject unreachable targets, fall back to a safe pose and report it to engineering tests; do not snap joints beyond limits.
- **Composition and lifecycle:** in Studio the weapon and grip layer is reapplied after body/face regeneration and pose changes, preserved or deliberately cleared across character generation, detached/disposed on replacement, context loss, navigation or Studio teardown. One owned reference-asset resource per instance (or documented shared immutable caches); no hidden render loops; no unauthorized modification of `StudioRecipe` or Save/Load.
- **Frame of authority:** visual sword tip/guard/hand/world, bow nock/string and arrow origin are derived from preview rig pose; any combat-origin migration must first prove origin/trajectory parity against legacy behavior and explicitly preserve event ticks. No network or GPU requirement for domain decisions.

## 3. External reference/asset policy

Research the **official MakeHuman and MakeHuman Community / MPFB** skeleton, anatomical finger pivots, available hand-grip control concepts, pose assets, and optional weapon geometry. MPFB may depend on Blender; **study documented control/rig principles only**, do not add Blender or its plugin to the Trilok runtime. Verify actual underlying files, topology/bone mapping, version, attribution and license before committing external content.

- MakeHuman system/source human data already pinned in Trilok is the default anatomical ground truth; source CC0 provenance remains in existing notices. Community asset packs may have **different licenses**, including CC-BY, so do not assume all are CC0.
- For C5.1 **prefer a procedural local reference sword made in Three.js** (blade, fuller/bevel or equivalent recognizable silhouette, crossguard, guard clearance, ergonomic handle, pommel, distinct neutral metal/leather materials). This avoids new source-license/dependency risk. Dimension handles in meters based on actual calibrated hand measurements; no fixed avatar-wide scaling to force fit. Keep budget modest and dispose geometry/materials. Treat “polished” as recognizable and useful for inspection, not AAA-certified quality.
- Additional staff, shield, bow and arrow reference assets may be added **only in their corresponding C5 slices**; external licensed artwork is optional, never a blocker. Document license/provenance and avoid non-redistributable/unclear source files.
- Preserve licensing documentation in `THIRD_PARTY_NOTICES.md` if any external assets are actually bundled.

## 4. Phased implementation and acceptance

### C5.1 — Single-hand weapon foundation & reference sword

**Build:**
1. Audit current semantic grip sockets, source-calibrated finger/thumb/wrist motion ranges, body/head/hand morphologies, Studio pose application and existing legacy weapon render/origin behavior. Record real measurements, constraints and accepted hand ranges.
2. Implement minimal weapon/grip schemas and validators with deterministic IDs, handle frames, mirrored-hand support and stable attachment math. Do not expose a speculative full weapon inventory.
3. Create one recognizable procedural **single-hand sword** with independent handle axis, guard clearance, grasp landmarks and replaceable visual meshes. Prefer a human-scaled sword to the legacy combat sword and use body-scaled metadata only where actually measured.
4. Implement **right and left hand-capable** finger pose profiles using `AnatomicalFK` flexion/opposition/spread, wrist alignment and immutable composition with Studio preview poses. Primary acceptance may default to one hand and one sword; the underlying contract must not hardcode that side.
5. Expose a small, functional **Sword / None** presentation option in a natural Studio Equipment/pose area only once the feature actually works. Preserve orbit, double-tap hand Focus, camera and user-edited morphology. No placeholder inventory or combat effects; maintain accessibility, keyboard/touch, reduced motion and cleanup.
6. Test sample grip residuals against **actual deformed hand surface** at fingertip/thumb/palm contact; check wrist and guard collision using meaningful geometric distance tests, not just non-NaN or parent equality. Record grip fit tolerance derived from geometry/measurement **before** accepting; distinguish test threshold from physical realism.
7. Verify source-neutral and representative **age, stature, sex, weight, muscle, hand width/length**, each supported Studio pose, left/right mirror and an extreme valid combination. Do not assume all child morphology can wield adult-sized sword: clearly handle too-small hands or incompatible weapons by scaled/adapted handle or safe unavailable state with no artifact.
8. Add unit/integration tests and desktop/touch Playwright screenshots (whole body and **focused grip close-up**). Owner examines recognizability, thumb wrap, finger placement and guard clearance.

**Gate:** A real, skinned source-human hand visibly wraps fingers and thumb around the actual sword handle; sword follows bone/socket movement without offsets or obvious clipping, controls remain usable and old combat is unchanged. **No C5.2 dual-hand IK.** Do not label C5.1 “complete” based only on successful build or parent transform assertions.

### C5.2 — Two-hand grip coordination & local arm IK

- Build secondary-hand contact descriptors and a constraint-aware local shoulder/elbow/wrist IK solution; primary hand/weapon pose drives the offhand target deterministically; do not move entire character root or create motion timing.
- Use a two-handed sword or staff reference asset with separate grip zones and proper guard clearance. Check left/right leading hand, different torso/arm lengths and pose changes, no self-intersection; preserve existing anatomical bone frames, pose-correctives and source-skinning diagnostics.
- Define unreachable-target fallback; cap solver iterations, time and angular updates, verify convergence and cross-browser determinism of outputs given identical inputs.
- Gate: both hands hold the same moving handle across supported poses, with bounded residual error and no bone-limit violations. Full-body animation remains C6.

### C5.3 — Independent shield and offhand contact

- Add shield reference geometry with actual forearm strap/handle metadata, grip and guard clearance; allow equipped sword and shield simultaneously with independent semantic sockets, constrained wrist/finger targets and sensible presentation-only equipment choices.
- Test mirrored equipment, attack and parry preview poses, body deformation, forearm skin helpers, shoulder deformations and self-intersection. Keep C8 equipment capability loss and C5.4 combat-origin changes out of scope.
- Gate: visually coherent hand-held shield and sword, stable independent contact; no hidden gameplay block/parry tuning.

### C5.4 — Bow, string, nocking, draw and release visual alignment

- Add a recognizable lightweight bow and arrow reference; define bow-hand target, offhand string pull, nock, shaft, tip and authoritative release-origin mapping frames with source-calibrated arm/finger IK.
- Maintain consistent bowstring geometry and nocked arrow contact through draw; define pose-state transitions separately from combat action timestamps. Link visual release to **existing authorized combat release events** and reproduce the exact domain projectile origin/trajectory expectations, or retain the old combat presentation if verified parity is unavailable.
- Validate high/low draw, handedness, different builds, nock/arrow alignment, string penetration, camera controls and disposal. No new damage/projectile physics or timings.
- Gate: draw is physically legible; string, nock and arrow origins agree with display rig and measured legacy authority contract. Any actual combat-presentation swap requires explicit parity approval.

### C5.5 — Integrated acceptance, compatibility and C5 closure

- Recheck all released C5 weapon combinations, multiple morphology extremes, retargetable grip profiles, arm solver reach failures, camera Focus, screen-reader labels, keyboard/touch, reduced motion, device responsiveness and Studio+Lab lifecycle/context-loss.
- Quantify idle/editor device frame time, solver iteration costs, GPU buffers, memory/resource cleanup and regeneration churn. Set evidence-based budgets, not made-up FPS/AAA claims.
- Run TypeScript, full Vitest + 1,000-seed replay invariants, production build/build identity, exact-candidate desktop/touch Chromium interactions + real rendered screenshots, manual pose/contact review and selected visual stress fixtures.
- Dispatch **Actions → Phase Acceptance → C5** against exact current `main` after merges; attach screenshot artifact/run URL, fix regressions without disabling tests, rerun if SHA changes.
- Verify deployed Cloudflare `/studio/` and `/build-info.json` identity independently or record owner confirmation distinctly; obtain owner acceptance, update Issue #81 and roadmap, close only once evidence and release gates pass.
- Preserve legacy combat renderer/actor adapter until a separate explicitly verified migration is warranted. Record any remaining artistic limitations rather than claiming full animation/production readiness.

## 5. Verification matrix / failure modes

| Area | Required evidence |
| --- | --- |
| Stable attachment | Calibrated local/world matrices with a rotated and translated root, varying wrist/elbow/shoulder poses; right and left hands; no unexpected origin drift. |
| Source anatomical credibility | Measured fingertip, thumb-web and palm contact samples on **posed skinned mesh**, joint angle limits and calibrated volar direction; detect finger-through-handle, hovering hand and guard penetration. |
| Morphology & age | Cross-check current valid MakeHuman native macros, local hand dimensions, age-dependent geometry, extreme but source-supported shapes; record unsupported adult-handle fit as a safe fallback. |
| Two-handed coordination | Primary/secondary-contact residuals, reachability/constraints, solver convergence/iteration cap, side symmetry, perturbation stability, unmoved root. |
| Combat parity | Identical authoritative combat timings, hit/AI/defense state and projectile origin policies for existing encounters; no visual event creates a combat event. |
| Lifecycle | Undo/redo and regeneration, cancellation/retry, replacement/disposal, hidden tab pause, context loss and recovery, repeated Studio navigation, no leaked WebGL geometries or listeners. |
| Actual visuals | Desktop & touch screenshots, close-up thumb/index/middle/ring/little placement, sword/guard silhouette, full-body stance, shield/bow cases in later slices; explicitly review renders rather than treating tests as art approval. |
| Performance | Measured representative devices, deterministic solver bounds, memory cost, regressions relative to accepted C4 baseline. |
| Accessibility | Keyboard and pointer/touch control, named controls, no forced camera jump, clear unsupported-state feedback, reduced motion, no engineering UI language. |
| External assets | Per-file provenance and license, no unreviewed redistribution, materials/meshes disposed and future GLB swap supported. |

## 6. Per-slice engineering workflow

1. Inspect **current** `main` SHA, README, C0/C1/C4 specifications, this plan, current grip/FK/rig/render/combat code and Issue #81. Resolve any design conflicts with actual code.
2. Create a focused feature branch; write a testable design change with minimal interfaces and no placeholder capabilities.
3. Implement only the active C5 slice; avoid modifying unrelated combat domain or generating generic animation systems.
4. Add typed validations, source-asset/skin/contact tests, deterministic pose tests, relevant UI/browser tests, and update slice-specific docs.
5. Run `pnpm typecheck`, `pnpm test`, `pnpm build`, build identity and appropriate Playwright/Chromium screenshots. Verify visual results, numerical contact and cleanup with real data.
6. Open PR with scope, measurements, screenshots, risk and rollback; wait for required Verify/CI; fix failures rather than lowering coverage; merge after checks pass.
7. Verify resulting `main` SHA, record Cloudflare deployed identity when applicable, and update roadmap/Issue #81. Any phase acceptance must target the **exact** final `main` SHA.

## 7. Immediate C5.1 new-session assignment

**TRILOK — Implement C5.1 Weapon Grip Foundation.** Inspect latest GitHub `main`, README, [C5 implementation plan](character-studio-c5-plan.md), [roadmap](character-studio-roadmap.md), Issue #81, source MakeHuman finger controls, existing `AnatomicalFK`, semantic sockets, Studio viewport and legacy weapon representation. Implement **only** C5.1: data-driven grips, anatomically articulated single-hand contact, replaceable Three.js procedural sword with blade/guard/handle/pommel, functional accessible Studio preview and hand Focus, all supported morphology/pose contact tests, desktop/touch screenshots. Preserve deterministic combat, Lab and C4. Feature branch, tests, docs, PR, verify checks, merge and report real evidence. No C5.2–C5.5, no baking or persistent Save/Load.
