# C6.2 — Reusable rig-level motion retargeting: research, architecture and decision

**Status: researched and proposed, NOT implemented or visually accepted.** Prepared for draft PR #112; do not confuse a documented algorithm with verified motion. Source of truth remains C1/C5/C6.1 runtime code and the C6 roadmap. Current PR source-fit audit: [character-studio-c6-2-source-fit-audit.md](character-studio-c6-2-source-fit-audit.md). The live Cloudflare branch preview is stale until its build identity is independently verified.

## Goal and what “works for any bone movement” means

Once a **source skeleton identity** has been calibrated against a **target anatomical rig family**, any compatible animation clip using those same joints should be convertible automatically: idle, walk, jog, sprint, combat swings, reactions, hand movement, finger flexion, axial bone twists, rotations and root motion. A new clip must not require a new arm/hand Euler offset or named-clip special case.

Scope limits: unmapped joints cannot be reconstructed uniquely; extra fingers/limbs, wings, anatomical dismemberment, source scale/shear channels, missing twist landmarks, different IK constraints, ground contact, weapon contact and artistic intent may require **rig-family adapters or reusable constraint solvers**, not custom tweaks to each source clip. Skeleton transfer does not automatically guarantee natural gait or contact accuracy. A different rig layout requires a new mapping/profile, not per-animation fixes.

## Researched references and adoption decision

| Candidate | Verified guide/code | License/fit and risk | Decision |
| --- | --- | --- | --- |
| **UPF-GTI retargeting-threejs** | https://github.com/upf-gti/retargeting-threejs/blob/main/docs/Algorithm.md ; https://github.com/upf-gti/retargeting-threejs | Apache-2.0 in repo snapshot; auxiliary matched reference pose, world/local quaternion conversion, source-to-target bone maps. Its README states one-to-one mapping and requires matching auxiliary pose; limited for split spine/skin helpers. | **Use as mathematical reference and benchmark**, do not copy implementation blindly |
| **Three.js r180 SkeletonUtils** | https://threejs.org/docs/pages/module-SkeletonUtils ; pinned r180 source: https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/jsm/utils/SkeletonUtils.js | Three.js MIT, already a dependency. retargetClip() samples a clip into a target using name map, target matrix and hip options, but the inspected source writes target transforms during retarget, samples at inferred FPS, and does not model C1 anatomical semantics, weighted skin helpers or source-rights metadata. | **Implement baseline comparison with existing dependency**, not automatically production owner |
| **pixiv three-vrm normalized bones** | https://pixiv.github.io/three-vrm/docs/documents/migration-guide-1.0.html | MIT; normalized humanoid bones expose identity rest orientation while raw bones retain native rest rotations. VRM-specific adapter and full runtime dependency unnecessary for existing C1. | **Adopt normalized-frame design**, avoid introducing separate VRM rig/runtime |
| **@three-ws/retarget** | https://github.com/nirholas/retarget ; https://nirholas.github.io/three-ws-retarget/ | Apache-2.0 declared by package; supports naming profiles including MakeHuman and rest/hip corrections. New external dependency, generic humanoid representation, limited verified evidence on Trilok's helper bones, deforming skin and fingers. | **Bench candidate**, inspect pinned code/tests before adoption |
| **Unreal IK Retargeter** | https://dev.epicgames.com/documentation/en-us/unreal-engine/ik-rig-animation-retargeting-in-unreal-engine | Architecture, not a browser library: chain maps, source/target retarget poses, proportion-aware pelvis, optional IK. No Unreal runtime dependency. | **Adopt chain/mapping/retarget-pose architecture** |
| **glTF 2.0 skin and animation specification** | https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html | Source of truth for skins/joint ordering, node hierarchy, inverseBindMatrices, normalized quaternion XYZW TRS and animation channels. | **Mandatory importer validation** |
| **Michael Gleicher (SIGGRAPH 1998)** | https://graphics.cs.wisc.edu/Papers/1998/Gle98/ | Established motion retargeting with spacetime constraints to preserve animation qualities and re-establish contacts. Implementation complexity higher than frame transfer. | **Reference for later contact/temporal solver, not C6.2 prerequisite** |
| **Three.js CCDIKSolver / FABRIK** | https://threejs.org/docs/pages/CCDIKSolver.html ; https://www.sciencedirect.com/science/article/pii/S1524070311000178 | Possible shared end-effector/foot/hand solvers, not standalone bone-frame retargeting. | **Reuse/evaluate for C6.3/C6.4 contacts**, preserve C5 IK ownership |

