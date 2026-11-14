# C3.7 — Character morphology integration and phase acceptance

## Baseline and scope

Candidate starts from `main` `a47f97cc30a8322049793ac2e5601f5794baa2f3` on 2026-11-14. This gate covers C3.1–C3.6 human body and facial morphology only. C7 species geometry and C9 persistence/baking remain explicitly out of scope. All original pinned CC0 MakeHuman target manifests, native value ranges and permanent unsupported extrapolation controls remain unchanged.

## Verified code-level integration correction

- Body rest rebinding now refuses an already posed C1 skeleton before modifying geometry, joint positions or inverse binds. Previously `MakeHumanBodyController.apply` could mutate rest inverses during FK motion, silently redefining a posed skeleton as its bind state.
- Jaw-tip landmark refitting uses root-local source displacement and converts the result to world space once. Previously a source-local delta was added directly to a world landmark, which is incorrect for a transformed character root.
- Added regression cases for guard rejection without geometry/inverse-bind mutation, recovery after pose reset and jaw refit with a rotated and translated root.

**Important:** Until an exact-SHA CI run passes, these changes are candidate fixes rather than validated acceptance. No broad dead-code deletion is justified without dependency evidence; previously rejected Vanara prototype branches must not be revived.

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
