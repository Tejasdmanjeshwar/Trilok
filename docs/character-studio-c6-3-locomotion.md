# C6.3 — Grounded locomotion integration (engineering work in progress)

**Status:** Incomplete; this branch is NOT C6.3 acceptance and must not be merged as a finished phase.
Tracking: [#104](https://github.com/Tejasdmanjeshwar/Trilok/issues/104).
Baseline: `main` commit `89130350df0c05f38afe85a3ed2194b2ac93ef97` (PR #112 merged).
Production Cloudflare deployment is not authorized.

## Verified source inventory and rights gate

The pinned Quaternius UAL1 Standard archive (SHA-256 `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724`) is declared CC0 1.0 in its verified downloaded license. Its 43 clip names include `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`, and `Walk_Formal_Loop`, but **do not** contain explicit backward walk, strafe left/right or turn-left/right loops. The four C6.2 official JSONs, manifest, profile and source JSON remain untouched in this branch. No new motion asset, source import, calibration profile or license change has been created.

Other existing repository audits identified an ACCAD female BVH set with authored `Female1_B05_WalkBackwards`, `Female1_B09–B14_WalkTurn*`, `Female1_B01_StandToWalk`, `Female1_B02_WalkToStand`, and running transition recordings. **The ACCAD/Open Motion Project website explicitly publishes the motion data under CC BY 3.0 Unported** (https://accad.osu.edu/research/motion-lab/mocap-system-and-data). An exact-source licensing/attribution notice and complete rig/visual calibration must still be recorded before shipping any derived BVH clip. These recordings are NOT imported in this branch. Their 22-joint skeleton is distinct from the UAL1 65-weighted-joint skeleton and lacks finger articulation; reuse of the 49-joint UAL1 profile would be invalid. The inspected Kevin Iglesias packs have potentially incompatible animation redistribution terms and are likewise NOT shipping assets. Consult `docs/character-studio-c6-animation-source-audit.md`, `docs/character-studio-c6-2-source-fit-audit.md`, and `docs/character-studio-c6-2-free-medieval-rig-audit.md`.

On 2026-11-19 a temporary feature-branch source-probe workflow downloaded the official Female 1 ZIP and independently verified its pinned SHA-256. [Successful run #44530414394](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44530414394) inspected 22-joint BVH hierarchy, 30 Hz frame durations and actual motion curves for `Female1_B05_WalkBackwards` (347 frames), `B09_WalkTurnLeft90` (214), `B12_WalkTurnRight90` (234), `B01_StandToWalk` (188), `B02_WalkToStand` (166), `B03_Walk1` (230), and `C07_RunBackwards` (94). These clips are multi-second, generally non-looping trajectories with full-world-offset Hips and Z-X-Y Euler channels, **not** directly usable as short stride loops or interchangeable with UAL1. The one-shot workflow was subsequently deleted from the branch to prevent another obsolete sidebar entry. No performance/retarget validation is implied.

No fallback to reversed walking, rotating an existing forward gait as a strafe, mathematical sine waves or unsupported claims of directional quality is permitted. The mixer explicitly rejects unavailable directions.

## Work implemented on the branch

- `CanonicalLocomotionMixer` in `packages/character-core/src/locomotion.ts` is a canonical-C1, presentation-only gait mixer. It validates all clips with the existing canonical sampler, samples idle and forward gait clips using a common normalized gait phase, blends quaternions with hemisphere alignment, exposes explicit directional-clip registration and preserves a locked simulation root. It accepts an input intent but neither integrates velocity nor makes a movement decision.
- `GroundedFootContacts` reads the calibrated current semantic hip/knee/ankle/toe from the same skinned model and a caller-provided height surface, estimates low-speed stance, holds world-space ankle anchors, releases support over a bounded window, and uses four iterations of bounded joint-angle corrections. It records ankle-anchor slip, ankle-height penetration and unreachable contacts per evaluation. This is **preliminary** foot grounding; it lacks demonstrated legal joint-limit enforcement, sole-skin contact validation, and measured quality across morphology and full gait cycles.
- `StudioLocomotionPlayback` wires the mixer and foot pass into `StudioPosePreview.applyAnimationSamples`; it never mutates combat authority. The main Studio animation selector offers “Movement transitions” plus the four approved solo clips. The new pace slider selects idle/walk/jog/sprint blending. Static pose and existing playback controls remain.
- Regeneration discards playback and per-character foot anchors via the existing viewport lifecycle, recreating them on the new MakeHuman character. Equipment is restored upon leaving animation preview as in C6.2.
- Existing original clips and hashes are guarded by tests.

## Current technical limitations / mandatory unresolved work

1. Add **genuine authored** backward, left/right strafe, left/right turns and appropriate starts/stops, with legally distributable sources, independent bind validation, versioned source profile and deterministic baked artifact manifests.
2. Complete gait phase extraction from foot trajectories (a shared normalized time is not necessarily anatomically phase-aligned across different clips). Prove transitions across all legs and directional gaits.
3. Validate support contacts against **actual skinned soles**, not just approximate ankle/toe world positions; derive contact velocity in actor/world coordinates, including simulation-provided actor translation. Correct phase detection, uneven terrain support and physical support-release.
4. Replace provisional CCD with calibrated joint-angle bounds and verifiable knee plane/reach; add pelvis residual height and torso support shift that preserves authored style. No root-shift contact shortcut.
5. Measure actual end-effector slip, below-ground deformed mesh volume, CPU per evaluation, heap retention, morphology variance and contact after transition boundaries in real Chromium. Current metrics are data fields, **not collected production measurements**.
6. Verify responsive movement inputs with gameplay-authoritative displacement/heading, turning, collision and camera, without touching combat logic.
7. Run all CI, deterministic replay and morphology/C5 equipment integration assertions; inspect desktop/touch Chromium nominal, short, tall, muscular skins in front/side/rear/three-quarter views, and secure owner visual acceptance before merge.
8. Perform DRY/lifecycle/performance cleanup, record exact PR final head, verified CI, private preview build SHA and post-merge CI.

## Reproduction

```sh
pnpm install --frozen-lockfile
pnpm animation:verify
pnpm typecheck
pnpm test
pnpm build
node scripts/verify-build-identity.mjs
```

The new `tests/character-animation-c6-3.test.ts` checks hash identity, deterministic canonical gait mixture, direction rejection and root stability on the existing rig. These tests do **not** prove animation realism or final C6.3 acceptance.

## Authority policy

Animation root offsets are visual-only, with forward travel suppressed by the existing approved baker. Gameplay remains sole owner of actor position, velocity, collision and turn decisions. Studio has a zero-translation demonstration surface, not real navigation. This branch makes no modification to combat damage, projectiles, AI decisions or reaction windows. C6.4 weapon-aware moving contacts and C6.5 combat synchronization remain out of scope.