**Recommendation:** keep deterministic Three.js math and canonical C1 representation. Build a reusable profile/calibration module, informed by the UPF-GTI auxiliary-pose quaternion formulation and three-vrm's normalized frames. Use r180 SkeletonUtils and optionally UPF/three-ws as benchmark implementations on representative fixtures; no new runtime dependency unless measured to solve our specific problem without violating architecture.

## Correct mathematical transfer

The current baker `scripts/bake-reference-animations.mjs` computes a **single shaft-axis alignment** with `Quaternion.setFromUnitVectors(targetDir, sourceDir)`. This fixes swing but not twist about the shaft, so wrist/forearm/hand roll is ambiguous. It also keys source fingers by `role`, but C1 finger role omits side: the key must use exact `joint.id` and resolved side.

### A. Rest-space calibration once per source–target rig pair

1. Parse glTF source hierarchy and **inverse bind matrices**, or the equivalent verified BVH hierarchy/coordinate metadata; normalize handedness/up/forward/units to C1 (right-handed Y-up +Z-forward, meters). Keep source pose, bind pose and auxiliary retarget pose distinct.
2. Extract **actual** calibrated MakeHuman bind frames and weighted helper ownership from the existing `SkinningSpike` + `OfficialHumanRig.calibrateHumanBones` path after inverse bind calculations. Do not substitute C1 schematic `bindTranslation` offsets for mesh source landmarks.
3. Build side-qualified source-node→exact C1 joint ID mapping, plus optional chain groups (spine, shoulder/arm, finger, hip/leg/toe). Validate coverage, duplicate/ambiguous mapping, missing twist, topology, and extra source joints. Reject incompatible profiles.
4. Choose a **shared auxiliary anatomical pose** for source and target or calculate normalized frames from **two independent oriented anatomical cues**: segment axis plus bending-plane normal, palm/knuckle normal, foot sole normal, torso forward. Ensure orthonormal right-handed bases and robust collinear/degenerate rejection; do not assume `setFromUnitVectors` resolves roll.
5. Cache signed full frame quaternions, source/target reference world rotations, parent transforms, axis conversions, chain length scales, root conversion and fingerprints. The file is a **versioned `RetargetProfile`**, hashed against source and target rig identities. Once calibrated, no clip-specific bone rotation offsets are allowed.

### B. Source motion transfer for every compatible clip

For an unbranched 1:1 joint mapping, the UPF-GTI guide gives the reference-pose world-offset form (all orientations first expressed in the normalized shared frame):

`Q_target_local(t) = inverse(Q_target_parent_ref_world) * Q_source_parent_ref_world * Q_source_local(t) * inverse(Q_source_bone_ref_world) * Q_target_bone_ref_world`

This computes an arbitrary local source rotation including axial twist and yields target rest when the source is at its reference pose. A one-time anatomical coordinate/palm/twist calibration is still required for cases whose reference bone frames are not equivalent. Quaternion multiply order is not commutative.

For **mismatched chains**, evaluate the full source animated parent world transform, transfer the appropriate semantic joint/world frames or chain endpoints under the same auxiliary reference, then reconstruct target local rotations using the **target's own animated parent**. Preserve unique joints' independent DOFs where mapped; never treat weighted shoulder/forearm skin helpers as independent authoring bones or flatten a multi-bone spine without an explicit chain policy.

For root motion, normalize the source forward/up frame, translate physical displacement according to proportion/motion policy (not all raw root tracks), and keep the canonical `visual_only` movement channel presentation-only; authoritative combat simulation still owns position and timing.

### C. Runtime pose and later contact corrections

Bake output as existing `AnimationClipV1` local rest-delta tracks, pinning source/license/calibration/profile hash in a sidecar manifest. Preserve original clip timing/loop policy, quaternion hemisphere continuity, full finger tracks, morph and weapon settings. At runtime follow the existing calibrated `AnatomicalFK.applyRestDeltas` and shoulder/forearm helper synchronization with C3 correctives; a new playback skeleton is forbidden.

Later C6.3 foot planning/IK and C6.4 weapon/grip constraints solve physically impossible end-effector placements caused by differing character proportions. Source data may contain contact event descriptions but these are **presentation metadata**, never gameplay authority.

