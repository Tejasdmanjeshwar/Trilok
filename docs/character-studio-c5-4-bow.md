# C5.4 — anatomical bow presentation (feature candidate)

Status: **feature branch under review; not owner accepted, not merged.**

## Architecture and frames
- Studio uses the *same* pinned source-skinned MakeHuman runtime, calibrated `AnatomicalFK`, `StudioBodyCollision`, C5.1 skin-fitted handle frame, C5.2 hand-contact landmark and `fitConstrainedIK`; no alternative skeleton or gameplay simulator. `StudioWeaponGrip.handContactTargets` now offers data-defined sword-handle, bow-handle and two-finger split-string-hook profiles. `StudioContactIK` supplies shared scoped joint freedoms, immutable pose command composition and bounded DLS entry points. Existing C5.1 sword targets are unchanged.
- `StudioArchery.ts` defines `BowReferenceV1`, mirror-aware hand ownership and source-grip socket validation. The descriptor is JSON-compatible; geometry/materials and their cleanup belong to `StudioBowPreview`.
- The local bow origin is the solved bow-hand grip; **+Y** follows the source knuckle line toward the upper limb tip; **+Z** is character forward and the intended arrow travel direction. Bow tips are at `(0,±limbLength,-restDistance*0.9)`, the string draw point at `(0,0,-restDistance-draw)`, and a nocked shaft extends **+Z** from its nock. These frames are converted to world via `bowWorld` and stored as an inverse source-palm socket offset.
- Mirrored left/right configurations begin with a legal C5.2-style bow-hand pose, then **jointly optimize both arm chains** against one socket-derived bow frame. The string goal is evaluated on the current moving bow at every iteration, and the opposing contact point is the posed source index/middle-finger hook rather than a fictitious offhand handle center. Per-arm initialization uses at most 24 bounded DLS iterations; coupled refinement uses at most 32. Joint freedoms remain calibrated by `AnatomicalFK`; torso clearance is evaluated during optimization. The avatar root never moves. A failed candidate restores the original source pose and makes the equipment preview unavailable. **Numerical contact and rendered-quality acceptance remain pending CI and screenshot review.**
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

## November 16 follow-up: source pose research and engineering verification

MakeHuman Community catalogs confirm these named **catalog entries**, credited to callharvey3d with listed CC0 licenses:

- [poses02](https://www.makehumancommunity.org/assets/assetpacks/poses02.html): `callharvey3d_archer_hero`, `callharvey3d_archer_square_stance`.
- [poses05](https://www.makehumancommunity.org/assets/assetpacks/poses05.html): `callharvey3d_archer_leap`.

The underlying BVH archive files were **not retrieved or inspected** in this environment. Their motion frames, hierarchy, finger/thumb channel coverage, unit conventions and compatibility with Trilok's pinned MakeHuman rig are **not verified**. No unverified reference source or animation data has been bundled, imported or retargeted. The current body and digit commands are documented source-FK-derived fallback targets, not claimed reproductions of the catalog poses. Full compatibility and any shared BVH retargeting should be implemented only after checking actual files and licensing.

### Baseline numerical evidence (PR #87 Verify run 43754366662)

| Nominal hand | Full draw/string residual | Source thumb/handle penetration | Source palm/handle penetration |
| --- | ---: | ---: | ---: |
| Left bow | 166.288 mm | 11.335 mm | 12.060 mm |
| Right bow | 166.606 mm | 11.326 mm | 12.074 mm |

These are *pre-refactor baseline measurements from CI*. Follow-up `Verify` runs 43802706132 and 43803180763 passed the full test suite and build. They measured 16.181 mm left and 16.448 mm right full-draw joint-contact residuals on the nominal anatomy, down from 166 mm. The newer source-skinned string-surface sampling measured full-draw index distances 3.015/3.083 mm and middle distances 0/0 mm (left/right), with the ring finger still 19.62/19.36 mm away. Thus the candidate explicitly uses an index/middle split release rather than falsely claiming a three-finger Mediterranean string hook. The former full-draw solver targeted a cylinder-grip palm proxy and solved arms independently after creating a bow frame from the held hand. Its displayed nock target was not guaranteed to follow the real drawing fingers, and sword curls were incorrectly reused for the string hand. The new candidate addresses the structural misalignment by using separate contact roles, a held socket transform, per-digit two-finger split-hook pose and one coupled constrained optimization.

**Remaining quantitative/visual gates:** Require <=30 mm actual drawing-finger/nock residual at full draw on both sides; measure true source-skinned fingertip/string and thumb/palm/handle signed surface errors and keep contact tolerances geometry-specific rather than treating an arm-bone error as proof. Current tests print the real source handle penetration but do not yet enforce a sufficiently strict limit. The moving bow limbs are static procedural curves, not a flexible-rod simulation. No visual acceptance can be asserted from code changes alone; obtain Chromium desktop and touch screenshots for the actual candidate SHA, including close-ups of the handle, thumb web, index/middle/ring hook, string and nock. CI tests, replay, production build, browser screenshots and preview deployment identity must be recorded separately after execution. **No combat-authority migration and no C5.5 scope.**

### Thumb and palm calibration limitation

The measured source-skinned grip still has **unacceptable local penetration**. For the nominal body, the initial published handle fit penetrated the thumb by 11.335/11.326 mm and palm by 12.060/12.074 mm (left/right). A temporary palm-augmented source fitter reduced palm penetration to ~4 mm but increased thumb penetration to 14.009/15.055 mm and left the index finger 17–20 mm away. CI run 43803557546 tested six additional thumb/index poses and reported a trade-off: even a relaxed thumb could not reliably keep all the palm, index and thumb close to one cylindrical handle. Consequently that experimental fitter was **reverted** rather than introducing a visible grip regression or simply tolerating clipping. The retained C5.1 source-fitted handle and separate C5.4 bow-finger profile need further geometric pose calibration. Unacceptable hand/handle intersections remain a blocker to C5.4 acceptance; nominal green full-draw IK tests do not resolve them.

After refactoring, the selected string-release style uses **index and middle only** (ring intentionally relaxed, not a contact point). Regression tests enforce <=8 mm measured skinned index/middle-to-string gap for nock, partial and aim in the nominal left/right configurations, separately from the <=30 mm bone-contact goal. The signed skin-cylinder penetration and aim morphology matrix are **not yet certified**. The CI workflow runs TypeScript, 424+ Vitest tests (including the 1,000-seed replay), production build and build-identity checks, but does not run Chromium/Playwright or generate screenshots on draft PRs. Desktop/mobile visual inspection and a preview deploy SHA were not verified in this session.

## November 16 recovery: finite source-skin contact and feature preview

The previous angular hand profile and handle center were fitted independently. The C5.1 `fitHandleCenter` score sampled individual digits only, used an infinite-radius surrogate in a heuristic axial interval, and did not require multiple pressure-bearing vertices or palm contact. The last offset shifted the contact frame *after* fitting and could recreate penetration. C5.4 now uses:

- `StudioSourceContact`: source-vertex anatomical region sets (palm, thumb, four fingers); deterministic capped finite-cylinder signed-distance evaluations in the actual posed, world-to-handle coordinate frame; per-region axial and multi-vertex contact coverage; nearest and third-nearest surface gaps; maximum signed penetration. The source handles and source skin share a frame; end-cap contacts are not treated as infinite-shaft hits.
- `StudioBowContact`: an alternating bounded optimization of the existing FK finger MCP/PIP and thumb channels with rigid handle-local translation. It uses the existing C5.2 bounded `fitConstrainedIK`, keeps the entire source skeleton/skin and socket attachment, and preserves C5.1–C5.3 sword/staff/shield profiles. Continuous third-nearest contact distance prevents a one-vertex false success and helps mirrored right-palm support. Final acceptance uses *all* sampled original source vertices, not just optimization samples.
- `StudioArchery` now retains a socket-local bow frame from the coupled fit, exposes per-region source-skin diagnostics, and refuses to report a reachable bow when contact criteria fail. Drawing-arm IK remains the shared coupled socket-to-string solver.

**Verified candidate `55a15dbfcc8aea9b3aadbb468a784ad3acf77588`:** [Verify #43816349686](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43816349686) passed typecheck, 425 Vitest tests (75 suites, including the 1,000-seed combat replay), production build, and built-revision identity. Both hands passed source-skinned contact acceptance and all five nominal states; full draw hook-to-nock errors were 16.068 mm left / 16.359 mm right. Actual full-draw string skin gap: index 4.30 mm left / 4.12 mm right, middle 0 mm, and ring is intentionally not a contact digit.

| Region | Left surface gap (mm) | Right gap (mm) | Left deepest penetration (mm) | Right penetration (mm) |
| --- | ---: | ---: | ---: | ---: |
| Palm | 1.312 | 2.031 | 0 | 0 |
| Thumb | 0.475 | 0.364 | 0.547 | 0.586 |
| Index | 0.188 | 0.001 | 2.687 | 1.119 |
| Middle | 0.040 | 0.194 | 0.040 | 0.416 |
| Ring | 0.097 | 0.137 | 0.097 | 0.137 |
| Little | 0.047 | 0.740 | 1.184 | 0 |

Source right palm has only two vertices inside the 3 mm pressure band, so visual acceptance remains necessary even with numerically valid support. The current tests do not certify contact patch area, triangle swept collision, dynamic transition smoothness or all extreme morphology combinations.

**Cloudflare:** Workers preview build `476803db-2235-46a1-be97-d97486070b4f` and deployment `bd00679e-4be6-4af5-9c21-a2d62944049d` were reported successful for `55a15db`. Branch preview: https://feat-c5-4-anatomical-bow-draw-trilok.tejasdmjr996.workers.dev/studio/ ; immutable deployment URL: https://bd00679e-trilok.tejasdmjr996.workers.dev/studio/ . The Cloudflare deployment comment confirms the SHA; independent browser page retrieval is unavailable from the connected execution environment.

A feature-scoped `c54-bow-visual.yml` workflow now captures desktop/touch Chromium full-view and hand-focused screenshots for both hands and all five states, uploading evidence to Actions without treating the slice as phase-C5 acceptance. **These screenshots must actually complete and be visually inspected before requesting signoff.**

MakeHuman `poses02` and `poses05` packs are available from the official CC0 pack catalog, but the ZIP/BVH payloads could not be fetched from this execution environment, so the hierarchy/finger channels and rig compatibility remain unverified. No uninspected BVH is imported. A separate automated seeded morphology and extreme-proportion bow-contact matrix remains outstanding.

The original owner acceptance remains reserved for phase C5. PR #87 stays draft/open and unmerged. This subsection records the verified `55a15db` checkpoint; later workflow or screenshot-only commits require their own checks before being described as passing.

## 2026-11-16 — Original MakeHuman archer BVH recovery (source evidence)

This supersedes earlier statements that no actual BVH was inspected. An isolated source-audit workflow ([run 43822666387](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43822666387)) fetched two **actual single-frame source BVH files** from the public `lsmpp/omni-refiner-video` dataset at immutable revision `5917810cd4983e9fd757fc44efd39b3dd7648ee0`. The official `files2.makehumancommunity.org` and `files.makehumancommunity.org` ZIP mirrors failed DNS resolution in GitHub Actions; the audit records both failures rather than substituting thumbnails.

| File | Size (bytes) | SHA-256 |
| --- | ---: | --- |
| `callharvey3d_archer_hero.bvh` | 44,169 | `a6750c2d3a1eb27eedd09d04312e55db59f267f9d60b3262392b9c76a65777cc` |
| `callharvey3d_archer_square_stance.bvh` | 44,160 | `cbd91e39bad431d684a30893cd0651947a3dda4bb149bb33439dfb597b1b83a7` |

Source URLs:
- https://huggingface.co/datasets/lsmpp/omni-refiner-video/resolve/5917810cd4983e9fd757fc44efd39b3dd7648ee0/synthesis_data/mpfb/poses/callharvey3d_archer_hero/callharvey3d_archer_hero.bvh
- https://huggingface.co/datasets/lsmpp/omni-refiner-video/resolve/5917810cd4983e9fd757fc44efd39b3dd7648ee0/synthesis_data/mpfb/poses/callharvey3d_archer_square_stance/callharvey3d_archer_square_stance.bvh

The inspected files each contain `HIERARCHY`, a `root`, **163 named joints**, 978 total channels, one `MOTION` frame and `Frame Time: 0.041667`. Every joint advertises X/Y/Z position and X/Y/Z Euler rotation channels. Both contain all thirty `finger1-1.L` through `finger5-3.R` segments, and 27/30 have substantial (>1°) nonzero rotations. There are *real digit rotations*, not just pose catalog entries. The two source poses' finger Euler rotations match within 0.0001 degree, while some wrist/body channels differ: they provide a shared starting grip, **not** independent five-state bow/string dynamics. The BVH rotation composition must be retargeted into `AnatomicalFK` using source rest orientations, not copied as Euler-angle FK commands.

`OfficialHumanRig.sourceBoneForRole` confirms the expected source naming for fingers and wrists. Crucially, the existing MakeHuman adapter intentionally maps `.L` bones to Trilok's **right** semantic side and `.R` to **left**; blindly assigning BVH hands by their suffix would mirror the pose incorrectly. Full bind-transform and geometry compatibility still needs a source-skinned replay against the pinned MakeHuman default skeleton; matching names alone does not certify it.

`callharvey3d_archer_leap.bvh` (poses05) remains **unavailable**: both official ZIP hosts failed DNS resolution and the pinned Hugging Face mirror returned HTTP 404. No leap data has been fabricated. **License discrepancy discovered in original-style metadata sidecars:** both mirrored files contain the exact line `license CC-by`, whereas the official MakeHuman asset-pack catalog marks these same named assets CC0. Do not assume the original pose BVHs are unconditionally CC0 or bundle them into runtime distribution without resolving provenance and attribution. The original official ZIP hash could not be independently compared while the official mirrors fail DNS resolution. The audit's actual source BVHs, both `.meta` sidecars, full channel listing and SHA-256 evidence are preserved in the artifact [c54-makehuman-original-source](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43822666387#artifacts).

**Engineering gate:** No more manual finger-angle guesses; use these inspected source rotations only after checking correct world-to-local rotation order, rest bone orientation, per-hand semantic reversal, and rendered source-skin/handle contact. These source files have not yet been imported as an active runtime pose; earlier unverified IK variants and visual defects remain unresolved.

**Metadata sidecar content verified 2026-11-16:** `callharvey3d_archer_hero.meta` contains `name ArcherHero`, `stand full draw dynamic`, `license CC-by`; `callharvey3d_archer_square_stance.meta` contains `name ArcherSquare`, `square stand full draw`, `license CC-by`. The two CC-by claims are preserved verbatim in the archived file records, not silently relabeled CC0. These are static single-frame reference poses; using the `stand full draw dynamic` tag does not make the BVH a multi-frame animation.

### Verified pinned rig match and committed reference files

The audit independently fetched and verified the exact pinned MakeHuman default skeleton (makehuman/data/rigs/default.mhskel, upstream revision a8bc2d54ff0ac92e78ff71431b1023eda42bf482, Git blob b02cbecae00143856410d7561adf006d83bf9b3e, 117,790 bytes). **Both reference BVHs match all 163 bone names in this source rig**, with zero missing/extra bones. The source-rig name parity is verified; local/world rotation basis and skinned-grip quality remain separate acceptance gates.

The two SHA-256-verified BVH files and their actual metadata sidecars have now been committed to assets/reference/makehuman/c54-archery/ on PR #87, along with attribution and the licensing discrepancy. These are development references only; not included in the production runtime. The source-audit workflow was returned to manual-only mode to avoid rerunning downloads and using CI budget on every later feature-branch commit. [Acquisition and exact skeleton comparison](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43823690197) and [file-preservation workflow](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43823927901) provide logs.

**Actual pose differences:** both static reference files have 163 joints, 978 channels and one frame; their 30 finger-joint rotations differ by less than 0.0001 degrees (matching reference grip), while wrist/stance channels do differ. Both have exactly the same MakeHuman source bone names as the pinned Trilok default skeleton. Source .L is mapped to semantic **right** by OfficialHumanRig.sourceBoneForRole, and source .R to semantic **left**. Do not directly copy BVH X/Y/Z Euler values into FK freedom angles without first recovering source-local quaternions and converting to calibrated axes.

**Still missing:** the third requested callharvey3d_archer_leap BVH was not present at the alternate mirror, and MakeHuman's two official pose-pack file hosts failed DNS resolution in GitHub Actions. This is an external source-availability blocker for the third reference, not a reason to fabricate its channels or halt evaluation of the two verified references.

## C5.4 original MakeHuman BVH retargeting implementation — 2026-11-16

**Implemented on the existing draft PR #87, without changes to combat authority:**

- `StudioMakeHumanArcherChannels.ts`: checksum-traceable selected XYZ Euler channel data extracted from the original 163-bone single-frame `callharvey3d_archer_hero` and `callharvey3d_archer_square_stance` BVHs. Original source files and CC-by metadata sidecars remain under `assets/reference/makehuman/c54-archery/`. The metadata / catalog licensing discrepancy and author attribution remain explicit.
- `StudioMakeHumanArcherRetarget.ts`: source-bone names resolved through `OfficialHumanRig.sourceBoneForRole`, correct source .L/.R semantic reversal, XYZ Euler -> normalized quaternion -> projection onto existing C1 `AnatomicalFK` calibrated legal joint channels using `ConstrainedIK`. Returns immutable source-derived finger/arm commands and angular residual diagnostics; preserves source skeleton, offsets, root transforms and joint limits.
- `StudioArchery.ts`: uses real BVH-derived holding/drawing hand channels and arm seeds. The original C5 contact profile is retained as a **competing anatomical initialization**, not a separate IK system. Choose pressure-bearing bow contact from post-FK **full-source-skinned finite cylinder evaluation**. Coupled drawing-arm and source-finger joint optimization shares one socket-driven nock/string/arrow frame; actual skinned source pads (not bone midpoint alone) constrain string contact. Three data-derived digit seeds (reference, calibrated profile, their midpoint) cover morphological variation.
- The shared deterministic `ConstrainedIK` optionally accepts a legal trust-region maximum; its existing default is unchanged for sword/staff/shield. Source-string Jacobians use deterministic bounded source-vertex samples to reduce CPU cost, **but a candidate is checked against all original source-skin vertices before becoming reachable**. Selected index and middle skin/string gaps are a hard reachability condition. Visual corrective morph targets are reset before every authoritative pose solve, eliminating state-dependent repeatability errors.
- `tests/character-studio-archer-reference.test.ts` confirms source SHA-256, exact numeric imported channels, source-side reflection, 163-joint hierarchy, author metadata and deterministic legal FK targets. Existing `tests/character-studio-archery.test.ts`, `tests/character-studio-bow-morphology.test.ts`, other weapon tests and deterministic combat replay remain active, with no weakened acceptance thresholds.

**Verified numerical checkpoint:** commit `430aa5b0edf599396e84a2fcf1e8e90d22c6a1bb`; [Verify run #43831301066](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43831301066) **passed TypeScript, all 435 Vitest tests / 77 suites (including combat replay), production build and compiled build-identity verification**. Earlier candidates passed all assertions but hit Vitest worker RPC timeouts; the sampled-Jacobian/full-geometry-verification separation removed that observed test-run failure. All five states were reachable nominally for left and right; valid morphology variants tested include short/light, tall/muscular, wide shoulders, asymmetric hands, and deterministic seed 9813, preserving safe unreachable-pose fallback.

Nominal skinned bow-hand maximum penetrations: **2.798 mm left (index), 1.378 mm right (index)**; palm gap **1.791 / 1.671 mm** and no palm penetration. Vertical bow-axis tilt approx. **7.26° left / 7.36° right**. Full-draw hook/nock residual **23.474 mm left / 10.069 mm right**, under the unchanged 30-mm threshold; full-draw source-skin index/string gap **at most 7.068 mm left / 3.862 mm right**, middle **at most 0.896 mm left / 0 mm right**. Nock and partial contact checked independently; string and arrow share the resolved nock. Results are provisional numerical gates, **not** user visual acceptance or proof of production visual polish.

**Visual preview remains an outstanding independent gate:** existing browser screenshots [Chromium run #43816979721](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43816979721) were captured at an *older* commit and visibly failed due sideways bow/over-head arm/shoulder artifacts. Those images cannot validate the new BVH-retargeted checkpoint. The repository reserves Chromium for manually dispatched `phase-acceptance.yml`, so the PR's automatic Verify does not render new browser screenshots. Review the feature Cloudflare preview at the commit-specific deployment SHA after independently confirming it, especially full-body nock/draw, palm/index contact, over-head elbow, shoulder skin deformation and mirrored views. The CC-by source-sidecar versus official catalog CC0 discrepancy also remains unresolved before production redistribution.

**State:** C5.4 is implemented and numerically validated, but not visually signed off. PR #87 remains draft/open and unmerged; do not begin C5.5 until remaining visual gates and licensing are resolved.

### Cloudflare Workers Builds RPC timeout mitigation — 2026-11-16

The Cloudflare build that checked out `85200f577a61cb7bb517e0b632211bf86bccc98f` installed dependencies, passed `pnpm typecheck` and ran **all 435 tests in 77 suites successfully**, but Vitest 3.2.7 then reported **two unhandled `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC errors**. The Cloudflare build command `pnpm install --no-frozen-lockfile && pnpm typecheck && pnpm test && pnpm build` therefore terminated before production compilation. Github's Verify on the identical commit passed, confirming the CI-environment-specific worker-RPC timing issue.

Cloudflare's log showed `tests/character-studio-bow-morphology.test.ts` took 90.619 seconds and `tests/character-studio-two-hand-ik.test.ts` took 60.777 seconds. Vitest 3.x fork RPC has an approximately 60-second `onTaskUpdate` timeout independent of test timeout values (see [upstream issue #8164](https://github.com/vitest-dev/vitest/issues/8164) and [discussion #6511](https://github.com/vitest-dev/vitest/discussions/6511)). **Fix:** retain every original test case/assertion/tolerance but extract one shared C5.4 morphology assertion and distribute the five variants over three shorter test files (2/2/1), and move the expensive C5.2 two-hand native hand proportion test into its own file using the existing identical shared `make` fixture. Keep `pnpm test` running the complete `tests/` tree, including full combat replay. No skip, timeout extension, omitted weapon, or test gate relaxation was used. These changes target the failure mechanism without altering gameplay code or Cloudflare build configuration.

Final Cloudflare build, resulting preview SHA and fresh browser screenshots must still be checked independently before user visual review and C5.4 acceptance.

### CI browser policy correction — 2026-11-16

The temporary automatic `studio-c54-render-review.yml` workflow successfully
built and verified commit `92d6abba90b63e189fcce15dd9db9438635f9730`,
executed the left/right five-state desktop/touch Chromium archery test, and
uploaded screenshots as [run 43835228620](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43835228620)
artifact `c54-archery-92d6abba90b63e189fcce15dd9db9438635f9730`
(artifact ID 14210682649, 14-day retention). The same commit's Verify suite
failed one **CI policy** test: `tests/ci-phase-gating.test.ts` deliberately
prohibits automatic Playwright/Chromium on PR pushes and reserves it for
manually dispatched `phase-acceptance.yml`. Revert the temporary
automatic browser workflow, without modifying or weakening the existing
CI policy test. The successful screenshot artifact remains available
from the completed run for independent visual inspection. For later
candidate revisions, request the existing manual phase-level acceptance
workflow rather than automatically running browsers on every push.
The Cloudflare feature preview still needs independent SHA verification.


## 2026-11-16 — canonical mirrored stave geometry correction (review candidate)

User feedback identified a visually crooked and irregular wooden stave. The root cause in source was the prior four-point Catmull–Rom limb loft: local X points moved to -0.055 / -0.11 metres independently of the string-plane (+Y/+Z), creating an unintended sideways sweep. A constant-radius \`TubeGeometry\` generated a rounded tube instead of tapered wooden limbs. Although the control points used a ±Y sign, that alone could not produce an intentional bow silhouette.

\`StudioBowGeometry.ts\` replaces both individual tubes with a single closed, analytically sampled, lofted stave. Canonical metres: +Y is upper tip, +Z is arrow travel and stave belly, +X is width; the bowstring and stave centerlines occupy the YZ plane, with the unchanged source-grip cylinder at local origin. A single upper half defines the rest shape; the lower half is reflected exactly through Y=0. Fixed ring orientation uses the X width axis and analytic YZ tangent/normal; there are no Frenet frame flips. A smooth square-sine camber with optional localized fourth-order recurve controls the depth silhouette, while taper shapes the elliptical stave sections. Cap geometry has explicit outward winding and deterministic UVs. The default is **recurve**, and the Studio equipment panel also exposes **traditional**.

The bow remains rigid during string movement, and the renderer takes physical upper/lower nocks from the generated geometry's shared \`bowNockLocal\` coordinates; the drawing solver retains its established local nock and contact frame. This change intentionally leaves \`StudioWeaponGrip\`, \`StudioContactIK\`, \`AnatomicalFK\`, sword/staff/shield systems, and authoritative combat untouched. Grip cylinder radius/length and its socket transform are not visually offset. Profile changes rebuild only the disposable preview geometry/materials, leaving IK/contact pose unchanged.

Tests added in \`tests/character-studio-bow-geometry.test.ts\` exercise profile smoothness, exact mirrored half-section metrics/positions, monotonicity, finite mesh attributes, nondegenerate triangles, indices, UVs, deterministic replay of generated vertices, geometry disposal, nocks, and multiple dimension variations. Existing nominal source-skin bow contact and all-five-state tests remain active; the Playwright Studio test captures both profiles for both handedness configurations.

**Acceptance still gated:** This source commit is not proof of successful CI, physically perfect silhouette, or deployment. Fresh exact-SHA Chromium desktop/touch screenshots must be inspected; Cloudflare deployment identity and the final numeric CI results must be recorded separately. PR #87 remains draft/unmerged.

## C5.4 — generated character bow-failure diagnostics

Previously `StudioViewport.reportGripFailure` returned immediately for anything other than `longsword-*` or `staff-*`. Consequently an unreachable `bow-left` / `bow-right` preview only displayed the generic error: neither the existing "Copy grip issue details" button nor the browser warning appeared. The source solver's structured `ArcheryPoseResult` was discarded on failure. Rebuilt generated characters also reinstantiated `StudioPosePreview` with implicit rest/default draw, losing the selected nock, partial, aim or release state.

The failure reporter now has a discriminated `trilok.studio.bow_equip_failure` event alongside the original unchanged `trilok.studio.two_hand_equip_failure`. Bow reports include the attempted full versioned character recipe (including generator seed and edits), current Studio pose, bow handedness, selected traditional/recurve profile, state and draw control, build identity, reachability reason, constrained solver iterations/attempts, bow-hand and draw-hook residuals, skin-to-string gaps, finite source-skin contact summaries, clearance, descriptor and nock/drawing contact coordinates. Exception and missing-result paths remain copyable without exposing browser/device identifiers or Three.js matrices.

The existing Studio copy button and console-warning callback are reused, including failures following equipment selection, archery state/draw/profile changes, expression/pose updates and character regeneration. Generated characters inherit the active archery state/draw on their new source-skinned rig. Failed preview does not force an unreachable pose or alter authoritative combat; diagnostic state clears on successful equipment preview. Existing C5.2 sword/staff report schema and tests remain unchanged. The original general generated-character preservation semantics remain in place.

`tests/character-studio-grip-diagnostics.test.ts` now covers source-skin measurements and exact source-edited seed capture for failed full draw, copyable exception cases and the legacy two-hand report. CI/build results and interactive Chromium screenshots require their own review before this is called deployed.

## 2026-11-16 — user-generated seed 2929832126 source-thumb contact recovery

A real failure report from Studio build `a5fbe394ac201778540704f0f701093a4d1a2c48` identified an unreachable `bow-left` / `rest` / `recurve` preview on generated seed `2929832126`. The left source thumb penetrated the actual finite handle cylinder by **4.576 mm**, violating the existing strict 3 mm threshold, while the bow-hand target residual was only **70.74 mm** (below the stature-scaled target gate) and body clearance was positive. This is a local source-skinned grip-fit failure, not a draw-arm or bow-stave silhouette failure.

The initial radius-only fallback retained unsafe thumb contact or lost other source finger contact, and an exact-seed regression correctly failed in [Verify #43849369539](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43849369539). The corrected `StudioBowContact.fitMorphologyAwareBowRadius` first scans only bounded physical cylinder radii, then—*only on failed contact*—jointly refits legal source-finger FK and the authoritative rigid handle frame using **all thumb source vertices** in the constrained Jacobian (the default fast 80-vertex sampler had missed the deepest thumb intersection). It searches modest alternative radii, checks every region using *all original source skin vertices*, and accepts a candidate only with the **unchanged** per-region penetration (<3 mm), finite axial-contact and nearest-gap gates. The chosen physical radius is propagated into the bow descriptor used by the visible handle, stave and grip evaluator. No independent visual offsets, altered arm/IK constraints, test skips, modified damage rules, or tolerance relaxations.

**Verified on exact generated source anatomy, `bow-left/rest`:** `radius=7.408176 mm` (original `8.231307 mm`), thumb maximum penetration **0.695998 mm**; palm **0.128746 mm**, index **0.458261 mm**, middle **0.533909 mm**, ring **1.732466 mm**, little finger **0.524167 mm**. Contact vertex counts respectively **9/3/18/9/8/15**, with each region passing the minimum two pressure-vertex gate. The source rest pose is reachable and deterministic across refresh. The one new regression file `tests/character-studio-bow-user-seed.test.ts` reconstructs the *actual* versioned generator output and checks source skin, dimensions and repeated pose determinism, rather than asserting on a fabricated solver report.

[Verify #43850054797](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43850054797) passed 444/444 Vitest tests across 82 suites, TypeScript, production build and compiled build identity on candidate `6d8adca0937c657851955a82b9047ea3b5e2ffd1`. **The final documentation commit must be independently verified**; existing manually gated Chromium phase-acceptance and fresh Cloudflare preview SHA verification remain outstanding. The selected thumb pressure patch is only three source vertices, so numerical contact alone is not sufficient for final visual signoff. PR #87 remains draft/open and unmerged.

## C5.4 direction-consistent archery alignment (review candidate)

A full-draw contact residual alone does not prove that an arrow points where the
avatar faces. The earlier coupled solver penalized bow uprightness but allowed
rotation about that upright axis, and it never measured forward-arrow angular
misalignment. Studio now uses the existing FK and coupled contact solver to
minimize the *socket-derived* arrow +Z direction against the avatar's forward
axis, with an explicit 15-degree support envelope for nock, partial and full
aim. The world-space bow, string and arrow all remain under the same contact
frame; there is no cosmetic post-solve arrow or bow rotation. A candidate
outside the orientation gate returns `aim-unreachable` with the numeric angle
in the reproducible failure report, and reverts to the safe source pose.

The desktop/touch visual gate and real morphology coverage remain independent
of numerical tests. The 15-degree bound is a preview aiming constraint, *not*
a combat ballistic elevation rule. This change does not modify combat launch,
damage or projectile timing. Measure exact before/after values in GitHub Verify
and inspect newly generated browser screenshots before visual acceptance.


## 2026-11-16 — Bilateral source-symmetry certification and mirror-IK investigation

PR #87 neutral source audit uses `tests/character-studio-bilateral-symmetry.test.ts`, the real pinned OBJ, default MakeHuman skeleton and actual calibrated source skin. All measurements use the avatar's local sagittal reflection `M = diag(-1,1,1)`, not world X or arbitrary Euler negation. A vector position reflects as `M*p`; a world rotation's axial quaternion component reflects as `(x,-y,-z)` and must be evaluated against the **rest-calibrated** right-hand bone frames.

**Baseline measured in Verify #43866019640, before spatial sampling change:** 6,216 unique included body source vertices on each side farther than 15 mm from the sagittal plane. Every one found a matching reflected vertex in a 5 mm spatial bin; measured nearest-match mean/max rounded to **0.000 mm**. All 19 paired clavicle/shoulder/elbow/wrist/palm/thumb/finger joint landmarks measured **0.000 mm** local reflection mismatch. FK axes all match axial reflection within 0° or are exactly opposite (180°), with identical calibrated limits; shoulder axial rotation, elbow axial rotation and finger abduction require opposite signed joint commands. This verifies neutral *source positions and sampled axes*; complete source weight/corrective deformation symmetry and every anatomical region are not yet independently certified.

The same baseline shows severe *solver* rather than bind-anatomy asymmetry:

| State | Reflected bow grip (mm) | Reflected elbow (mm) | Reflected shoulder (mm) | Reflected nock (mm) | Arrow-axis disagreement |
| --- | ---: | ---: | ---: | ---: | ---: |
| rest | 0.811 | 0.748 | 0 | 0.818 | 0.017° |
| nock | 17.377 | 38.454 | 24.008 | 19.684 | 1.215° |
| partial (100%) | 17.616 | 30.192 | 5.625 | 12.789 | 1.456° |
| aim (100%) | 7.371 | 54.456 | 94.941 | 7.388 | 1.026° |
| release | 0.811 | 0.748 | 0 | 0.818 | 0.017° |

Full-draw baseline pitch was left +1.477°, right +2.471°; yaw left -3.060°, right +3.317°. Mirroring requires equal pitch and opposite yaw, **not merely <=15° arrow deviation**. Intermediate draw measurements were worse in some cases (aim 50% lower bow-tip mismatch 159.108 mm). This is a real blocker for mirrored pose acceptance and cannot be dismissed by contact reachability.

The initial audit-only CI run had 445 passing tests and **one test-author assertion error**: the audit initially required more than 20 paired joint roles, whereas the defined complete set is exactly 19. The assertion was corrected in a subsequent commit. No existing gameplay regression failure was reported by that run; build was skipped after the failed audit check.

**Correction under verification:** `StudioSourceContact.sourceHandSamples` formerly chose reduced finite-difference samples by OBJ source-vertex index, which is not a bilateral mapping. The new reduced-sample path orders eligible vertices by actual source Y, Z and absolute X before selecting quantiles, so reflected source hands evaluate equivalent spatial points. Every final skin-cylinder and string contact still uses the complete original source vertices, unchanged physical dimensions and unchanged contact limits. This is a shared source-contact sampling correction, not a copied right/left pose or display-only rotation. It must be remeasured in CI; it does **not** by itself establish mirror invariance.

**Outstanding before acceptance:** compare post-fix landmarks/bow/string/shaft across all five preview states and progressive draw; isolate remaining source retarget projection and feasible-first IK selection; certify skinning weights and procedural correction symmetry; add tight enforceable mirror bounds and repeatability tests; run all Vitest, replay, typecheck/build, Chromium visual evidence, and exact Cloudflare SHA verification. Preserve C5.4 thumb/handle and index/middle hook gates, avoid altering combat, do not begin C5.5 or merge PR #87.

## 2026-11-16 — Canonical parameter-space optimization (follow-up to bilateral audit)

The shared bounded damped-least-squares core remains the only numerical IK
solver. `fitCanonicalIK` maps each source-calibrated anatomical axis into a
canonical mirrored parameter orientation by a signed, invertible transform,
including its joint limits, seed, Jacobian probes and line search. The fit
maps the winning parameters back to the actual native FK channels. Both
sides continue to obey their **own** morphology and joint limits; it is not
a solved-pose copy or a blanket requirement that asymmetric characters be
bilaterally identical.

The holding-arm fit now uses canonical parameterization, with axial signs
derived from the MakeHuman rest world quaternions and semantic counterpart
axes. **The initial experiment applying this to the coupled two-arm/string
fit was reverted**: Verify #43878953017 failed two regressions (left-hand
nock became unreachable) and still showed non-mirrored intermediate states.
The coupled draw solver therefore retains its previous working direct DLS
path. The shared canonical utility adds no degrees of freedom, passes or
companion mirrored solve where it is used. Generic
unit tests exercise exact reflected objective and evaluation-count parity,
plus independently constrained asymmetric targets.

**Verification is required before acceptance.** The earlier bilateral
measurements are diagnostic only; canonicalizing parameters does *not*
establish reflection equivalence of source-skin sampling, anatomical
contact residuals, arm-seed choices or feasible-first candidate selection.
The existing 13-state neutral pose diagnostic must be remeasured from CI
before tightening the mirror invariants. The previous full-draw 27.4 mm
bow-grip and 3.095-degree arrow mismatch are known failures, not accepted
limits. Do not merge or claim visually accepted symmetry on the strength
of a green unit suite alone. Verify real CI, Cloudflare feature-preview
identity and Chromium visual samples separately.
