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
