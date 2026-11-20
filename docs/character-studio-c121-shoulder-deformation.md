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

## Offline weight-atlas source-ID recovery (2026-11-20)

The pinned source OBJ is the 19,158-vertex MakeHuman mesh, SHA-256
`8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c`.
The pinned skeleton SHA-256 is
`99f179bce0aa850b45d4191a1d0d234c5851f881c057439470ded3bddf729a24`;
the pinned weights SHA-256 is
`0f3641d651ae3d00ad6b4ccee43142edb109d3bd909d27d9e4139ef1beed8625`.
Source IDs are zero-based original OBJ vertex indices; UV seam splitting
does not alter them.

The failure at original vertex **15563** was not corrupt weight data:
the new original-OBJ face-reference audit verifies it is **excluded-only**,
not referenced by any `body`-group face and therefore correctly absent
from the body-only render map. Of 19,158 valid source vertices, 13,380
occur in `body` triangles and 5,778 only in excluded geometry. No
vertex is shared between those categories; none is completely unreferenced.
The two `shoulder01` weight groups reference 1,105 distinct positive-weight
source IDs; 701 are eligible body vertices, and **404 are excluded-only**.
The previous offline diagnostic incorrectly treated excluded vertices as
missing body render mappings.

The corrected *offline test* constructs deterministic original-OBJ face
reference sets and matches their body membership exactly against
`AnatomicalTemplate.sourceVertexIds`. It rejects malformed source
references, missing body-triangle mappings, and accidental non-body render
IDs. Valid excluded-only source vertices are accounted for and omitted from
the body atlas. Independent fixture coverage exercises body-only, shared,
excluded-only, unreferenced and invalid cases; live body geometry asserts
identical GPU indices and weights across UV seam duplicates. This does
**not** modify the original source geometry, normal parser, runtime
skinning, morph data, or existing gameplay thresholds.

The offline fitter generated **222** deterministic-order candidate entries
(schema version **1**, original source IDs, canonical joint ordering, four
normalized owners) trained on Kevin Idle/Walk and the four UAL1 motions,
sampled at quarter-clip fractions. Kevin Run is intentionally absent from
training. The candidate was emitted in the successful Verify run log;
a second independent output comparison / immutable atlas artifact and
holdout deformation acceptance are still required before runtime use.

Verified diagnostic commit `9cbedf8b5e8f56af4693d4a17394444b2bb44898`:
[Verify run 44759546215](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44759546215)
passed **590 tests**, `pnpm typecheck`, `pnpm build`,
animation-hash verification and static artifact sealing. These pass
conditions only certify the offline source-ID recovery. They do **not**
certify the atlas as an acceptable runtime correction.

**Still unresolved:** independent Kevin Run 12-frame / both-shoulders
full-weight comparison, cross-morphology area/normal/intersection gates,
lower-axilla shared shoulder-helper cause and correction, retained C5.2
weapon/IK acceptance after any future runtime change, desktop/touch
WebGL before-after screenshot approval, timed performance acceptance,
and SHA-locked manual Netlify development preview. The original Issue
#121 visual wedge is **not claimed repaired**. Do not merge PR #122
or deploy to Cloudflare until those gates are met.

## Independent pinned-atlas Run holdout (2026-11-20)

Added the pinned **222-entry** source-indexed diagnostic atlas at
`tests/fixtures/c121-offline-shoulder-atlas.v1.json` and independent
`tests/character-c121-run-holdout.test.ts`. The former comes from the
original source-hash-verified non-Run training fit; the latter evaluates the
*actual* approved Kevin Run at every required timestamp
`0, .15, .30, .40, .45, .48, .50, .51, .52, .54, .57, .60`,
on **both** anatomical shoulders. The test constructs a reference from
every mapped source owner and original source vertex ID, the currently
rendered GPU four-weight policy, and the atlas replacing only its own
source IDs. All other vertices remain unchanged. It measures
source-reference vertex RMS/max displacement, mean rest-normalized
surface-area error, collapsed / stretched faces and normals opposed to
the full-source reference, plus the 4 lower-axilla faces.

