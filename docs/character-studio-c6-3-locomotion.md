# C6.3 — Grounded locomotion integration (engineering work in progress)

**Status:** Incomplete; this branch is NOT C6.3 acceptance and must not be merged as a finished phase.
Tracking: [#104](https://github.com/Tejasdmanjeshwar/Trilok/issues/104).
Baseline: `main` commit `89130350df0c05f38afe85a3ed2194b2ac93ef97` (PR #112 merged).
Production Cloudflare deployment is not authorized.

## Verified source inventory and rights gate

The pinned Quaternius UAL1 Standard archive (SHA-256 `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724`) is declared CC0 1.0 in its verified downloaded license. Its 43 clip names include `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`, and `Walk_Formal_Loop`, but **do not** contain explicit backward walk, strafe left/right or turn-left/right loops. The four C6.2 official JSONs, manifest, profile and source JSON remain untouched. A separate **CC0 KayKit** directional source family has now been verified, extracted, calibrated, retargeted and reproducibly baked; it does not replace UAL1.

Other existing repository audits identified an ACCAD female BVH set with authored `Female1_B05_WalkBackwards`, `Female1_B09–B14_WalkTurn*`, `Female1_B01_StandToWalk`, `Female1_B02_WalkToStand`, and running transition recordings. **The ACCAD/Open Motion Project website explicitly publishes the motion data under CC BY 3.0 Unported** (https://accad.osu.edu/research/motion-lab/mocap-system-and-data). An exact-source licensing/attribution notice and complete rig/visual calibration must still be recorded before shipping any derived BVH clip. These recordings are NOT imported in this branch. Their 22-joint skeleton is distinct from the UAL1 65-weighted-joint skeleton and lacks finger articulation; reuse of the 49-joint UAL1 profile would be invalid. The inspected Kevin Iglesias packs have potentially incompatible animation redistribution terms and are likewise NOT shipping assets. Consult `docs/character-studio-c6-animation-source-audit.md`, `docs/character-studio-c6-2-source-fit-audit.md`, and `docs/character-studio-c6-2-free-medieval-rig-audit.md`.

On 2026-11-19 a temporary feature-branch source-probe workflow downloaded the official Female 1 ZIP and independently verified its pinned SHA-256. [Successful run #44530414394](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44530414394) inspected 22-joint BVH hierarchy, 30 Hz frame durations and actual motion curves for `Female1_B05_WalkBackwards` (347 frames), `B09_WalkTurnLeft90` (214), `B12_WalkTurnRight90` (234), `B01_StandToWalk` (188), `B02_WalkToStand` (166), `B03_Walk1` (230), and `C07_RunBackwards` (94). These clips are multi-second, generally non-looping trajectories with full-world-offset Hips and Z-X-Y Euler channels, **not** directly usable as short stride loops or interchangeable with UAL1. The one-shot workflow was subsequently deleted from the branch to prevent another obsolete sidebar entry. No performance/retarget validation is implied.

The KayKit [Adventurers pack](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) by Kay Lousberg is distributed under CC0 1.0 (`LICENSE.txt`). The commit-pinned `Knight.glb` at `672074b73ba276876a19e8816ecdc5241817ab47` has SHA-256 `60428e3abc09ba83e595d256e3af8c5c976b46cdae599f0802fc82b4a3445168`, with 76 authored clips and a 41-joint skinned source. The deterministic extractor selects exactly `Walking_Backwards` → `human-backward` (1.067 s), `Running_Strafe_Left` → `human-strafe-left` (0.8 s), and `Running_Strafe_Right` → `human-strafe-right` (0.8 s), maintaining their original authored motion samples. The separate `kaykit-profile.json` maps 18 physical joint chains and checks inverse skin bind correspondence (maximum matrix-element residual `0.00001142`). Its calibration hash is `d1709dcd564c2bc8f394183c29f160f5bba90308705e349aa3d63702244055f1`. The [verified source bake #44534003892](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44534003892) reproduced these three manifest SHA-256s: backward `536a00bd87817be1340a8dd61f38c96aefe80d15a408ce984c34c8a8afe85c08`, left `48fb6253e509bfa4e28631812e413b0b4725af9171ba60d39fb95f2725594f6f`, right `08fecea6484cedca5c763ef6db557926d08ab798357f319136db0b122fd93707`. These are **authored** source clips, but their current on-MakeHuman quality has NOT been visually accepted. The KayKit loop pose seam was measured as a unity quaternion dot; contact phase/alignment across UAL1 and KayKit remains unverified.

No fallback to reversed walking, rotating an existing forward gait as a strafe, mathematical sine waves or unsupported claims of directional quality is permitted. The mixer explicitly rejects unavailable directions.

## Work implemented on the branch

- `CanonicalLocomotionMixer` in `packages/character-core/src/locomotion.ts` is a canonical-C1, presentation-only gait mixer. It validates all clips with the existing canonical sampler, samples idle and forward gait clips using a common normalized gait phase, blends quaternions with hemisphere alignment, exposes explicit directional-clip registration and preserves a locked simulation root. It accepts an input intent but neither integrates velocity nor makes a movement decision.
- `GroundedFootContacts` reads the calibrated current semantic hip/knee/ankle/toe from the same skinned model and a caller-provided height surface, estimates low-speed stance, holds world-space ankle anchors, releases support over a bounded window, and uses four iterations of contact correction using only the existing C5 calibrated anatomical hip flexion/abduction and knee flexion freedoms (the current knee hinge is restricted to its C5 calibrated angle envelope). It records ankle-anchor slip, ankle-height penetration and unreachable contacts per evaluation. This is **preliminary** foot grounding; this has not passed deformed sole-skin contact validation, biomechanical knee inversion checks over complete cycles, or quantitative morphology measurements.
- `StudioLocomotionPlayback` wires the mixer and foot pass into `StudioPosePreview.applyAnimationSamples`; it never mutates combat authority. The existing Studio animation selector now has “Movement transitions,” the four approved solo clips and three additional CC0 directional solo clips. A direction selector controls forward/backward/left/right and the pace slider blends the authored forward idle/walk/jog/sprint bands; strafe uses authored running-strafe clips, not falsely labeled walk cycles. Static pose and existing playback controls remain.
- Regeneration discards playback and per-character foot anchors via the existing viewport lifecycle, recreating them on the new MakeHuman character. Equipment is restored upon leaving animation preview as in C6.2.
- Existing original clips and hashes are guarded by tests.

## Current technical limitations / mandatory unresolved work

1. Add **genuine authored** left/right turns and appropriate starts/stops. Backward and left/right strafe now exist in separately verified KayKit CC0 retargeted data, but require real rendered acceptance and cross-library contact-phase validation. The current strafe clips are authored RUNNING-strifes, not authored slow sideways walking.
2. Complete gait phase extraction from foot trajectories (a shared normalized time is not necessarily anatomically phase-aligned across different clips). Prove transitions across all legs and directional gaits.
3. Validate support contacts against **actual skinned soles**, not just approximate ankle/toe world positions; derive contact velocity in actor/world coordinates, including simulation-provided actor translation. Correct phase detection, uneven terrain support and physical support-release.
4. Verify the new C5-hinge-constrained contact correction with rendered knee planes and reachable targets; add calibrated pelvis residual height and torso support shift that preserves authored style. No root-shift contact shortcut.
5. Measure actual end-effector slip, below-ground deformed mesh volume, CPU per evaluation, heap retention, morphology variance and contact after transition boundaries in real Chromium. Current metrics are data fields, **not collected production measurements**.
6. Verify responsive movement inputs with gameplay-authoritative displacement/heading, turning, collision and camera, without touching combat logic.
7. Run all CI, deterministic replay and morphology/C5 equipment integration assertions; inspect desktop/touch Chromium nominal, short, tall, muscular skins in front/side/rear/three-quarter views, and secure owner visual acceptance before merge.
8. Perform DRY/lifecycle/performance cleanup, record exact PR final head, verified CI, private preview build SHA and post-merge CI.

## Reproduction

```sh
pnpm install --frozen-lockfile
pnpm animation:verify
node scripts/bake-c63-kaykit.mjs # verifies committed directional bytes
pnpm typecheck
pnpm test
pnpm build
node scripts/verify-build-identity.mjs
```

The new `tests/character-animation-c6-3.test.ts` checks hash identity, deterministic canonical gait mixture, source-backed backward/strafe registration, rejection of unsupported turns and root stability on the existing rig. These tests do **not** prove animation realism or final C6.3 acceptance.

## Authority policy

Animation root offsets are visual-only, with forward travel suppressed by the existing approved baker. Gameplay remains sole owner of actor position, velocity, collision and turn decisions. Studio has a zero-translation demonstration surface, not real navigation. This branch makes no modification to combat damage, projectiles, AI decisions or reaction windows. C6.4 weapon-aware moving contacts and C6.5 combat synchronization remain out of scope.


## C6.3 100STYLE Neutral three-motion anatomical gate (2026-11-19)

**Scope and review status:** This work stays on [PR #118](https://github.com/Tejasdmanjeshwar/Trilok/pull/118). The approved four UAL1/C6.2 clip assets remain the unmodified official library. The KayKit directional clips documented above are **unaccepted** and are not proof of anatomical fidelity; production promotion is blocked. Do not proceed to backward, strafe or transitions until the owner reviews the initial 100STYLE trio.

### Confirmed acquisition (not animation acceptance)

The publisher's [100STYLE dataset page](https://www.ianxmason.com/100style/) lists distinct BVH downloads and separate `Frame_Cuts.csv` under **CC BY 4.0**. Exact official Google Drive individual file URLs are resolved by `scripts/probe-c63-100style.py`; the offline CI probe uses pinned `gdown==5.2.0`, emits a temporary two-day artifact, and fails if any original bytes are missing or malformed.

| Source | Download bytes | SHA-256 | Frames | Frame duration |
| --- | ---: | --- | ---: | ---: |
| Neutral_ID.bvh | 1,465,227 | `71aead2e3246bdb47a5b839cb3e60e0574e9a1a046c071cc147e2922a35f259f` | 2,103 | 0.016667 s |
| Neutral_FW.bvh | 5,504,825 | `2f28800baa299547c42c257d1c926172542a1e69b46a3d3e6aa0aded0e9b40f6` | 7,896 | 0.016667 s |
| Neutral_FR.bvh | 3,262,894 | `f46ca526027a3654c8939a0123413f6008906fb32125d5e885eafcaa830831cb` | 4,625 | 0.016667 s |
| Frame_Cuts.csv | 10,036 | `e3c1d2beab6486e083622cef6a5402fe9b20edc75a9963ea30675c67ec29ee82` | N/A | N/A |

Source verification: [GitHub Actions #44563324901](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44563324901). The original BVHs are a temporary workflow artifact **not committed** to the repository or browser application. This proves transfer and identity of the retrieved files, not calibrated motion quality.

Observed BVH skeleton: **23 named joints**, plus end-site segments consistent with the publisher's 28-bone description; `Hips` → four `Chest*` joints → `Neck`/`Head`, paired `Collar` → `Shoulder` → `Elbow` → `Wrist`, and paired `Hip` → `Knee` → `Ankle` → `Toe`. Source root has X/Y/Z position channels followed by **Yrotation, Xrotation, Zrotation**. Other measured joints also use **Y-X-Z** Euler channels. The *actual* per-joint channel declaration—not a generic XYZ assumption—must drive quaternion conversion. The three sources have matching named-joint lists. There are no captured finger joints; do not invent finger motion.

The Neutral row in `Frame_Cuts.csv` is `["Neutral", "338", "5481", "380", "8235", "357", "4227", "327", "7445", "655", "1555", "340", "3066", "354", "5730", "304", "6775", "N/A", "N/A", "N/A", "N/A"]`. The header has now been verified as `STYLE_NAME, BR_START, BR_STOP, BW_START, BW_STOP, FR_START, FR_STOP, FW_START, FW_STOP, ID_START, ID_STOP, SR_START, SR_STOP, SW_START, SW_STOP, TR1_START, TR1_STOP, TR2_START, TR2_STOP, TR3_START, TR3_STOP`. Therefore source-recorded usable ranges are **ID 655–1555**, **FW 327–7445**, **FR 357–4227** (subject to final 0/1 index-base and pose-timing checks). The source probe validates these are inside their respective clip bounds. These are capture-region bounds, **not automatically seamless loops**.

### Implemented, unaccepted tooling

- `packages/character-core/src/bvh.ts`: renderer-free strict BVH hierarchy/end-site parser, actual per-joint Euler channel order conversion, explicit frame duration and source-native root translation distinct from static offset. Invalid values, unsupported channels, duplicate names and inconsistent frame data throw errors. Coordinate normalization and target-frame interpretation are intentionally deferred rather than guessed.
- `tests/character-bvh-c6-3.test.ts`: synthetic parsing, hierarchy, end-site, order-of-rotation, trajectory and invalid-data regressions. Verify green status against latest PR head before considering this complete.
- `scripts/probe-c63-100style.py` and `.github/workflows/c63-100style-source-acquisition.yml`: source-only acquisition with hashes, independent from runtime and existing UAL1 bytes.
- The official publication and CC BY 4.0 attribution are recorded in `THIRD_PARTY_NOTICES.md`.

### Acceptance gates still outstanding (do not report as passed)

1. Verify the publisher frame-cut index base against actual capture T-pose boundaries; identify foot-contact cycles and physically plausible short loop candidates while retaining full source-world trajectories.
2. Independently reconstruct a physically verified 100STYLE anatomical reference pose (without treating the first motion frame as a bind pose), source axis/scale and bilateral bend-plane/twist orientations.
3. Create and persist **one** versioned source-to-MakeHuman calibration through `createRetargetProfile()` and `retargetWorldPose()`; use it unchanged for Idle, Walk and Run, with no per-clip Euler patches.
4. Produce deterministic canonical clips and SHA manifest without modifying any UAL1/C6.2 bytes; confirm source and target bone-direction/angle residuals at identical timestamps and explicit numeric acceptance thresholds.
5. Make a gated **source skeleton versus real skinned MakeHuman** visual comparison in Character Studio; inspect all four angles, frame stepping, default/short/tall/muscular, extremity deformation and grounding **without IK masking**.
6. Run Chromium desktop/touch tests and relevant CI. Publish Netlify draft **only** from the exact passing PR Verify artifact via the main-branch workflow. Verify the build SHA separately, and obtain owner visual review before further C6.3 additions or merge.

The current 100STYLE source is promising because it includes coherent multiple locomotion directions captured on one human skeleton, but **its suitability for Trilok remains unproven** until gates 2–5 are completed. A valid BVH file or a green SHA checksum is not proof of physical rig alignment.


### Actual recorded reference-pose investigation (source-side only)

The typed offline BVH/FK inspector reproduced all three official motion files under one identical 23-joint structure fingerprint: `6e04c8293605f3e1d3f2599141922ffc9872c07f7339f97422fa2e56de9db4d9`. The successful [source-family inspection #44566158596](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44566158596) measured 7 source-pose landmarks and searched the **pre-cut** frames for bilateral horizontal arm extension rather than treating an arbitrary motion frame as the rest pose.

| Recording | Best pre-cut T-like candidate | Minimum signed upper/forearm lateral alignment |
| --- | ---: | ---: |
| Neutral_ID | Frame 282 | 0.967630 |
| Neutral_FW | Frame 195 | 0.967050 |
| Neutral_FR | Frame 192 | 0.973835 |

This demonstrates genuine T-like extension in the captured setup regions of the three recordings, absent at frame zero or in the trimmed Idle segment. **The candidate search is evidence, not independently confirmed skinned bind matrices.** Only a single family-level reference may be calibrated after checking candidate consistency, joint bend planes, joint-space twist, facing and handedness. No clip-specific calibration is allowed.

At official Idle cut start, the source pelvis-to-upper-spine points approximately up and the two arms hang downward, while the signed source-body facing estimate is roughly toward **negative Z** (`[-0.15, -0.03, -0.99]` in source-world coordinates). The target C1 contract is **positive Z forward**. A full rig-family coordinate-frame conversion is required; this is precisely the kind of 180-degree facing mismatch that the rejected KayKit conversion did not adequately validate. The source knee/hip separation is about **21.491498 source units** across files, strongly suggesting centimeter-scale data; neither meters conversion nor source-facing normalization is yet certified by a target-side physical measurement.

The source data can now be inspected repeatably without replacing approved UAL1 motion. **No 100STYLE-to-MakeHuman profile or retargeted clip has yet been certified**, and no source/target angular or skinned-morph visual quality acceptance should be inferred from these observations.

The rejected KayKit direction clips remain retained for regression and explicitly opt-in research (`?c63-kaykit-review`) but are no longer selectable in normal Character Studio. Default Studio animation choices remain the four approved UAL1 clips and their forward-only transition preview.


### 100STYLE real-target diagnostic and experimental bake (unaccepted)

The branch now includes \`scripts/calibrate-c63-100style.mjs\` and invokes it **after** official SHA-pinned BVH acquisition and typed source FK in the existing \`c63-100style-source-acquisition.yml\` workflow. This is an offline diagnostic; none of the experimental output is shipped to Character Studio or replaces the approved four UAL1 clips.

The diagnostic loads the actual canonical MakeHuman OBJ/MH skeleton, invokes the same C5 rig calibration and \`createHumanRestDescriptor()\` used by the existing C6.2 baker, then constructs **one** C6.2 \`createRetargetProfile()\` for 100STYLE Neutral ID/FW/FR. Its declared correspondence covers pelvis, upper spine, chest, neck, head and paired collar/shoulder/elbow/wrist/hip/knee/ankle/toe (21 mapped C1 joints), leaving source-unrecorded fingers in inherited rest. For all three motions the anatomical baseline is recorded pre-cut Neutral_ID frame 282; additional recorded T-like poses on the other two recordings are separately compared for directional consistency. The source's signed bilateral hip direction and up axis establish an explicit frame conversion, not a guessed independent 180° patch per clip. A measured source/target hip-span ratio provides the source unit scale, and the complete three-file source hierarchy must match exactly. **BVH does not contain skinned inverse bind matrices; the T-like reference, wrist twist, and bend planes remain hypotheses until visually confirmed.**

The emitted diagnostic contains the family/target SHA, coordinate correction, scale, measured T-pose consistency, and detailed source-vs-target bone direction residuals for five distinct time samples per motion, including worst segment names. This is a physical joint-link comparison rather than checking only unit quaternions. An excessive T-pose mismatch (25°) or sampled p95 source-target deviation (50°) blocks promotion/baking, but passing those preliminary gates alone does not prove the rig or animation has production quality.

On successful calibration the same diagnostic also attempts an **experimental, non-promoted** deterministic three-clip bake. Its loop window candidates come exclusively from original published frame cuts, never reversed/synthesized gait curves. It preserves the authored joint quaternion samples, converts original root height to visual-only bob while suppressing double-applied actor travel, records both source and retarget loop seam residuals, and enforces explicit 35° maximum angular/3.5 cm vertical seam limits and the canonical 8192-key budget. The workflow stores temporary \`100style-shared-profile.json\`, \`100style-target-reference.json\`, \`100style-calibration-report.json\`, \`100style-experimental-manifest.json\` and three source-backed \`human-100style-neutral-*.clip.json\` files in its **two-day CI artifact**, not the game bundle. The artifact is retained even when calibration fails so numerical evidence remains inspectable.

**Verification status:** This is code submitted to existing draft PR #118, **not yet an accepted or reviewed render**. Before declaring it working, inspect the new workflow logs, fix failed diagnostic gates using anatomical evidence, confirm deterministic regeneration and source/target visuals in Chromium, test default/short/tall/muscular MakeHuman meshes at multiple angles and assess feet and wrists, then publish a verified-SHA Netlify preview for owner approval. No C6.3 merge or Cloudflare deployment is authorized.
