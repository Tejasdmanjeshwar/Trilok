# Character Studio C5.2 — Two-Handed Weapon Grip and Local Arm IK

## Source and scope

Implementation extends C5.1 from `main` at `5549de6cef8db6a6443e9a95075de23f1f2d9840`. No new skeletal hierarchy, combat domain logic, persistent recipe, authoring exporter, shield, bow or global locomotion layer is introduced.

## Components

- `StudioTwoHandGrip.ts` owns a serializable, versioned primary/secondary semantic socket descriptor and locally generated longsword and staff (distinct handles and guard geometry; reference art only). Leading hand is selectable on either side.
- One shared `AnatomicalFK` instance evaluates both arms, preserving its source-calibrated rest quaternions, DOF limits, shoulder connector and forearm helper skin transports. Finger flexion/opposition comes from the existing C5.1 profiles.
- A fixed-step bounded coordinate-descent arm solver adjusts *clavicle, shoulder, elbow and wrist* calibrated freedoms. It never changes character root/pelvis or writes combat events. The leading hand is positioned relative to the currently morphed chest and arm reach. The secondary hand targets the primary hand's actual posed grip axis at a handle spacing derived from current hand width.
- Per-step full-FK evaluations run only on pose/equipment/morphology changes, not each animation frame. Iteration count, primary/secondary residuals and reachability are exposed to tests. If it cannot reach within the acceptance window, the solver returns an unreachable result, restores the previous base pose and Studio does not attach a visually disconnected two-hand weapon. Never defeat joint limits to force contact.
- The owned weapon attaches using `socketWorld(primary) × calibratedOffset`. It is disposed on equipment change, regeneration or Studio exit, using shared Three.js materials without double disposal. The original C5.1 single-hand sword option is untouched.

## Acceptance and verification

- Test native CC0 MakeHuman left/right leading hand, source-morphology variation, deterministic identical results and identical root matrix.
- Assert explicit offhand contact residual bounds; do not confuse merely finite residuals with a successful grip. Check the two socket frames and weapon contact landmarks are geometrically coincident under the same FK pose.
- Inspect desktop and touch rendered close-ups through the existing manual Phase Acceptance workflow; note that the ordinary Verify workflow runs fast unit/typecheck/build only, in accordance with `docs/ci-phase-acceptance.md`.
- Verify actual Cloudflare preview branch SHA before reporting a viewable feature.

**Status:** development candidate; do not claim owner acceptance or merge until actual pose/contact quality has been assessed. Later C5.3–C5.5 are out of scope.