[Verify run 44765414572](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44765414572)
passed **591 tests in 116 files**, TypeScript, build, animation determinism
and static release checks for SHA
`64804011478cd1e4748ba84c42106ff9403af7ab`.

**Measured 0.51 s, entire shoulder-region comparisons (candidate vs
unpruned source-weight reference):**

| Metric | Existing left | Fitted left | Existing right | Fitted right |
| --- | ---: | ---: | ---: | ---: |
| RMS displacement (mm) | 3.04528 | 0.33706 | 0.88148 | 0.72862 |
| Mean absolute area error / rest | 0.043874 | 0.008138 | 0.016558 | 0.013647 |
| Faces under 20% rest area | 1 | 0 | 5 | 5 |
| Normals opposed to reference | 3 | 0 | 0 | 0 |

**Independent holdout regressions:** right-side RMS error gets worse at
0.00 s (0.98848→1.05499 mm), 0.54 s (0.84434→0.92663 mm),
0.57 s (0.94265→1.04652 mm), and 0.60 s (0.98848→1.05499 mm).
Left-side RMS worsens at 0.30 s (0.96783→1.04798 mm).
The positive clavicle improvements are real, but the *unchanged*
atlas does not satisfy the no-regression acceptance criterion across
all independent frames. **Do not integrate this candidate in runtime.**
In particular, do not select weights by Kevin timestamp or fit on Run,
which is reserved as the holdout.

**Axilla, at 0.51 s, original-source / current GPU / atlas ratios all
identical:**

| Face | Full source | GPU | Atlas |
| --- | ---: | ---: | ---: |
| 15844 | 0.006357 | 0.006357 | 0.006357 |
| 15871 | 0.205283 | 0.205283 | 0.205283 |
| 20356 | 0.121935 | 0.121935 | 0.121935 |
| 20357 | 0.051936 | 0.051936 | 0.051936 |

The axilla error occurs **even before four-slot compression**. This
rules out omitted source influences *at these faces*, not all possible
errors. Existing evidence shows the fixed halfway shoulder-connector
interpolation can strongly influence this patch, but a globally
different blend was previously rejected because face-specific and
clip-specific outcomes conflict. Still unresolved are connector/source
joint orientation, calibrated inverse bind and proximal torso/upper-arm
transition ownership, plus actual skinned occlusion. No general correction
is accepted pending broad-frame/bilateral and manual rendered validation.

The atlas remains an **offline diagnostic fixture, not a shipped runtime
asset**. Before any runtime change, verify independent regeneration of
that fixture from pinned hashes, and evaluate the full broad-surface
morphology/IK contact envelope without threshold relaxation.

## Required next gates

1. Run the **explicitly manual** C6 Chromium phase-acceptance workflow on a pinned revision of PR #122. The new `e2e/studio-animation-c121-shoulder-closeup.spec.ts` supplies front, three-quarter, side and rear shoulder close-ups across all 12 reported frames, for desktop and touch projects; it is not invoked by automatic PR CI.
2. Inspect the actual screenshots and identify the owner-visible face(s), then measure *neighbor-relative* posed surface orientation and self-intersection. Do not treat rest-normal orientation as proof of winding inversion.
3. Compare source-weighted uncompressed LBS reference against rendered four-influence skinning and inspect the bone-inverse binds and weighted 3D frame to distinguish source retarget orientation, rest helper calibration, and skinning-policy error.
4. Implement an animation-independent correction **only after** this evidence supports it. Preserve the source OBJ, native morphs, original clip bytes, canonical FK/IK, gameplay authority, and morphology alignment.
5. Re-run neutral/short/tall/muscular/heavy morphology and Kevin/UAL1 tests, Chromium frame sweep, lifecycle/regeneration, complete Verify and Netlify preview, all pinned to the exact successful source SHA. Obtain owner approval before merging.

**Open limitation:** local browser execution and manual workflow dispatch are unavailable to the connected GitHub editing actions in this environment; the CI logs do not substitute for rendered before/after inspection. No Cloudflare deployment is authorized.
