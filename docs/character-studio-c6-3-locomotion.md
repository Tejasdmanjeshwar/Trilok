> **Gameplay locomotion bridge (2026-11-21, engineering PR):** A pure `LocomotionMovementSnapshot` converts observed world displacement and actor facing to canonical local `LocomotionIntent`. `CombatMovementController.locomotionIntent` exposes this after presentation movement, and `AnimatedWarrior` consumes it in the *existing legacy proxy gait layer* without altering root movement, reach, damage or defense timelines. This is necessary incremental integration, **NOT complete canonical Gameplay Lab animation integration**: the combat proxy is not the shared C5 MakeHuman skinned rig, has no ankles/toes or canonical source clip playback, and cannot claim grounded geometric feet or pelvis support. Retaining this limitation is mandatory until Gameplay Lab consumes the same canonical skeleton, FK, Kevin mixer and grounding correction as Studio. No production deployment, merge or phase acceptance is asserted by this note.

> **Owner acceptance / next engineering boundary (2026-11-21):** The 27 approved Kevin clips (original three + 24 PR #123 directional review clips) have passed the owner's Step 1 visual selection review. Do not redo selection/import. Steps 2–5 remain: directional locomotion and transitions; skinned-sole contact and pelvis balance; gameplay-authoritative movement; regressions, profiling, Chromium evidence and preview. The browser remains the active target under the [future Unity portability ADR](architecture-browser-first-unity-portability.md), not a disposable Unity placeholder. This acceptance does not assert blend/IK/morphology acceptance.

# C6.3 — Grounded locomotion integration (engineering work in progress)

**Status:** Incomplete; this branch is NOT C6.3 acceptance and must not be merged as a finished phase.
Tracking: [#104](https://github.com/Tejasdmanjeshwar/Trilok/issues/104).
Baseline: `main` commit `89130350df0c05f38afe85a3ed2194b2ac93ef97` (PR #112 merged).
Production Cloudflare deployment is not authorized.

## Verified source inventory and rights gate

The pinned Quaternius UAL1 Standard archive (SHA-256 `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724`) is declared CC0 1.0 in its verified downloaded license. Its 43 clip names include `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`, and `Walk_Formal_Loop`, but **do not** contain explicit backward walk, strafe left/right or turn-left/right loops. The four C6.2 official JSONs, manifest, profile and source JSON remain untouched. A separate **CC0 KayKit** directional source family has now been verified, extracted, calibrated, retargeted and reproducibly baked; it does not replace UAL1.

Other existing repository audits identified an ACCAD female BVH set with authored `Female1_B05_WalkBackwards`, `Female1_B09–B14_WalkTurn*`, `Female1_B01_StandToWalk`, `Female1_B02_WalkToStand`, and running transition recordings. **The ACCAD/Open Motion Project website explicitly publishes the motion data under CC BY 3.0 Unported** (https://accad.osu.edu/research/motion-lab/mocap-system-and-data). An exact-source licensing/attribution notice and complete rig/visual calibration must still be recorded before shipping any derived BVH clip. These recordings are NOT imported in this branch. Their 22-joint skeleton is distinct from the UAL1 65-weighted-joint skeleton and lacks finger articulation; reuse of the 49-joint UAL1 profile would be invalid. The Kevin Iglesias Basic Motions source family has an offline developer-time baker; game-native output still requires verified baking and rendered acceptance. Consult `docs/character-studio-c6-animation-source-audit.md`, `docs/character-studio-c6-2-source-fit-audit.md`, and `docs/character-studio-c6-2-free-medieval-rig-audit.md`.

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

Commit `35625ce4b9b7bca567bfb2b4965a8b343d5ff991` adds an asset-free, source-family mapping to the exact C1 target (49 mapped joints); the two third-thumb joints, B-root, B-spineProxy, B-jaw and two hand-prop anchors are explicitly source-only. It also adds isolated tests, a local `FBXLoader` source inspection script and `scripts/bake-c63-kevin-private.mjs`: the latter reuses the C6.2 retargeter and the same source-family profile for all three clips, records actual source keys and loop seams without endpoint replacement, validates canonical output, and writes only under ignored `assets/animations/private/`. **The private bake command has not been executed in an environment with the repository dependencies and MakeHuman source fixture, so its correctness is unverified.** These are **initial integration tools** only. The script's use of Three.js is not a claim that its output has already passed FBX pre/post rotation, bind-matrix, or MakeHuman deformation validation. The original sources are not in GitHub. Subsequent audit of the exact user-provided male model found 52 genuine skin clusters and proved **identical raw PoseNode matrices for all 55 common bones** across the male model and all three animation FBXs (zero reported matrix-element difference, before Three.js import). The FBXLoader offline scripts now explicitly normalize Z-up centimeters to C1 Y-up meters, restore source bone naming, verify the skinned male model bind data, and preserve presentation-only pelvis sway without authoritative forward travel. These source checks still require execution with pinned npm dependencies in the repository CI/private environment.

**Legal distribution gate:** Unity's [Asset Store EULA](https://unity.com/legal/as-terms) permits appropriately embedded use in a larger game but restricts independent redistribution; [Unity's FAQ](https://assetstore.unity.com/browse/eula-faq) states that making an asset separately extractable or downloadable is not embedding. Character Studio's editable/exportable clip library and public browser-delivered JSON curves require explicit rights clarification, or a protected implementation not offering asset extraction. No Kevin originals or derived motion curves are committed or deployed. A private protected preview must not be mistaken for permission to redistribute them.

**Still outstanding:** Validate FBXLoader output against original FBX pose matrices and curve evaluation, source/target rest and full 3D anatomical frames, then calibrate the real MakeHuman target using the existing C6.2 retargeter. One immutable profile must produce accurate Idle01 / Walk01_Forward / Run01_Forward without clip-dependent fixes. Perform deterministic private baking, hash reproducibility, UAL1 regression checks, actual skinned-mesh rendering across four morphologies and desktop/touch tests. Only after an appropriate legal route for previews is documented should a SHA-verified interactive preview be published. PR #118 stays draft and unmerged; no owner acceptance or Cloudflare release has happened.

## Independent regular-FBX source pose evidence (2026-11-20)

A separate, bounded, private FBX 7700 binary-tree evaluator parsed **the user's actual ZIP**, independently of Three.js, using signed FBX `PoseNode` matrices, model hierarchy and default *extrinsic XYZ* rotation order. The original male FBX model includes 52 skin clusters; all 55 model bones have exactly equal `PoseNode` numeric arrays in all three clips. The extra animation-only node is `B-spineProxy`. The 56-bone regular-FBX male bind-pose fingerprint (sorted bone name + all 16 bind-matrix elements rounded to six decimals, compact JSON SHA-256) is **`8e114f8d88ff54d61d3f8b9c519227b0d7906aac7560a8e75f1ce2099b5ec025`** for each of the three clips. Independent rest-local reconstruction differs from the source FBX bind record by at most `0.0001761` in raw matrix elements, consistent with rounded source-bind values. These observations do not establish compatibility with MakeHuman skinning by themselves.

| Exact male FBX | Original FBX SHA-256 | Source 30 Hz frames | Duration | Max measured source orientation seam |
| --- | --- | ---: | ---: | ---: |
| `HumanM@Idle01.fbx` | `39ccd21d52c157ea2c75096ce9b717271880f0300da4e7d010a272d9f731b9be` | 82 | 2.7 s | 0° |
| `HumanM@Walk01_Forward.fbx` | `80e14453a1d725a2b4d17c54757d5f8ef038105309c1c95ec2647f5e07c434f5` | 25 | 0.8 s | <0.001° |
| `HumanM@Run01_Forward.fbx` | `e7de08077e783d1f79975daed8b21e26c28e2e3041d6b1d8992ebdc13ad5841b` | 19 | 0.6 s | <0.001° |

These source-only seams are measured from world rotations of the original FBX skeleton at first/last authored keys, not guessed from visual appearance. The source contains actual coherent shoulder, wrist, finger and pelvis movement, but retargeted motion and MakeHuman deformation **have not yet been certified**. Source keyframe content is retained only in the owner's private ZIP and never in this document or GitHub artifacts.

The revised private baker uses the existing `retargetWorldPose` and `createHumanRestDescriptor` to create **one deeply frozen calibration profile**; it samples all three clips without bone-specific offsets. It additionally loads pinned official MakeHuman OBJ, .mhskel and .mhw weights through `bindTemplateToSemanticRig`, then uses the production `AnatomicalFK.applyRestDeltas` and `HumanPoseCorrectives` to measure finite real-skinned vertices for multiple timestamps. This procedure has been committed but **has not been executed end-to-end**, and measurements alone are not browser-quality or owner acceptance. Browser preview remains blocked pending source redistribution/export permissions and private build execution.

## C6.3 local-only Kevin motion preview (2026-11-20)

**Why local import rather than embedded JSON:** The original Human Basic Motions FREE ZIP and its derived motion curves are distributed under the publisher's license and should not be served as extractable resources on an open Netlify preview. A client-side, user-provided source import allows the owner to evaluate the real clips without placing their licensed data in Git history, remote CI artifacts, local storage, analytics, or an HTTP upload. The experimental importer is not reachable from the normal Studio selector; it is opt-in with `/studio?c63-kevin-local-review`.

**Workflow:** Open a verified, exact-SHA Netlify development draft; navigate to `/studio?c63-kevin-local-review`; switch to the Pose tab; choose the *regular* `Human Basic Motions FREE.zip` (SHA-256 `063d5e1822f85549d14035ef342b1feae45bac37962499a8b478c7eb997200cd`) using the local file control. The code verifies the whole archive, decompresses only three explicitly requested male animation FBXs in memory, validates the common 56-bone rest rig and creates **one** immutable profile against the currently rendered MakeHuman C1 bones. It bakes canonical `AnimationClipV1` data in memory and registers Idle01 (2.7 s), Walk01_Forward (0.8 s) and Run01_Forward (0.6 s) as experimental playback options, leaving UAL1 untouched. Source pose/loop and 49-joint mapping checks are numerical, not a substitute for owner anatomical review.

**Extensibility:** `retargetOwnedKevinAnimations(file, graph, targetBones, selectedClips)` accepts any explicitly named/identified collection of 1–12 male FBX 7700 clips from this **exact archive**, provided they share the same bind/rest hierarchy. A single source-map and profile is created and reused per batch; additional clips require no hardcoded joint fixes. The same selected clips are re-calibrated against a newly generated MakeHuman body before playback. Other Kevin packs, Unity FBX 7300, female variants or distinct bind profiles must be independently normalized and qualified; the male profile must never be silently reused with an incompatible rig.

**Security:** No original or derived Kevin motion assets are imported as static Vite modules, committed, uploaded to Netlify, cached in a service worker, or written into browser persistent storage. User-provided file bytes are scoped to the current tab. The importer validates the exact whole-archive SHA, central-directory bounds, paths, FBX versions, uncompressed-size limits, CRC32 and duplicated entries. Decompression is bounded, with a 32 MB archive cap and 8 MB per-FBX cap. The animation importer uses existing `FBXLoader`, `createHumanRestDescriptor`, `createRetargetProfile`, `retargetWorldPose`, canonical clip validation and existing Studio playback, FK and skinned-mesh presentation.

**Critical unverified requirements:** The local FBXLoader import and the resulting MakeHuman deformations have not been observed running in Chromium with the actual user ZIP. The private offline bake still lacks a complete, executable source-plus-dependency environment. Full desktop/touch motion, source-to-target wrist/shoulder/leg orientation parity, longitudinal limb skin compression, foot-contact slip and morphology-rendered comparisons remain open. A browser-only implementation does not itself establish legal clearance for user-exported clips. There is no committed Kevin output profile/clip hash to certify, intentionally.

**Deployment:** The existing `.github/workflows/netlify-development-preview.yml` requires trusted `workflow_dispatch` on main and consumes the successful exact PR-source-SHA Verify artifact. The current GitHub connector can inspect workflow runs and PRs, but does **not** expose `workflow_dispatch` or protected Netlify environment credentials. Consequently the draft preview cannot be initiated through that connection. Do not invent/recycle a draft URL; trigger the workflow for PR #118 only after the final Verify succeeds and separately record the source SHA, synthetic build SHA and returned Netlify draft URL. Do not deploy these unaccepted changes to Cloudflare production or merge before owner render approval.

## Full regular-ZIP male source-family bind audit (2026-11-20)

An independent, private read of **all 58 male animation FBX 7700 files** in the owner's exact verified archive established source-family reuse beyond the initial three. Every male file had exactly **56 LimbNodes** and **56 PoseNode bind transforms**, with no missing or malformed PoseNode matrices. The normalized bind fingerprint was identical for **all 58/58**:

`03c1f72634a3f0edaf1468b73288163648d0228ac3fe1780b556b263564e2f84`

Reproduction method: parse the FBX 7700 binary node tree; index every `Model` numeric identifier by its `Model::<name>` string; read `Pose/PoseNode/{Node,Matrix}`; pair each matrix with the **stable bone name** rather than the file-local numeric ID; round each of the 16 elements to six decimals; sort by bone name, and SHA-256 the Python representation of the resulting list of pairs. The original numeric Model/PoseNode IDs differ between files, so hashing raw IDs would incorrectly produce 58 independent fingerprints. Only metadata/fingerprint counts are recorded, not asset curve data. This verification covers the **male regular FBX 7700** set, not the Unity FBX 7300 variant or female rest.

This is strong evidence that a **single source-family male rest/calibration profile** can be reused on all compatible 58 clips, subject to the same importer and target-rest verification, canonical key-budget limits, and per-clip *source-motion quality* checks. It does **not** prove every clip has the same movement style, loop policy, grounded contacts or skinning quality. The library's `retargetOwnedKevinAnimations` accepts arbitrary explicit 1–12 male clip selections from this verified archive, so new clips do not require clip-specific mapping or orientation heuristics. Other Kevin libraries must be independently checked for source family identity before reusing that profile.

## C6.3 Kevin integration recovery — 2026-11-20

The experimental player-facing ZIP-import control and the browser-local FBX loader have been removed. Character Studio uses only build-bundled canonical resources, selected automatically from the normal animation selector when their baked files exist. No player supplies FBX, Unity packages, or archives. Original FBX files stay as developer inputs; the game-native `AnimationClipV1` resources are intended to be version-controlled in `assets/animations/studio-v1/kevin/`.

The retained offline baker `scripts/bake-c63-kevin.mjs` uses the regular Human Basic Motions FREE FBX ZIP, verifies its pinned archive hash and 58-file male inventory, checks shared rest-pose compatibility, validates the male source model skin bind, and calibrates one Kevin→C1/MakeHuman 49-joint source-family profile. It samples actual FBX curves and canonicalizes through the existing retargeter. It does not introduce per-animation bone offsets. Output clip IDs, source paths and root-motion policy are in `assets/animations/sources/kevin-basic-motions-v1.json`. The default bake selects Idle, Walk and Run; `--all` opts into 58 source clips.

```bash
pnpm install --frozen-lockfile
node scripts/fetch-makehuman-core.mjs
pnpm animation:bake:kevin --archive "/path/Human Basic Motions FREE.zip" --write
pnpm animation:bake:kevin --archive "/path/Human Basic Motions FREE.zip"
```

The command without `--write` verifies all generated bytes against the committed resources. The full bake also performs numerical MakeHuman skin sampling, which **does not replace** actual rendered and owner-reviewed animation fidelity. A source-family topology audit is likewise not proof that all 58 clips have been rendered, that every pose is valid, or that loop seams are acceptable.

**Unresolved:** No verified canonical Kevin clip resources have yet been produced and committed, and no Chromium screenshots, morphology coverage, successful tests, exact-SHA Netlify URL or owner acceptance are claimed here. The four approved C6.2 UAL1 clips remain independent. No merge or Cloudflare production deploy is authorized.


## C6.3 Kevin root-trajectory isolation (2026-11-20; owner acceptance pending)

The full 58-male-FBX source-family audit found its first bounded-FK failure
in `Animations/Male/Movement/Jump/HumanM@Jump01 - Begin.fbx`
at 0.35 s. The actual source world-space `B-hips` moved
`[+0.003339999914, +0.400113472089, +0.096218983828]` metres relative
to the first key, whereas `B-root` remained `[0,0,0]`. These values were
measured by the SHA-pinned developer archive CI, not inferred from filenames.
The previous bake discarded source Z travel and misrepresented source hip
vertical travel as an unrestricted local pelvis FK translation. The latter
properly fails the existing ±0.25-m presentation safety guard.

The canonical `AnimationClipV1` accepts an **optional** `rootTrajectory`
resource without changing the V1 version or reserializing previously
approved UAL1 resources. It contains sampled times in seconds, full XYZ
metres relative to `B-hips` at the first source key, and source hip world
orientation deltas, as unit XYZW quaternions relative to the first key.
Coordinate convention is the existing C1 right-handed Y-up, +Z-forward,
metres/seconds; source FBX is first rotated from Z-up and converted from
centimetres. Source `B-root` is independently inspected and remains a
different concept from the animated hips; it must not be mistaken for the
whole actor trajectory.

The trajectory is **reference-only**: source hip rotation already contributes
to the mapped pose rotation, so its orientation must not be applied again.
Canonical pose sampling ignores the trajectory; `sampleAnimationRootTrajectory`
returns an interpolated standalone reference and does not mutate character,
world position, collision, or combat. The ordinary Studio FK ±0.25-m root
presentation guard remains unchanged. All 58 review candidates, when baked
with `--all`, carry separate trajectory metadata rather than feeding hip
travel into FK; validation rejects clips with simultaneous root-pose
translation and a root trajectory to avoid duplicate ownership.
The existing three normal-mode Kevin resources deliberately remain
byte-for-byte unchanged, pending owner approval.

The full-inventory batch conservatively records `one_shot` semantics
rather than fabricating a motion seam for travelling, jumping, falling or
transition clips. Further authored loop/transition metadata must be approved
per source family; continuous travel across loops, pose-relative pelvis
bobbing separated from source travel, automatic foot-grounding, authored
orientation consumption, and visual quality across body morphologies remain
**unproven**. In particular, the original source records the combined hip
motion; this first boundary correction does not purport to recover a
physically unique world-travel vs local-bob decomposition from that one
track. No travelling trajectory is a gameplay movement command. Any future
root-motion consumer needs explicit deterministic simulation validation,
collision legality and cycle accumulation; directly moving render roots
would violate the authority model.

The initial three Kevin clips are build-time bundled, require no player ZIP
or FBX import, and remain review candidates rather than accepted visuals.
The 58-clip library is an **offline compatibility validation**, not a
public Character Studio menu. No 100STYLE source has been restored.

## Kevin C6.3 directional review intake (2026-11-21)

Recovered and verified the owner's original SHA-pinned FBX ZIP locally.
Exactly 24 additional **non-RM** male clips were selected: 3 idle
transitions/alternates, 7 walks, 7 runs, 5 sprints and 2 turns.
The original Kevin Idle/Walk/Run baked bytes and hashes remain unchanged.
Developer-only `--c63` batch mode deterministically writes 24 clips
under `assets/animations/studio-v1/kevin/c63/` with the same immutable
source-to-C1 49-joint profile; it stores source hip root trajectories as
reference-only and distinguishes `loop`, `transition`, `one_shot`.

The review is opt-in at `/studio/?c63-kevin-review`; a separate
code-split chunk is loaded only for that route. Its selector uses the
existing canonical pose, FK, corrected MakeHuman shoulder surface, and
Studio camera/timeline controls. No user source ZIP upload is required.
The added clips are deliberately NOT normal-playback approvals.
Source animations, especially turn final headings and ground contacts,
require actual rendered desktop/touch and morphology inspection before
promoting to the gameplay mixer. Jump/fall/social and RM duplicates are
deferred. No production deployment or C6.3 phase acceptance is implied.

### Exact generated C6.3 review assets — source-bake verification

The [authoritative source bake #44803665646](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44803665646)
succeeded on the owner's pinned 58-male-file source subset. The worker
regenerated **24 additional** source-backed canonical motion resources
under `kevin/c63`, then successfully re-baked and compared exact bytes.
The workflow passed **120 test files**, TypeScript and Vite build.
Asset commit `98fb906959ed762706e5e2ac8dff369c8b16d7dd`.
All original Kevin 3-clip output/manifest bytes were independently verified
unchanged. The new 24-clip payload is approximately 4.54 MB of canonical
JSON before compression, and is opt-in/code-split.

The first new CI test caught an incorrect fallback that labelled the
idle transitions and turns as loops. This was fixed in the shared baker,
not by modifying animation curves or relaxing the new assertions. The
committed results have `transition` for Idle01→Idle02 and Idle02→Idle01,
and `one_shot` for Turn01_Left and Turn01_Right. The metadata
classifications are evidence-backed source-family decisions; they do not
establish that whole-body turning produces acceptable visuals or that
some other loop seams (including backward running) are production-ready.

**Final exact-head PR Verify and real Chromium visual acceptance remain
separate gates.** The automatic PR Verify run initiated by the workflow's
GitHub bot push required external approval; this owner-authored
documentation commit will trigger a new reviewable exact-HEAD Verify.


## Step 2 implementation branch — authored directional mixer (2026-11-21)

Branch `feat/c6-3-directional-locomotion` adds source-backed eight-direction
vector resolution, explicit walk/jog/sprint coverage metadata in
`assets/animations/studio-v1/kevin/c63/locomotion-map.json`, and nonlooping
turn-left/turn-right execution. It does not change the original 27 motion
resources, retarget calibration, source hashes, or C1 rig. The 19 additional
loop categories cover seven walk directions, seven run directions and five
sprint directions. Forward idle/walk/jog use the existing Kevin clips.
The two one-shot turn clips use their own clamped seconds rather than the
periodic gait phase.

**Known gaps (not C6.3 acceptance):** all 27 clips are registered for individual
review, but the idle-to-idle transition clips and alternate idle are not yet
driven by an automatic transition policy. The walk/run/sprint gait contacts
in the source resources are empty; no contact-phase offsets have been
fabricated. The new `LocomotionGaitContactsV1` contract permits recorded
phase offsets only after measured offline extraction. Until those data
exist, the mixer uses identical normalized phases and therefore does not
prove stance alignment. Unsupported backward sprint is rejected rather
than silently relabelled. Angular interpolation between covered neighbor
motions is a presentation fallback, not a newly authored direction.
For strict deterministic frame-subdivision equivalence, the mixer uses
analytic exponential weight updates and mean-weight gait frequency;
multi-axis interrupted transitions, actual source contact trajectories
and quantization tolerances still require browser validation.

**Safety:** the root trajectory stays reference-only and cannot move the
gameplay actor. Source yaw is not consumed by gameplay. The opt-in
`?c63-kevin-review` route uses the 27 Kevin clips for movement mixing;
ordinary playback continues to use its original compatible library.
No Cloudflare production deployment is authorized. Step 3 grounding,
Step 4 gameplay adapter and Step 5 browser/performance acceptance remain
unimplemented on this branch.


## Step 2 continuation — approved Kevin directional movement (2026-11-21)

Continued the existing [C6.3 Step 2 PR #124](https://github.com/Tejasdmanjeshwar/Trilok/pull/124)
on top of the merged [browser-first architecture PR #125](https://github.com/Tejasdmanjeshwar/Trilok/pull/125).
The owner-approved 27 Kevin clips are retained **byte-for-byte**. No Unity
dependencies or source archive uploads were introduced. The 24 additional
clips remain code-split, loaded on demand when normal Character Studio's
**Movement transitions** option is selected, instead of being fetched on Studio
startup. The separate `?c63-kevin-review` selector still exposes all 24
standalone review clips. The ordinary standalone animation menu is unchanged.

The canonical mixer now accepts eight 2D travel directions, using the existing
Kevin forward base and explicit source-backed metadata for 7 walk, 7 run/jog
and 5 sprint categories. It resolves diagonal vectors without treating
backward input as dominant, interpolates between available adjacent authored
directions, and blends speed bands smoothly. **Backward sprint is not present
in the 27-clip source set** and is rejected rather than relabelled as side
sprint; the Studio pace control respects that coverage limit. Two authored
left/right turns play as one-shot presentation clips with independent clocks
and no gameplay root translation. The same held turn does not restart after
completion, while changing to the opposite side interrupts cleanly without
rewinding a still-visible fading source clip. Transition weights and periodic
phase frequency use analytic exponential integration for variable frame
subdivision.

The 3 new idle-family assets (Idle02 and Idle01/02 inter-idle transitions)
remain independently selectable in the owner-review library; they are
**not** gait, start-walk or stop-walk clips and have not been misleadingly
automated as such. Existing four C6.2 UAL1 clips and the legacy KayKit
diagnostic path are not rebaked, rewritten or conflated with the Kevin profile.

The approved source loops currently have **no verified stance contact
markers**. The new official-MakeHuman-calibrated 96-sample left/right
ankle-toe trajectory diagnostic reports candidate low-foot phases, but an
extremum is not by itself proof of ground contact. No arbitrary contact
phase offsets are inserted in shipped assets. Validation of a measured
left/right phase correspondence and further stance corrections is still
needed for fully natural blend transitions. Precise skinned-sole ground
contacts, pelvis balancing and collision-driven actor/world movement remain
Steps 3 and 4.

**Review/test workflow:** `tests/character-animation-c6-3-directions.test.ts`
tests 2D/gait coverage, strict unsupported sprint, turn lifecycle, immediate
interruption continuity, frame subdivision and immutable authoritative root.
`e2e/studio-animation-c6-3-locomotion-preview.spec.ts` captures movement
from the **ordinary** Studio route for all eight directions and both turns,
front/side, desktop and touch. The existing source-byte hashes and C5/C121
regressions remain mandatory. The costly Chromium suite is available only
through explicitly manual `.github/workflows/c63-kevin-chromium-review.yml`
or final Phase Acceptance.

**Acceptance:** Actual Chromium screenshot review, measured contact-phase
quality, C5 equipment regressions and exact-HEAD CI remain separate from
functional code/test implementation. Do not declare C6.3, or full Step 2
visual quality, accepted without those results. Do not deploy Cloudflare
production without explicit owner approval.


### Measured gait phase alignment — 2026-11-21

The independent 96-sample canonical MakeHuman FK test in [CI run
#44901403501](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44901403501)
recorded the lowest **mean ankle/toe world-height phase** for both legs
on all 21 canonical Kevin walk/jog/sprint gait clips. This is a repeatable
low-foot **signal**, not a skinned-sole contact/plant event. Normalized
representative left-foot phases: forward walk `70/96`, backward walk `23/96`;
forward jog `72/96`, backward jog `24/96`; forward sprint `75/96`.
The backward walk/jog phase shift is approximately **half a cycle**, so
blindly using identical normalized phases would juxtapose opposing legs.

The checked-in `kevin/c63/locomotion-map.json` now stores the complete
measured left/right low-foot phases of the **19** additional authored gait
categories and three forward reference gaits, together with the 96-frame
sampling method and provenance. The mixer applies each source's measured
**left low-foot phase minus its same-gait forward reference** as a wrapped
sampling offset. No runtime mesh scanning, authored clip modification,
contact-marker invention, or gameplay displacement is introduced.
A numerical regression regenerates the measurements from original clips
and the calibrated MakeHuman skeleton, including mirrored sides.

**Important limitation:** low-foot height alone cannot prove a planted,
stationary sole, and actual contact onset/release may differ from the trough.
This correction aligns a verified gait **phase landmark**, not claimed
foot-pinning. Step 3 still owns skinned-sole geometry, velocity/contact
classification and pelvis balancing. Cross-gait perceptual transition
quality still requires a real Chromium render and owner review.
