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
