# Character Studio C5.2 — Weapon-first two-hand reconstruction

**Status: draft PR #84, NOT accepted or merged.** The owner rejected preceding C5.2 renders: the pose looked like independently equipped hands and the sword handle approached blade length. C5.1 remains the accepted merged one-handed sword. No changes to combat authority.

## Interpretation of the reference

MakeHuman's native pose assets encode skeletal poses as BVH; MPFB also offers FK/IK pose captures and grip-control bone conventions. Neither source provides a validated, runtime, two-hand sword attachment solver. A *two-handed sword* is a **single rigid weapon with two hands stacked at separate locations on the same hilt**. It is not two swords, nor are the sword and staff interchangeable arm poses. References:

- https://ww.makehumancommunity.org/assets/creatingassets/faq/how_can_i_create_poses.html
- https://github.com/makehumancommunity/mpfb2/blob/master/docs/fileformats/pose.md
- https://www.makehumancommunity.org/news/2024-06-23-mpfb-now-supports-bvh-style-poses.html

No Blender dependency, external pose art or unverified licensed asset is added.

## Fixed reference blueprints (base adult, before source-stature scaling)

| Property | Two-hand sword | Staff |
| --- | ---: | ---: |
| Hilt/handle length | 0.28 m | n/a |
| Blade length | 0.86 m | n/a |
| Continuous shaft length | n/a | 1.72 m |
| Grip locations on weapon-local +Y | +0.095 m and -0.095 m | +0.245 m and -0.245 m |
| Separation | 0.19 m | 0.49 m |
| Guard width | 0.22 m | n/a |
| Nominal shaft/handle radius | 0.0135 m | 0.015 m |

Blueprints are independent constants. Source stature changes their *scale*, with explicit limits; finger/palm distance, IK residual, elbow position and arm reach must **never** increase a hilt or shaft. The sword blade-to-hilt ratio is about 3.07. Grip zones are fixed inside the hilt with guard/pommel clearance.

## Revised constraint chain

1. Reuse the pinned CC0 MakeHuman source skeleton, actual skinned human and legal `AnatomicalFK` freedoms. Keep C5.1 `StudioWeaponGrip.ts` unchanged.
2. Establish separate ready-stance joint presets for sword and staff, with forearm and wrist channels.
3. Define a **single** body-relative rigid weapon matrix using torso/root orientation, independent of hands. The sword is forward-up diagonal, while the staff presents a wider transverse low guard.
4. Transform both fixed weapon-local grip landmarks through that one matrix.
5. Deterministically optimize each arm's calibrated clavicle, shoulder, elbow, forearm pronation and wrist freedoms toward its assigned landmark and shaft orientation. Steps and sweep counts are finite; no root or weapon adjustment is permitted.
6. Preserve existing finger flexion, source-calibrated spread and thumb opposition overlay. Disallow head proximity, crossed forearm centerlines, high elbows/palms and excessive wrist/arm travel. If convergence is inadequate, restore the original pose and show an unavailable message rather than a wrong grip.
7. Attach one disposable weapon visual to the primary semantic socket using the solved *fixed world matrix*. The offhand does not create a second weapon or determine its transform.

## Verification and unresolved gates

Tests must assert the constants above **independently** of computed palm positions, the full rigid transform, grip contact, source anatomically bounded joint commands, mirror sides, morphologies, pose changes, determinism and root invariance. Hand/finger **surface** contact and skinned-mesh self-collision remain additional acceptance criteria. A valid palm residual is not visual success.

`e2e/studio-two-hand-grip.spec.ts` is configured to save front, side, three-quarter and hand-focused images on both desktop Chromium and mobile touch for each weapon/leading hand, in addition to pose and morphology reapplication. Full Chromium runs are reserved for manually dispatched Phase Acceptance, per the existing project CI policy.

