# C5.3 — Independent sword and shield engineering record

Status: feature branch awaiting automated CI and owner visual inspection. This is not overall C5 acceptance.

## Design
- An independent shield carries its own versioned metadata, semantic shield socket, replaceable procedural plate/rim/boss/straps and explicit reference dimensions in meters.
- Both hands expose uniquely owned `shield` metadata sockets. Equipping a shield does not change the existing C5.1/C5.2 sword and staff descriptor contracts.
- The existing `AnatomicalFK` and `fitConstrainedIK` system solve each arm independently against torso-relative targets; `StudioBodyCollision` evaluates the actual morphed MakeHuman torso envelope. Hand curls continue to use calibrated source finger freedoms. The shield forearm fit samples posed source-skin vertices and the existing auxiliary forearm skin bone.
- The shield render attachment follows a semantic socket; there is no combat authority, damage, blocking, parry timing, or recipe mutation.
- Studio presents one equipment control and context-dependent shield stance selector. Mirrored sword hands, guard, attack-ready and parry are visual-only.
- All generated geometries/materials are owned by the preview and disposed when replaced, regenerated or unloaded.

## Limitations requiring owner review
- The plate is a lightweight reference asset rather than production art.
- The independent arm placement is bounded and fails safely when unreachable, but it is not full-body C6 animation. The procedural strap and solid-contact approximation must be visually checked against real skinned forearm/body morphology, especially large bellies and extreme proportions.
- The continuous torso envelope is a conservative estimate; the exact posed-skinned triangle path in `StudioBodyCollision` is not yet applied to the shield plate in this slice.
- Tests do not replace full-body and hand-contact screenshot review. A numerically converged pose does not establish credible grip or collision clearance.

## Verification
- Unit: `tests/character-studio-sword-shield.test.ts`.
- Browser: `e2e/studio-sword-shield.spec.ts` for desktop and mobile Chromium screenshots and contact focus.
- Required before owner approval: `pnpm typecheck`, `pnpm test`, `pnpm build`, browser screenshots, checked preview build SHA and visual correction of any observed penetration.
- No C5 Phase Acceptance is triggered here; it is reserved for full C5 closure.