## Engineering execution sequence (phase-by-phase PR slices)

| Gate | Implementation work | Measurable acceptance |
| --- | --- | --- |
| **P0: current branch preview** | Fix Cloudflare Workers Builds check on PR #112, deploy a staging branch rather than touching main, verify live `/build-info.json.commitSha` equals exact HEAD. | Owner has a playable current-SHA Studio URL before any motion is declared reviewed. Existing URL is stale. |
| **R1: match data + ground truth** | Extract glTF inverse bind/node rest data, target calibrated pose and explicit source↔target joint mapping, including fingers; side-by-side source mannequin and MakeHuman viewer on same time scale. | Source bind/neutral and target calibrated rest correct with no drift or wrong side; visual overlays. |
| **R2: full-frame retarget profile** | Build separate, pure TS rig calibration, shared auxiliary pose and quaternion conversion; support 1:1 mapped joints and explicit chain mapping; reject missing/degenerate frames. | Mathematically exact tests of 3-axis twists and arbitrary known rotations, mirrored sides, T-to-A, 100% mapped finger DOFs, reversible reference pose and zero lost DOFs. |
| **R3: batch-import generic clips** | Remove three-clip restrictions from common baking code, separate library selection from retarget math, output canonical clips + profile hashes. | Idle/walk/jog regenerated deterministically **and a fourth previously untouched UAL1 clip** retargets without editing the engine's math or mapping. |
| **R4: rendered and regression evidence** | Desktop/touch actual skinned MakeHuman multi-view/full-loop compare at nominal and extreme morphologies; verify C5 equipment and deterministic combat replays, foot and palm error metrics. | No mapped bone twists, bad side assignment, divergent rest/loop, helper deformation or regression; owner accepts live exact-SHA preview before merge. |
| **R5: expand source support** | Source adapter/profile for UAL2 and license-approved ACCAD BVH; same generic retargeter. | New compatible source clip bakes by selecting a profile only; incompatible topology produces explicit diagnostics. |

## Mandatory automated test vectors

- Synthetic source and target skeletons with different rest rotations, hierarchy/frame orientations, bone lengths, plus identity, 45° axial twist, forearm pronation, full 180° rotation, diagonal quaternion, and random seeded three-axis motions; expected target-world frames must match a known transform independently of implementation.
- Quaternius sampled source and MakeHuman target both start in correct neutral; two symmetric sides are not silently swapped; every joint/finger has unique IDs, parent coverage and explicit unmapped policy. Shoulder/forearm helper skin poses remain consistent with actual source weights and C5 FK.
- Separate source-root translation in differing coordinate conventions; accurate permitted root-motion policy; no gameplay edits.
- Repeated batch bakes are deterministic and equal byte-for-byte; profile/source/target hashes embedded in manifests, validator rejects changed rig or profile without regeneration.
- Distorted poses or contacts fail quantitative/multi-view acceptance, not just successful loading; tests must include complete loops with short, tall and muscular morphs.
- No additional dependency until pinning, licensing, maintenance, Vite/Node compatibility and comparison against the existing Three.js baseline pass.

**Acceptance is explicitly NOT achieved by drafting this document.** PR #112 stays draft. Cloudflare preview must be verified independently and production may not be used as a workaround.

## R1/R2 implementation checkpoint (2026-11-19)

**Engineering status: mathematical foundation introduced, not integrated or visually approved.**
The branch adds `packages/character-core/src/retargeting.ts` with versioned
rig descriptors, an explicit one-to-one exact joint ID mapping, an orthonormal
shaft-plus-signed-secondary reference frame, strict rejection of collinear
reference cues, full quaternion swing/twist transfer, and target-world hierarchy
reconstruction. It exposes `createRetargetProfile`, `anatomicalFrame`, and
`retargetWorldPose` without Three.js or clip-name dependencies. A focused
synthetic test file covers axial twists, nonaligned T/A rest, parent-space
reconstruction, bilateral finger IDs, and invalid mappings.

**Not yet complete:** This API is not called by the legacy
`scripts/bake-reference-animations.mjs`; checked-in clips are unchanged.
No actual UAL1 glTF inverse-bind or signed secondary-cue extraction and no
calibrated MakeHuman runtime-bone descriptor have yet been wired to it.
Therefore R1's 3D anatomical ground truth and R2's real-data calibration are
**not proven**. Source profile hashing/provenance, root policy, clip generality,
the fourth clip, rendered inspection, and exact deployment verification remain
separate gates. The existing `setFromUnitVectors` baker remains provisional
and must not be presented as solved by the new module.

