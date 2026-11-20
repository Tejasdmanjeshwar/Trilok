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

## C6.3 recovery decision — rejected 100STYLE source (2026-11-20)

The owner rejected the 100STYLE Neutral locomotion experiment after repeated visibly incorrect arm, wrist and locomotion deformation. Its experimental Studio clips, calibration/manifest, acquisition workflow, per-pack scripts and review route are retired. The failure was a *source observability/calibration problem*, not an excuse to add per-clip rotations: the 23-joint BVH lacks independent palm/finger landmarks and skinned source bind information needed to certify forearm axial roll. The early numeric pose/skin diagnostics were not proof of rendered quality. Do not reinstate the experiment or repackage its results. Generic BVH parsing, full-frame quaternion transfer and anatomical observability utilities stay reusable. Historical research remains in PR #118 commit history.

## Kevin Iglesias Human Basic Motions FREE — verified intake and incomplete retarget (2026-11-20)

The exact owner's archives were **re-uploaded in the current engineering session**, and their bytes were verified locally. Regular `Human Basic Motions FREE.zip` has SHA-256 `063d5e1822f85549d14035ef342b1feae45bac37962499a8b478c7eb997200cd`; the Unity package has SHA-256 `dd5aaf1dfcb7cb907945190acbc6d34aa1be40d0ef38e7cf0cd86f2918d74339`. The ZIP includes all three exact requested FBX 7700 animation files, and a local bounded FBX binary-node inspection found 57 Model nodes (56 LimbNodes + 1 non-skeletal rig), 56 bind-pose nodes, 504 animation curves, 168 curve nodes and a single animation stack in each requested clip. The FBX reports Z-up and centimeter-scale units; the bind matrices place source .L geometry on +X and .R on -X. This verified **source metadata**, not a tested deformation or a completed animation bake.

Commit `35625ce4b9b7bca567bfb2b4965a8b343d5ff991` adds an asset-free, source-family mapping to the exact C1 target (49 mapped joints); the two third-thumb joints, B-root, B-spineProxy, B-jaw and two hand-prop anchors are explicitly source-only. It also adds isolated tests and a local `FBXLoader` source inspection script that requires the owner ZIP and verifies hash, hierarchy, original animation tracks and multiple timestamps. These are **initial integration tools** only. The script's use of Three.js is not a claim that its output has already passed FBX pre/post rotation, bind-matrix, or MakeHuman deformation validation. The original sources are not in GitHub.

**Legal distribution gate:** Unity's [Asset Store EULA](https://unity.com/legal/as-terms) permits appropriately embedded use in a larger game but restricts independent redistribution; [Unity's FAQ](https://assetstore.unity.com/browse/eula-faq) states that making an asset separately extractable or downloadable is not embedding. Character Studio's editable/exportable clip library and public browser-delivered JSON curves require explicit rights clarification, or a protected implementation not offering asset extraction. No Kevin originals or derived motion curves are committed or deployed. A private protected preview must not be mistaken for permission to redistribute them.

**Still outstanding:** Validate FBXLoader output against original FBX pose matrices and curve evaluation, source/target rest and full 3D anatomical frames, then calibrate the real MakeHuman target using the existing C6.2 retargeter. One immutable profile must produce accurate Idle01 / Walk01_Forward / Run01_Forward without clip-dependent fixes. Perform deterministic private baking, hash reproducibility, UAL1 regression checks, actual skinned-mesh rendering across four morphologies and desktop/touch tests. Only after an appropriate legal route for previews is documented should a SHA-verified interactive preview be published. PR #118 stays draft and unmerged; no owner acceptance or Cloudflare release has happened.
