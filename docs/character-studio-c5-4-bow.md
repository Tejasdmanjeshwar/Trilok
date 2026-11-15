# C5.4 — anatomical bow presentation (feature candidate)

Status: **feature branch under review; not owner accepted, not merged.**

## Architecture and frames
- Studio uses the *same* pinned source-skinned MakeHuman runtime, calibrated `AnatomicalFK`, `StudioBodyCollision`, C5.1 finger poses, C5.2 hand-contact landmark and `fitConstrainedIK`; no alternative skeleton or gameplay simulator.
- `StudioArchery.ts` defines `BowReferenceV1`, mirror-aware hand ownership and source-grip socket validation. The descriptor is JSON-compatible; geometry/materials and their cleanup belong to `StudioBowPreview`.
- The local bow origin is the solved bow-hand grip; **+Y** follows the source knuckle line toward the upper limb tip; **+Z** is character forward and the intended arrow travel direction. Bow tips are at `(0,±limbLength,-restDistance*0.9)`, the string draw point at `(0,0,-restDistance-draw)`, and a nocked shaft extends **+Z** from its nock. These frames are converted to world via `bowWorld` and stored as an inverse source-palm socket offset.
- Mirrored left/right configurations use the bow hand as a primary grip and independently optimize the other arm toward the string target; source-calibrated finger curls are composed with FK. Draw is clamped by calibrated joint freedoms and torso envelope. The bounded deterministic DLS solver uses at most 24 iterations **per arm**. If measured reach fails, the existing pose is restored and the equipment preview is unavailable, rather than scaling or moving the avatar.
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