The test matrix is mathematical only: it cannot establish absence of
deformation artifacts. Do not promote any previously rejected motion or merge
PR #112 based on this checkpoint.

### Follow-up R1 real-rest descriptor adapter

The same branch now also contains:
- `packages/character-core/src/retarget-human-frames.ts`: explicit human anatomical-frame adapter deriving signed torso forward, left/right palm normal, bone shaft and terminal finger cues from *measured world-rest landmarks*. It rejects missing/duplicate/collinear landmarks. The independent retarget math remains unaware of anatomical labels.
- `apps/web/src/characters/animation/UAL1SkeletonAdapter.ts`: explicit UAL1-to-C1 correspondence for the **49** currently mapped joints, including all 28 bilateral finger phalanges, with no ambiguous bare finger roles and no silent extra-arm aliasing.
- `tests/character-animation-c6-2-real-calibration.test.ts`: an integration test that constructs the original UAL1 source rest scene, calls the real `calibrateHumanBones` using pinned MakeHuman OBJ/.mhskel landmarks and the existing `SkinningSpike` bones/skin helpers, builds both descriptors, and demands neutral full-frame transfer preserve the actual target rest pose.
- Additional exact mapping and full-quaternion unit tests.

**Important boundary:** The above integration test validates a rest-pose construction path, *not* any source clip quality or inverse-bind consistency. The existing baker has **not** been migrated, existing animation assets remain unchanged, and the returned profile is not yet persisted in a SHA-256-manifested asset. The original GLB inverse bind matrices must be collected and verified against source rest transforms; the three Quaternius clips must only be rebaked after that audit. No result is visually accepted or deployed by these changes.

## R1/R2/R3 candidate proof — source GLB bind matrices and reusable four-clip baking

**Implemented candidate (not a promoted motion library, not visually accepted):**
`scripts/extract-quaternius-ual1.mjs` now optionally extracts glTF
`skin.inverseBindMatrices` and fourth-clip `Sprint_Loop`. The candidate baker
(`scripts/bake-c62-calibrated.mjs`) rejects missing inverse bind metadata,
checks a single common mesh-bind space across actual source joints
(`sourceJointRestWorld * sourceInverseBind`), calibrates the existing
MakeHuman runtime bones through `calibrateHumanBones`, derives a single full
anatomical retargeting profile, and processes every selected clip without
named-bone orientation corrections. It preserves the old reference assets.
The candidate files are stored under `assets/animations/candidate-c62-v1/`,
with `profile.json`, SHA-256 manifest and four distinct canonical clip JSONs.
Studio offers explicitly labeled experimental choices side by side with the
previous UAL1 versions; no experimental candidate is silently substituted.

**Reproducible proof:** The original UAL1 ZIP and glTF SHA-256 were rechecked
in GitHub Actions [#44394239022](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44394239022).
All 4 clips (`Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`,
`Sprint_Loop`) were extracted. A single 49-joint profile
`159e7b77c3997364e7fed624a17f13be280c25a07d2fc913c2880627211834e2`
baked all four with deterministic byte-for-byte regeneration;
the source-glTF bind consistency maximum matrix residual was
`6.383178585700477e-7` against the GLB's common mesh-bind transform.
Three focused test files / 8 tests passed. The candidate commit was
subsequently produced by the second successful proof workflow
[#44394583248](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44394583248);
the generated candidate remains **unapproved**.

**Strict remaining gates:** C6.2 R1 needs source and target rest/skin
visual overlays (the IBM check is numerical); R2 needs axial-twist/hand
quality evaluation on all frames; R3 now has the fourth-clip proof but
not visual signoff; R4 needs source-versus-target moving comparisons and
review of screenshot evidence on normal, short, tall and muscular characters.
Root displacement is deliberately presentation-only and C6.3 still owns foot
contact. The current CI/browser/Cloudflare check statuses must be recorded
at their **exact** current branch commit, never inferred from an older proof.
Cloudflare Workers Builds continue to fail, and there is no verified current
commit Cloudflare branch preview. Do not merge on mathematical checks alone.
