# Character Studio C5.2 — Two-Handed Weapon Grip and Local Arm IK

## Source and scope

Implementation extends C5.1 from `main` at `5549de6cef8db6a6443e9a95075de23f1f2d9840`. No new skeletal hierarchy, combat domain logic, persistent recipe, authoring exporter, shield, bow or global locomotion layer is introduced.

## Components

- `StudioTwoHandGrip.ts` owns a serializable, versioned primary/secondary semantic socket descriptor (primary_grip on the leading palm, secondary_grip on the offhand) and locally generated longsword and staff (distinct handles and guard geometry; reference art only). Leading hand is selectable on either side.
- One shared `AnatomicalFK` instance evaluates both arms, preserving its source-calibrated rest quaternions, DOF limits, shoulder connector and forearm helper skin transports. The existing C3.3 shoulder corrective surface is enabled when an equipped two-hand pose is active. Finger flexion/opposition comes from the existing C5.1 profiles.
- A fixed-step bounded coordinate-descent arm solver adjusts *clavicle, shoulder, elbow and wrist* calibrated freedoms. It never changes character root/pelvis or writes combat events. The solver starts from a measured source-valid mirrored guard stance, then jointly optimizes both calibrated arm chains against one relative palm-frame constraint. The final leading hand defines the weapon frame; the offhand targets its actual posed grip axis at spacing derived from the current source hand width.
- Full-FK evaluations run only on pose/equipment/morphology changes, not each animation frame; the bounded coordinate-descent envelope uses at most 28 sweeps across two arm chains. Iteration count, primary/secondary residuals and reachability are exposed to tests. If it cannot reach within the acceptance window, the solver returns an unreachable result, restores the previous base pose and Studio does not attach a visually disconnected two-hand weapon. Never defeat joint limits to force contact.
- The owned weapon attaches using `socketWorld(primary) × calibratedOffset`. It is disposed on equipment change, regeneration or Studio exit, using shared Three.js materials without double disposal. The original C5.1 single-hand sword option is untouched.

## Acceptance and verification

- Test native CC0 MakeHuman left/right leading hand, source-morphology variation, deterministic identical results and identical root matrix.
- Assert explicit offhand contact residual bounds; do not confuse merely finite residuals with a successful grip. Check the two socket frames and weapon contact landmarks are geometrically coincident under the same FK pose.
- Inspect desktop and touch rendered close-ups through the existing manual Phase Acceptance workflow; note that the ordinary Verify workflow runs fast unit/typecheck/build only, in accordance with `docs/ci-phase-acceptance.md`.
- Verify actual Cloudflare preview branch SHA before reporting a viewable feature.

**Status:** development candidate; do not claim owner acceptance or merge until actual pose/contact quality has been assessed. Later C5.3–C5.5 are out of scope.

## Verified source-rig metrics before visual acceptance

The MakeHuman source neutral left/right fixtures in Verify #43678987783 reported mirrored offhand position error **4.376 mm** and axis alignment dot **0.786** (opposed palm axes; higher is better) after **13 bounded sweeps**, with unchanged root matrix. Source macro-height extremes and independent hand-scale modifiers also returned reachable solutions at approximately **1.8–5.6 mm**. All 69 Vitest files, TypeScript and the production build passed that candidate; the subsequent shoulder-corrective / semantic-secondary-socket revisions require new CI confirmation. Explicit contact-target tests use the actual final weapon transform; those are separate from renderer screenshot acceptance. The final source model visually requires owner inspection on an exact build SHA; do not claim AAA polish or zero skin intersections from these numbers alone.
