# Issue #121 — Kevin Run shoulder surface diagnosis

**Status:** Measured severe skinned-surface deformation; **no accepted repair**.
Issue: https://github.com/Tejasdmanjeshwar/Trilok/issues/121
Isolated review: https://github.com/Tejasdmanjeshwar/Trilok/pull/122

This document is a reproducible investigation record, not C6.3 visual approval.

## Reproduction and source identity

The owner observed a dark triangular wedge on a shoulder/clavicle during Kevin Run at approximately 0.51/0.60 seconds, build label `68651e14` from the separate PR #120 review artifact. That observation does **not** establish the specific rendered face or prove backface culling is involved. The untouched main baseline is `9d32e2a19da304784a0312144c64be47ff3bab26`. Issue #121 is investigated on a separate branch; PR #120 source, approved UAL1/Kevin clips, and Cloudflare production remain out of scope.

The source MakeHuman body OBJ has 26,756 source-topology triangles and previously measured zero open-boundary or non-manifold edges. The actual skinned geometry can still fold or self-occlude.

## Reproducible numeric evidence

Successful GitHub Verify run **44734483491** (first diagnostic SHA `b56062510dc0faf1903b4cb68d04fa64056397b1`) ran the original-source, CPU-skinned Kevin Run test for both shoulders at 12 timestamps, with/without C3.3 shoulder corrective morphs. It emitted `TRILOK_C121_GEOMETRY` in the test log.

At t=0.51 s (correctives ON), across 1,290 skin-weight-selected candidate faces on *each* anatomical shoulder:

| Metric | Anatomical left | Anatomical right |
| --- | ---: | ---: |
| Minimum posed area / source rest area | 0.139122 | 0.034025 |
| Maximum posed area / source rest area | 4.082355 | 1.839253 |
| Faces with posed area less than 20% of rest | 1 | 7 |
| Near-zero/NaN/Infinity position diagnostic | 0 invalid | 0 invalid |

The anatomical-right 0.51 s minimum is face **20357**, render vertices **11535, 11615, 11613**, source vertices **10452, 10510, 10514**. It shrinks from 0.00007798437 m² to 0.00000265343 m². With correctives disabled, face **15844**, source vertices **10514, 10510, 8303**, has area ratio **0.006357**: a 99.36% loss of area. Its three vertices use only **three** nonzero GPU skin influences (semantic shoulder, torso and shoulder helper), so it is **not** a case where the four-influence compactor discarded source weight slots. The exact on-screen wedge has not yet been matched to these faces through camera-space picking.

These face normals can turn relative to **rest** by more than 90°, but that fact alone does **not** prove inverted local winding. The CPU tests do not measure per-pixel occlusion, depth ordering or the material's interpolated GPU normal.

The collapse persists with C3.3 correctives zero. Consequently, it cannot be attributed solely to corrective morphs. Multiple neighboring faces have significant stretching/collapse with or without correction.

## Controlled connector hypothesis

Verify run **44737593745**, source SHA `7cc61037a31a9d32b0cbf3580249e11b3ea06533`, ran the separate diagnostic against UAL1/Kevin motions and five shoulder-helper interpolation factors, retaining the calibrated shared pivot. All 588 tests, typecheck, deterministic animation verification and build passed on that SHA.

At t=0.51, with all morphs disabled, anatomical-right face 15844 varied as follows:

| Shared-pivot helper blend | Face 15844 area ratio |
| --- | ---: |
| 0% | 0.06801 |
| 25% | 0.03650 |
| **50% current** | **0.00636** |
| 75% | 0.04015 |
| 100% | 0.08937 |

This **does not support simply replacing the global 50% blend**: different faces, other shoulders, and other motion sources behave differently, and even 100% retains large deformations. Changing helper interpolation without visual acceptance could introduce new artifacts. No runtime formula was changed by this diagnostic work.

## Required next gates

1. Run the **explicitly manual** C6 Chromium phase-acceptance workflow on a pinned revision of PR #122. The new `e2e/studio-animation-c121-shoulder-closeup.spec.ts` supplies front, three-quarter, side and rear shoulder close-ups across all 12 reported frames, for desktop and touch projects; it is not invoked by automatic PR CI.
2. Inspect the actual screenshots and identify the owner-visible face(s), then measure *neighbor-relative* posed surface orientation and self-intersection. Do not treat rest-normal orientation as proof of winding inversion.
3. Compare source-weighted uncompressed LBS reference against rendered four-influence skinning and inspect the bone-inverse binds and weighted 3D frame to distinguish source retarget orientation, rest helper calibration, and skinning-policy error.
4. Implement an animation-independent correction **only after** this evidence supports it. Preserve the source OBJ, native morphs, original clip bytes, canonical FK/IK, gameplay authority, and morphology alignment.
5. Re-run neutral/short/tall/muscular/heavy morphology and Kevin/UAL1 tests, Chromium frame sweep, lifecycle/regeneration, complete Verify and Netlify preview, all pinned to the exact successful source SHA. Obtain owner approval before merging.

**Open limitation:** local browser execution and manual workflow dispatch are unavailable to the connected GitHub editing actions in this environment; the CI logs do not substitute for rendered before/after inspection. No Cloudflare deployment is authorized.
