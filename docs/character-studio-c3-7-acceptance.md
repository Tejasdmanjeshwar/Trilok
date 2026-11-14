# C3.7 — Character morphology integration and phase acceptance

## Baseline and scope

Candidate starts from `main` `a47f97cc30a8322049793ac2e5601f5794baa2f3` on 2026-11-14. This gate covers C3.1–C3.6 human body and facial morphology only. C7 species geometry and C9 persistence/baking remain explicitly out of scope. All original pinned CC0 MakeHuman target manifests, native value ranges and permanent unsupported extrapolation controls remain unchanged.

## Verified code-level integration correction

- Body rest rebinding now refuses an already posed C1 skeleton before modifying geometry, joint positions or inverse binds. Previously `MakeHumanBodyController.apply` could mutate rest inverses during FK motion, silently redefining a posed skeleton as its bind state.
- Jaw-tip landmark refitting uses root-local source displacement and converts the result to world space once. Previously a source-local delta was added directly to a world landmark, which is incorrect for a transformed character root.
- Added regression cases for guard rejection without geometry/inverse-bind mutation, recovery after pose reset and jaw refit with a rotated and translated root.

**Important:** Until an exact-SHA CI run passes, these changes are candidate fixes rather than validated acceptance. No broad dead-code deletion is justified without dependency evidence; previously rejected Vanara prototype branches must not be revived.

## First full C3 Phase Acceptance — failure triage (2026-11-14)

- [Run #43580127292](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43580127292) executed against `main` `1ea73b172942734450a1b3c392c354867ea69067`: TypeScript, unit/replay suite, production build, build identity, and Chromium installation passed.
- **44/46 desktop/touch Chromium tests passed; 2 failed.** Both failures were the same `e2e/c2-lab.spec.ts` pose-picker test with a Playwright strict-mode locator ambiguity: `getByRole("button", {name:"Reset"})` now matches the pose, body, head, and facial reset buttons.
- The focused correction selects the existing `#reset-pose` control, which is the precise feature under test. No browser behavior, MakeHuman controls, stress limits, geometry, or acceptance thresholds are changed.
- Screenshot artifact `phase-C3-screenshots` was uploaded with the failed run. Passing automated captures do **not** substitute for an independent visual review.
- **Retest requirement:** run the entire manually dispatched C3 Phase Acceptance matrix against the new *merged* `main` commit. A green run on an earlier SHA does not qualify; make no phase signoff from this failed run.
- C3 source-derived control coverage and deterministic replay tests passed. Exhaustive native MakeHuman executable-oracle macro parity, complex self-contact, full coupled jaw/pose visual review, resource lifecycle/performance limits and independently checked live Cloudflare `build-info.json` are still open acceptance evidence.

## C3.7 infant morphology and MakeHuman joint-refit defect (2026-11-14)

**Owner report:** `macro/age` at or below ~0.05 could leave an adult-sized visible body surrounding a much smaller skeleton. Upstream MakeHuman has a continuous 0..0.1875 baby→child target blend with no special threshold at 0.05. Its skeleton obtains rest joint centers by averaging explicit rig joint helper vertices from the morphed body source positions.

**Root cause:** Trilok's C3.6 rest-joint approximation used nearby skin-weighted vertices instead of original MakeHuman reference vertices, and `HumanMorphologyAlignment` rejected two-link IK segments shorter than 8 cm irrespective of character age. The controller updated skeletal transforms before it completed IK validation and only then published the morphed mesh. When IK validation threw, the already-shrunk skeleton remained beside the unchanged adult mesh. The browser caught the error and displayed a diagnostic, rather than restoring the rig.

**Correction:** The original pinned CC0 `SourceRig` joint vertex mapping is retained on the character. For mapped C1 bones, the C3.6 controller now averages the same original source delta at the joint reference vertices that MakeHuman uses; skin-weighted approximation is limited to presentation-only/helper joints that have no original counterpart. The jaw tip uses its original source tail landmark. IK validation checks for nonfinite or numerically collapsed chains rather than a fixed adult-scale size. Any exception in rest-joint/IK/mesh recalibration rolls back previous joint positions, inverse binds, jaw landmark, geometry, normals and bounds before propagating the failure. Registered socket/IK alignment only changes after successful surface commit. No global scaling, age clamping, new geometry, or changes to original native target blending/stress ranges.

**Regression requirements:** Unit tests sample ages 0, 0.01, 0.03, 0.05, 0.055, 0.06, 0.10 and 0.1875, comparing source-joint motion to exact original CC0 target displacements, reporting finite body geometry and valid chain lengths, then confirming neutral reset. An injected invalid chain mapping verifies that a failed refit leaves geometry, binds and joint transforms unchanged and a subsequent valid refit succeeds. Chromium desktop/touch samples 0, 0.03, 0.05, 0.06 and 0.1875 and captures infant-boundary screenshots. Verify exact PR-head CI before merging and full manual C3 Phase Acceptance and screenshot inspection on merged `main` afterward. An earlier green C3 run does **not** certify the new edge case.

## Phase acceptance checklist (all mandatory)

| Gate | Required evidence | Status at PR creation |
|---|---|---|
| Native target and source fidelity | Original C3.5/C3.6 manifests/target SHA checks; native control endpoints; independent MakeHuman dependency/macro oracle | Independent executable macro oracle still missing |
| Determinism | C3.1–C3.6 seed/order/reset tests, complete 1,000-seed combat replay | Must rerun on candidate SHA |
| Deformation and rigging | Native-range coupled head/body, C1 jaw with native mouth opening, wrists/fingers/shoulder/hip/knee/ankle skinning, socket/IK lengths and bind reconstruction | New focused regression tests added; comprehensive stress and contact review pending |
| Unsupported stress controls | Permanent extreme `±1.25` source extrapolation and body gain; report separately from supported MakeHuman native range | Preserved; acceptance is not conditioned on out-of-range shape quality |
| Browser visuals | Full manually dispatched **Phase Acceptance** workflow, desktop/touch Chromium screenshots, real visual inspection of neutral, extreme, jaw/mouth and combined poses | Pending |
| Performance and lifecycle | Measured frame timings, CPU morph timing, retained resources and repeated disposal on desktop/touch | Pending |
| CI | Required fast `verify` green on exact PR head; typecheck, all unit/replay tests, production build and build identity | Pending |
| Deployment | Production Cloudflare `build-info.json` independently checked against merged `main` SHA | Pending |
| Owner visual acceptance | Explicit C3 phase-level review after Chromium and deployment confirmation | Pending |

Do not close [Issue #41](https://github.com/Tejasdmanjeshwar/Trilok/issues/41) or declare C3 complete while any gate above is pending. Full Phase Acceptance must be run on the exact integrated commit after fast CI and required fixes. No C4 or user-facing Save/Load was introduced.
