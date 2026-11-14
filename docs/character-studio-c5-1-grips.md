# Character Studio — C5.1 sword-grip implementation record

Scope: one procedural reference sword and single-hand gripping in Studio only. No combat renderer replacement, combat domain changes, two-hand IK, shield, bow, Save/Load or baking.

## Implementation
- `StudioWeaponGrip.ts` defines a versioned handle descriptor, capability/hand-scoped semantic socket validation, left/right source-finger FK commands and a disposable independent Three.js mesh layer.
- Blade, guard, hilt, pommel and contrasting materials are generated locally. +Y is pommel-to-tip. Physical handle dimensions are estimated from the **current posed wrist/knuckle landmarks**, with explicit safe bounds and a reduced-size visual reference for small hands. The renderer owns and disposes this geometry.
- Calibration composes `socketWorld × socketOffset`; subsequent wrist/body pose changes follow the live same skinned runtime, not a separate character or gameplay model.
- Studio's Pose area offers None/Right hand/Left hand and a hand Focus action. Equipment is presentation-only, and rebuilding morphology replaces the owned sword layer.
- The grip command overlay retains the active Studio pose and uses the already calibrated `AnatomicalFK` flexion/opposition frames.

## Validation and remaining acceptance gates
- Unit tests cover FK bounds, mirrored semantic grip lookup, socket ownership validation, repeatable attachment transforms and root/wrist motions.
- Chromium tests exercise the selectable hands and hand Focus, capturing desktop/touch screenshots when CI executes.
- **Not yet proven:** measured collision/contact residuals on **deformed source skin**, thumb-to-handle contact under all native age/body/hand macros, guard non-penetration, wrist collision clearance, production-device frame time or qualitative visual approval. The pose commands are bounded deterministic profiles, not a fitted per-digit surface-contact solver. A test or successful build must **not** be interpreted as confirmation of those visual gates.
- The sword is a reference silhouette, not production weapon artwork. Fully coordinated arm IK is deliberately deferred.

These unsatisfied gates must be closed before marking C5.1 accepted in Issue #81. Keep the legacy combat weapon/origin unchanged and do not proceed to C5.2 on the strength of compilation alone.

## First rendered inspection (pre-final candidate)

The temporary dedicated browser run [#43637117045](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43637117045) passed desktop and touch interactions and uploaded right/left screenshots (artifact 14130214713). Visual review found the sword silhouette visible, but the camera close-up screenshots were captured during focus transition, so they do **not** prove finger contact. The e2e fixture now waits for the focus animation to settle. The separate browser workflow was removed to respect the repository's tested policy reserving Chromium jobs for manual Phase Acceptance. Run the existing Phase Acceptance workflow explicitly on the final candidate when ready. Initial Verify [#43637116974](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43637116974) exposed schematic-rig tests and the CI policy violation; those were corrected on the branch, without weakening the CI policy. Subsequent branch Verify runs must pass before merge.

## Grip-axis correction after owner preview feedback

Owner observed that the sword appeared to extend directly from the hand. The old sword-local +Y axis was the wrist-to-middle-finger direction, so the blade traveled along the fingers. The correction instead derives a right-handed sword-local frame from the **posed** MakeHuman knuckle line (little finger → index finger), projected perpendicular to the wrist-to-middle-finger direction. +Y now runs through the fist, from pommel near the little finger to guard/blade near the index finger. The same handle-centered skinned-surface fit and semantic-socket attachment are retained; no Euler-only world-axis hack or root scaling is introduced. Real imported-hand left/right tests now explicitly assert a blade/finger dot product below 0.12 and blade/knuckle-line dot product above 0.95. Those orientation tests do not establish satisfactory all-finger contact; the existing contact blockers remain separately tracked.