**No visual signoff:** screenshots of the **current reconstruction** must be actually rendered and inspected, not inferred from tests or old branch preview. Do not merge PR #84 until green Verify, browser and source-skin inspection, exact Cloudflare preview identity, and the owner's visual approval. If the static body-relative placement cannot be reached without ugly arm rotations, change the authored *stance or placement* with anatomical evidence; do not change the weapon dimensions to fit hands.


## Blender reference-authoring integration (new draft tooling, not C5.2 acceptance)

- \`tools/blender-c52/export-source.test.ts\` builds a **new, complete skinned neutral source human** using the exact pinned MakeHuman OBJ, official source skeleton and source weights already used by Studio; it exports a metric Y-up OBJ and versioned per-vertex weights, parent-bone identities and semantic links. No Blender executable is required for users or browsers.
- \`tools/blender-c52/author.py\` imports that precise source skin and named bone hierarchy into **Blender 4.5.16 LTS**, reconstructs an IK reference-armature with elbow pole targets and one dimensioned sword/staff object per candidate, and records pose candidate landmarks and multi-angle front/side/three-quarter/close-up images for both leads.
- \`.github/workflows/c52-blender-reference.yml\` installs Blender only inside an Ubuntu CI job, checks the official release checksum, generates the source export and uploads the output screenshots/diagnostic JSON for human review. This is separate from web, combat, Vite bundles and Cloudflare. All outputs are **unreviewed candidates** until checked against the actual MakeHuman geometry and appropriate wrist/finger contact.
- **Important:** the current Blender renderer does *not* yet provide validated anatomically constrained pole-angle and wrist/twist targets, surface contact, collision checking or pose-transfer into Three.js. Its output is an independent visual diagnostic starting point. Merely generating it cannot close C5.2. The existing runtime branch IK remains unresolved and the current 4 CI failures must be fixed with preserved acceptance thresholds.

### Independently confirmed open defects (Verify #43687870601)

The latest earlier-head test run (2934a2f) failed four C5.2 source tests, while its other 68 files passed: neutral primary palm residual **10.80 mm** against 6 mm in each mirrored lead; and the \`whole-extreme\` Studio pose was not reachable with either lead. Only neutral sword and staff grips happened to fit the broader 23 mm solver threshold; numerical convergence has not demonstrated convincing multi-view gripping. The full-body extreme pose requires an explicit, visually safe unavailable path if a realistically constrained grip is impossible—do not force a weapon, loosen a tolerance or translate the root. Follow-up runtime IK corrections must be based on **inspected** Blender and Chromium renders, not the unreviewed reference-generation job.


### 2026-11-15 source-Blender validation results — REJECTED

Pinned Blender 4.5.16 ran successfully in GitHub Actions:
- [First complete source reference run #43690404888](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43690404888): all 16 reference renders produced, but wrist-only target errors were about 30–61 mm at actual palm joints. Visually unacceptable arm and hand poses.
- [Two-bone IK reference run #43690786278](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43690786278): source palm residuals were reduced to submillimeter values; visuals still show improperly bowed elbows and fingers far away from the common handle.
- [Latest wrist-axis and C5.1 digit source reference run #43691138982](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43691138982): headless workflow **passed** and generated front, side, three-quarter, close-up PNG images for sword-right, sword-left, staff-right, staff-left. Actual palm-to-target residuals in its reference JSON range **0.010–0.294 mm**, but **the images were inspected and REJECTED**: elbows curve toward the torso, lead upper arms create unnatural loops, and sword wrist/finger positioning does not reliably wrap the handle. Staff grip appearance is improved in some close-ups but still not an anatomically credible, production-acceptable pose. The source Blender screenshots are diagnostic, not the finished Three.js results.

**C5.2 is not implemented end-to-end.** The existing Three.js solver on PR #84 is still not corrected or visually certified against the rejected reference, prior 4 Vitest failures remain unresolved, and desktop/touch browser acceptance and exact feature-preview deployment-SHA checks have not been performed. Keep PR #84 draft and unmerged; no C5.2 issue closure. Reference candidate JSON must not be promoted to an accepted pose definition on IK numeric convergence alone.

The blocking implementation work is to obtain a separately plausible pole/orientation-constrained arm pose with source-skinned finger-cylinder surface contact and torso/forearm intersection checks, transfer the validated pose/constraints into the engine and test it across morphology/Studio poses, then compare new Three.js browser screenshots with the actual Blender reference images. Preserve all existing C5.1 behavior and acceptance thresholds.


### Corrective execution — Blender shoulder/elbow authoring and source-contact retargeting (2026-11-15)

This corrective work was implemented in PR #84, not merged:

- Replaced the previous three-link wrist IK and unreliable unconstrained pole target with an analytical, exact-length, two-segment shoulder–elbow–wrist construction. Pole directions favor outward, sub-shoulder elbows; source wrist orientation explicitly aligns the actual little-to-index finger knuckle line with one rigid weapon; iterative retargeting uses a source finger-envelope contact point, not the palm bone pivot.
- The pinned source-skinned renderer successfully produced **16 images across four equipment configurations**, with actual source-body surfaces. Blender run [#43692359379](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43692359379) and lowered staff-pole follow-up [#43692889963](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43692889963) completed. Measured grip contact residuals were **0.16–0.67 mm**, little-to-index/shaft axis alignment dot `1.0`, and outward elbow displacement positive. These metrics do not certify collision-free finger wraps or film-quality poses; actual visual review showed a clearly improved one-weapon presentation over the previous rejected crossed-arms renders, with residual stiffness (particularly staff elbows and guard/palm intersections) still requiring work.
- Added source-derived, versioned elbow direction references to `StudioTwoHandGrip.ts` and began constrained FK integration. Root, weapon dimensions, one-handed sword and combat systems were not intentionally changed.
- The runtime's old 6 mm assertion incorrectly compared the weapon axis to the *palm bone joint*, rather than the physically relevant finger-envelope contact point. A new `twoHandGripContactWorld` target applies the same 53% palm-to-knuckle interior reference as Blender, and the unchanged **6 mm** test threshold is now applied to the contact point.
- **Not yet passing:** Verify [#43693215165](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43693215165) showed 5 failing C5.2 tests after initial elbow guidance, and [#43693452842](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43693452842) showed 6 C5.2 failures after switching to finger-envelope contact: palm position convergence improved to 1–3 mm but offhand grip *axis* remained invalid (negative alignment dot). This is a real grip-orientation failure, not permission to loosen tests. A subsequent runtime orientation-cost revision remains unverified.
- The Studio `whole-extreme` pose is demonstrably incompatible with the fixed weapon and current arm constraints; the updated negative regression asserts an explicit safe rejection instead of forcing out-of-range arms. All normal supported Studio poses remain positively asserted.

**Current acceptance state:** Blender reference exists and is noticeably improved, but C5.2 Three.js runtime, actual browser evidence, full morphology coverage, green CI, exact Cloudflare SHA and owner approval are still absent. Keep PR #84 draft/unmerged. No C5.2 completion or release claim.


### Latest runtime verification: green corrective candidate (2026-11-15)

GitHub Verify [#43693876286](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43693876286) **passed** on C5.2 runtime-and-test commit `8b3074de944e8d1c807e46b0544f9d85cfbbc47a`: TypeScript, 69 test files / 384 tests, deterministic combat replays, production Vite build and compiled build identity all succeeded. This supersedes the earlier failed runs documented above; those historical failures remain useful for the debugging audit.

The accepted candidate **for engineering review, not owner visual signoff** preserves the original 6 mm source finger-envelope grip acceptance and the 24-iteration ceiling. It uses one fixed authoritative sword or staff, and both left/right source-neutral lead configurations pass joint reach, orientation, root invariance, fixed dimensions and deterministic reruns. A `whole-extreme` Studio pose is allowed only if the real source reach solution is safe, or rejected with an explicit unavailable result; both cases are positively verified.

Independent Blender [#43692889963](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43692889963) source-mesh pictures were inspected across front/side/three-quarter/closeup sword/staff and both leads. Their arms/one-shaft presentation improved materially relative to earlier rejected references, but finger penetration, staff elbow visual stiffness and guard clearance are not yet visually certified. The browser/C5.2 **exact feature-preview SHA** has not been independently checked and the desktop/mobile Chromium suite has not been executed on this latest runtime revision. Do not merge draft PR #84 until actual browser screenshots and owner review pass.


## Owner follow-up: morphology adaptation and collinear staff grip (2026-11-15)

The owner confirmed the **current neutral two-handed sword grip pose is visually acceptable**. The specific defects are (1) randomly generated characters and certain Studio poses being rejected as unreachable, and (2) a staff visibly piercing the hands despite numerical IK convergence. Do not change the approved sword stance or fake compliance by widening a hilt.

Implementation on this draft PR since feedback:
- Deterministic hand-relative alternative rigid weapon matrices, with the accepted nominal sword as the first candidate. Failed cases try other physically legal anatomical stance seeds, shared shoulder-reach projections, and bounded damped-least-squares FK refinement. Root and weapon dimensions remain invariant.
- Staff axes derived from both posed hand contacts and opposed knuckle directions, enforcing a stronger >0.85 knuckle/shaft dot on each hand. Reuse C5.1's unchanged real five-finger source-surface handle fitting helper for staff grip landmarks.
- Added tests/character-studio-two-hand-surface.test.ts sampling real CC0 MakeHuman source-skinned palm/thumb/digits against the staff cylinder, checking deterministic finite results and reporting height-morph reach and source-pose hand spans.
- Made heavy pinned Blender image CI manual-dispatch rather than repeated on every source iteration.

Verified intermediate CI runs including #43699663343 and #43700041303 passed 70 files and 388 tests, TypeScript, build and build identity. Both left/right neutral staff configurations and tested short/tall source-height configurations reach an aligned rigid shaft, while nominal source-neutral sword still uses the accepted unchanged candidate. These tests do NOT certify source skin collision-free grip.

Outstanding acceptance defects:
- Short/tall sword models still fail to reach the second hand. Source-sword ready stance opens the hands 0.740 m (short model) or 1.229 m (tall model) apart, against fixed grip spacing 0.149 m and 0.228 m. Numerically fitted lead hand does not solve the other arm; guarded alternative stances and DLS have not yet met the acceptance limit. Do not claim universal support.
- Actual staff surface measurements continue to report approximately 10–14 mm penetration into some palm and finger vertices despite satisfying numeric shaft/contact checks. Source-correct per-digit articulation and palm-surface clearance remain necessary.
- Latest Three.js desktop/mobile viewport images, exact Cloudflare deployed SHA, owner acceptance and strict all-generated-character morphological pass are NOT verified. Keep PR #84 DRAFT and unmerged. Do not begin C5.3.


## 2026-11-15 follow-up: persistent anatomy reach failure — NOT ACCEPTED

Owner confirms the existing two-handed sword and staff poses are now visually acceptable; **do not redesign those poses**. The remaining issue is coverage: equip can be rejected after generating certain morphologies or selecting a Studio pose.

Reproduced from the source-rig CI log [Verify #43700458463](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43700458463): both leading hands fail the two-handed **sword** for the source `macro/height=0` and `macro/height=1` cases. Default neutral and the tested hand-scale extremes pass; tested short/tall **staff** succeeds for both leads, which does **not** prove all generated staff/pose variations succeed. The source sword initial staged grip span is ~0.740 m (short) and ~1.229 m (tall), versus independent fixed grip separations ~0.149 m and ~0.228 m. Merely fitting the first hand leaves the offhand out of reach.

Corrective experiments on draft PR #84 included (a) equal-weight shared weapon centering, (b) a two-hand-span-derived fallback sword axis, (c) additional alternating rigid-weapon/arm IK refinement, and (d) widening DLS eligibility from 7cm to 12cm source reach error. Full CI ran on each. **None made both short and tall source sword cases reachable**. The coupled refinement increased compute cost without solving them and widened DLS generally traded one hand's residual for the other. All experimental solver changes were reverted to the original accepted source-backed candidate (`9712683`) rather than shipping a non-validated, slower solver.

**Release-blocking test correction:** `tests/character-studio-two-hand-surface.test.ts` previously asserted only finite errors in the short/tall morphology cases, so Verify could pass despite the owner-visible equip rejection. It now checks that **both weapons and both leading hands must be reachable** on each tested source morphology and records the failing distances/reasons. A red Verify is expected until the underlying two-arm grip convergence is resolved; do not waive, skip, loosen, or label that regression as passing.

Next implementation must solve the **coupled kinematic problem** at a physically achievable rigid weapon frame rather than iterating separately fitted hands against a frozen hilt. Preserve source FK limits, actual skinned contact, C5.1, root invariance, weapon dimensions and the owner-approved nominal stance; validate generated age/build/height/arm/hand combinations and all supported Studio poses, followed by real browser render review and exact-SHA deployment verification. PR #84 remains draft/unmerged.


## C5.2 final adaptation attempt — awaiting independent acceptance

Following owner confirmation that the **existing nominal sword and staff poses must not be redesigned**, the draft branch now includes a gated hand-relative fallback. The original nominal sword seed, articulation and historical contact proxy are left intact. Only when every existing candidate fails, the solver tries a deterministic paired-hand adjustment:

1. Restage one of the already authored FK guard poses; derive contact landmarks from actual posed source-skinned digits with the shared C5.1 `fitHandleCenter()` utility.
2. Fit one rigid shaft from both anatomically posed hands, preserving the authored shaft axis at the start and fitting only the rigid weapon center after each bounded IK pass.
3. Permit sword hand separation to vary among legal fractions of the **unchanged** hilt, and staff grip separation along the **unchanged** shaft; propagate the selected contact points to the visual descriptor and primary semantic socket attachment.
4. Retain calibrated `AnatomicalFK` joint limits and existing head, elbow, wrist/arm orientation and forearm clearance gates. Failure leaves the input pose restored; there is never a second weapon or a shifted/scaled character root.
5. Keep short/tall positive coverage mandatory, now additionally asserting one matching render descriptor, one collinear rigid weapon axis and a contact residual for successful cases.

**This is an experimental corrective commit, not a verified success.** The latest pre-fix run [#43704774159](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43704774159) had 386 passing tests and 2 failing morphology assertions; no pass claim is possible until the latest corrective SHA passes those tests and the full suite. The owner-required remaining gates are source-skinned digit/palm clearance (including staff), all supported random anatomy/Studio poses and both leads, deterministic replay, actual desktop/touch screenshots with human visual review, and independently matched Cloudflare preview build identity. Keep PR #84 in draft, unmerged; do not begin C5.3.


### Verification outcome and rollback (2026-11-15)

[Verify #43706077684](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43706077684) checked the hand-fitted, coupled-weapon fallback at SHA `d39fa29dc3e45de555304449a0508b594be21543`. TypeScript passed, but **2 mandatory morphology tests still failed** (386 pass, 2 fail). Both short and tall source models failed sword attachment for both leading hands, with the **same 155–186 mm supporting-hand reach errors** as the baseline. The experimental fallback increased suite runtime without establishing success, and was therefore **reverted** by commit `6481cb1195821a91e8d518a52e33ebd5cc0411cb` to preserve the visually approved existing pose and keep C5.1 intact. The strengthened positive test assertions remain and the failing acceptance gate is intentionally preserved. Neither screenshots nor a Cloudflare SHA verification was obtained for a successful fix. The C5.2 task remains open; PR #84 stays draft and must not be merged.


## C5.2 hand-relative adaptation — positive source-geometry validation (2026-11-15)

Owner-approved nominal sword and staff stance presets and C5.1 remain unchanged. The current branch extends the two-hand solver with a **gated relative-contact fallback** only when the previous nominal candidate is unreachable. It reuses C5.1's `fitHandleCenter()` on both actual posed hands, treats the weapon as one rigid shaft, optimizes the *relative* source-skinned hand contact vector under bounded source-FK anatomical freedoms, then obtains a single world-space weapon matrix from the fitted hand midpoint and source-knuckle axis. Candidate grip separations remain inside the existing fixed sword hilt/staff shaft; selected positions propagate into the semantic-socket attachment descriptor. Anatomy-aware collision clearance scales with source stature, resolving the adult-sized head/forearm thresholds that falsely rejected infant models.

**Validation evidence:** [Verify #43708920034](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43708920034) passed after the temporary browser workflow was removed, including TypeScript, 398 tests, deterministic combat replay, build and compiled identity. Mandatory new assertions cover both leads and both sword/staff on source-height extremes, infant, wide shoulders, long arms, asymmetric hands, compact muscular, tall slender, along with all supported Studio pose choices on the neutral source rig. Positive tests preserve unchanged weapon lengths, one socket-relative weapon, finite rigid shaft and preserved character root. Older passing-grip candidates still use the original approved poses.

**Rendered evidence:** A focused [desktop + touch browser run #43708515597](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43708515597) completed green at SHA `28518f8dc8dfe966a1b8cf41ac453f2ab3857a69`; 58 source-browser PNG images were captured. The neutral sword and staff close-ups were visually inspected. **The short/tall screenshots in this run inherited a hand-focused camera**, obscuring the character, so they are **not** useful morphology visual acceptance; the test was corrected to call Reset view before full-body morphology screenshots, requiring a new explicitly dispatched C5 Phase Acceptance run for latest-SHA visual review. The dedicated auto-triggered diagnostic browser workflow was removed to restore the repository's manual Chromium policy.

**Do not declare full C5.2 acceptance:** strict per-digit/palm source-skinned clearance, the historic staff penetration diagnostics, representative *random* generator seeds across all pose combinations, visual inspection of properly framed full-body morphology captures and independently verified Cloudflare deployed SHA remain unclosed. The fallback's numerical 23mm contact limit is not a proof of physically touching fingers. PR #84 remains draft/unmerged and C5.3 remains out of scope.


## Failure reproduction from a generated character (2026-11-15)

The solver already returned reach and collision diagnostics, but the production Studio previously swallowed them behind a generic unreachable-weapon message. This draft adds **failure-only browser reporting** without changing combat, posing, rig anatomy, or grip acceptance limits.

When a two-handed sword or staff fails to equip in Studio:
- A console `console.warn` entry begins `[Trilok Studio Grip Failure]`, followed by **one complete JSON string**.
- A **Copy grip issue details** button appears beneath the Studio preview. Clicking copies the same JSON, requiring no Developer Tools.
- JSON includes a schema/event identifier, exact bundle commit SHA/build ID, generator version and original numeric seed, full active versioned recipe (including manual edits after generation), selected Studio pose/equipment, solver reason, primary/secondary contact deltas and errors, axis alignment, clearance measurements, weapon dimensions and per-candidate IK diagnostics.
- Thrown fitting, pose, or rebuild exceptions are included as a name/message rather than disappearing. Successful equip clears the copy button. The last report is held only in this page session; nothing is uploaded, persisted or sent to a server.
- Generator seed alone cannot reproduce edited characters: retain the full recipe. The `reachDiagnostics[].seed` field is a *solver stance candidate index*, not the generator seed in `recipe.seed`.

**Reproduction workflow:** Open the exact feature build (check `build.commitSha`), generate a character, select the failed equipment/pose, click **Copy grip issue details**, and paste the JSON into the engineering thread. A developer can reconstruct the same deterministic morphology using the recipe and read individual IK candidates from the same report. Console warnings are emitted on failure only, avoiding high-volume logging during successful edits.

**Scope:** Diagnostics only. They do not claim every generated morphology reaches both hands or that source-skinned contact, deformation, or Cloudflare deployment has been visually accepted. PR #84 stays draft until separately approved.
