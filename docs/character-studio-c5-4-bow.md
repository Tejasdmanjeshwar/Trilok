# C5.4 — anatomical bow presentation (feature candidate)

Status: **feature branch under review; not owner accepted, not merged.**

## Architecture and frames
- Studio uses the *same* pinned source-skinned MakeHuman runtime, calibrated `AnatomicalFK`, `StudioBodyCollision`, C5.1 skin-fitted handle frame, C5.2 hand-contact landmark and `fitConstrainedIK`; no alternative skeleton or gameplay simulator. `StudioWeaponGrip.handContactTargets` now offers data-defined sword-handle, bow-handle and three-finger string-hook profiles. `StudioContactIK` supplies shared scoped joint freedoms, immutable pose command composition and bounded DLS entry points. Existing C5.1 sword targets are unchanged.
- `StudioArchery.ts` defines `BowReferenceV1`, mirror-aware hand ownership and source-grip socket validation. The descriptor is JSON-compatible; geometry/materials and their cleanup belong to `StudioBowPreview`.
- The local bow origin is the solved bow-hand grip; **+Y** follows the source knuckle line toward the upper limb tip; **+Z** is character forward and the intended arrow travel direction. Bow tips are at `(0,±limbLength,-restDistance*0.9)`, the string draw point at `(0,0,-restDistance-draw)`, and a nocked shaft extends **+Z** from its nock. These frames are converted to world via `bowWorld` and stored as an inverse source-palm socket offset.
- Mirrored left/right configurations begin with a legal C5.2-style bow-hand pose, then **jointly optimize both arm chains** against one socket-derived bow frame. The string goal is evaluated on the current moving bow at every iteration, and the opposing contact point is the posed source index/middle-finger hook rather than a fictitious offhand handle center. Per-arm initialization uses at most 24 bounded DLS iterations; coupled refinement uses at most 32. Joint freedoms remain calibrated by `AnatomicalFK`; torso clearance is evaluated during optimization. The avatar root never moves. A failed candidate restores the original source pose and makes the equipment preview unavailable. **Numerical contact and rendered-quality acceptance remain pending CI and screenshot review.**
- `rest`, `nock`, `partial`, `aim`, and `release` are *explicit preview states*. No frame loop is introduced by the archery solver and `release` does not fire a projectile. Source model regeneration reconstructs the preview, and the existing Studio owned-equipment cleanup disposes meshes, buffers and materials.

## Combat-origin policy and migration blocker
- Combat still renders the legacy `AnimatedWarrior`/`warrior.ts` bow, and `LegacyWarriorAdapter.socketWorld()` delegates to the existing arm/world approximation.
- Actual ballistics remain authoritative in `packages/combat/src/projectile-motion.ts`, including fixed-tick `aimBallisticAt` and `sampleTrajectory`; existing visual flight alignment uses `ArrowVisual.ARROW_TIP_OFFSET`. Studio bow-local visual nock/tip coordinates are **not** automatically equivalent to the legacy attack launch origin or camera-reticle direction.
- A numerical same-coordinate migration parity guarantee has **not been established** because the combat actor and Studio source-skinned actor have distinct rigs, reference frames and release choreography. **No new combat attachment or release event is allowed and no existing combat renderer is replaced**. A separate reviewed adapter, origin/direction match and event-tick parity gate would be required before any combat rollout.

## Acceptance/limitations
- Procedural reference art is intended for silhouette, grip and alignment inspection; bow limb curvature is static, and the string is two rigid tapered segments joined at the draw point, not a simulated string.
- The contact solver fits a source anatomical hand landmark, but without a full skinned-triangle continuous sweep, **finger wrap, bow-handle clearance, head/forearm clipping and exact 1–3 mm physical contact are not yet proven**. Very short or extreme morphologies may safely reject a pose.
- Check mirrored bow and draw hand focus in desktop/touch Chromium, five poses, morphology changes, old equipment combinations and unchanged combat deterministic replays. Inspect screenshots before requesting owner approval. Neither passing Vitest nor deploying a preview constitutes visual approval.
- Future C5.5 owns integrated phase acceptance, performance/resource monitoring and final release evidence. It does not authorize a combat renderer migration.

## November 16 follow-up: source pose research and engineering verification

MakeHuman Community catalogs confirm these named **catalog entries**, credited to callharvey3d with listed CC0 licenses:

- [poses02](https://www.makehumancommunity.org/assets/assetpacks/poses02.html): `callharvey3d_archer_hero`, `callharvey3d_archer_square_stance`.
- [poses05](https://www.makehumancommunity.org/assets/assetpacks/poses05.html): `callharvey3d_archer_leap`.

The underlying BVH archive files were **not retrieved or inspected** in this environment. Their motion frames, hierarchy, finger/thumb channel coverage, unit conventions and compatibility with Trilok's pinned MakeHuman rig are **not verified**. No unverified reference source or animation data has been bundled, imported or retargeted. The current body and digit commands are documented source-FK-derived fallback targets, not claimed reproductions of the catalog poses. Full compatibility and any shared BVH retargeting should be implemented only after checking actual files and licensing.

### Baseline numerical evidence (PR #87 Verify run 43754366662)

| Nominal hand | Full draw/string residual | Source thumb/handle penetration | Source palm/handle penetration |
| --- | ---: | ---: | ---: |
| Left bow | 166.288 mm | 11.335 mm | 12.060 mm |
| Right bow | 166.606 mm | 11.326 mm | 12.074 mm |

These are *pre-refactor baseline measurements from CI*; no after-refactor values have been validated. The former full-draw solver targeted a cylinder-grip palm proxy and solved arms independently after creating a bow frame from the held hand. Its displayed nock target was not guaranteed to follow the real drawing fingers, and sword curls were incorrectly reused for the string hand. The new candidate addresses the structural misalignment by using separate contact roles, a held socket transform, per-digit Mediterranean hook pose and one coupled constrained optimization.

**Remaining quantitative/visual gates:** Require <=30 mm actual drawing-finger/nock residual at full draw on both sides; measure true source-skinned fingertip/string and thumb/palm/handle signed surface errors and keep contact tolerances geometry-specific rather than treating an arm-bone error as proof. Current tests print the real source handle penetration but do not yet enforce a sufficiently strict limit. The moving bow limbs are static procedural curves, not a flexible-rod simulation. No visual acceptance can be asserted from code changes alone; obtain Chromium desktop and touch screenshots for the actual candidate SHA, including close-ups of the handle, thumb web, index/middle/ring hook, string and nock. CI tests, replay, production build, browser screenshots and preview deployment identity must be recorded separately after execution. **No combat-authority migration and no C5.5 scope.**
