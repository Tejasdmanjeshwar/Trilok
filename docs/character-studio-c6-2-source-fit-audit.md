# C6.2 motion-source fit audit — Quaternius UAL1/UAL2 and ACCAD

Status: **measured rest-rig audit complete; visual/motion-quality acceptance pending**.
Measured input report: [character-studio-c6-2-source-fit-audit.json](character-studio-c6-2-source-fit-audit.json).
Exact source hashes and acquisition process: [C6 source audit](character-studio-c6-animation-source-audit.md).
This report is a **comparison, not permission to ship the ACCAD recordings**.

## Comparative results

| Source | Data available | Source skeleton | Mean measured major-segment rest-direction difference versus pinned MakeHuman | Interpretation |
| --- | --- | --- | --- | --- |
| UAL1 Standard | 43 animations; `Idle_Loop`, `Walk_Loop`, `Walk_Formal_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop` | 65 weighted glTF joints | 31.2 degrees | Current CC0 candidate, includes articulated finger tracks; needs T-pose to MakeHuman-calibrated axes |
| UAL2 Standard | 43 animations; specialty idle, carry, zombie walk; no directly superior neutral walk/run | 65 weighted glTF joints | 31.2 degrees | Same rest-axis fit; **not a better base neutral locomotion source** |
| ACCAD Quickwalk | `eric1.bvh`, ~60s, 7,200 frames | 22 BVH articulated joints, no finger articulation | Not comparable without a validated BVH coordinate conversion | Real capture candidate for locomotion quality, not a plug-compatible MakeHuman skeleton |
| ACCAD Female | 81 BVH clips; `Female1_A01_Stand`, `Female1_A02_Sway`, `Female1_B03_Walk1`, `Female1_C03_Run` | 22 BVH articulated joints, no finger articulation | Not comparable without a validated BVH coordinate conversion | Useful natural-motion reference and potential future license-verified import; requires segmentation and missing-digit policy |

The 31.2-degree average is from measured source and target rest segment vectors for arms and legs, **not** a perceptual-quality score and **not** joint-angle error over the animated clips. Both UAL variants have identical structural score; neither resolves the C6.2 wrong-hand/shoulder defects by switching files.

## Recommended source decision for C6.2

1. Keep **UAL1 Standard** `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop` as the CC0 reproducible baseline because the data and license have been verified, it has broad hands/fingers, and it is already mapped to canonical C1.
2. Before another subjective quality claim, place the original UAL1 mannequin beside Trilok's **actual MakeHuman-skinned** character at identical clip times, with front/side/rear/3/4 views. Compare source limb segment axes, wrist world orientation, finger envelopes, elbow/knee flexion direction, pelvis translation, grounding, and complete motion loops.
3. Review UAL1 `Walk_Formal_Loop` as a motion-style alternative, but only promote it if rendered review supports the intended normal gait. UAL2 specialty clips are not natural standing/walking/running replacements.
4. Compare ACCAD `Female1_A01_Stand` or `Female1_A02_Sway` for restrained idle, `Female1_B03_Walk1` for human gait, `Female1_C03_Run` for running, and the separate `eric1.bvh` Quickwalk capture for walking. These are **candidates inferred from sample names**, not yet visually adjudicated winners. Segment whole recordings to a credible looping cycle; verify rights before importing redistributed data.
5. ACCAD's 22-joint skeleton lacks Quaternius's finger chains. Do not invent finger motion or directly apply BVH Euler channels to C1. A future whole-body transfer may keep the MakeHuman fingers in their native calibrated neutral state; it must be reviewed against weapon grips.

## Audit limitations and correct validation

- MakeHuman CC0 measured landmarks are the target; schematic C1 `bindTranslation` must not be treated as the actual source-skinned geometry.
- The comparison reports dominant upper/lower limb segment axes but not anatomical twist reference frames. A single vector cannot determine roll about the bone: this is a likely remaining wrist/forearm retarget ambiguity and requires a second independent anatomical landmark/basis or validated full frame.
- BVH channel order, handedness, world forward axis, and T/A pose differences require a separate validated rest-orientation conversion before metric comparison to MakeHuman.
- No source (including UAL1) is visually accepted merely because the sampled keys, source SHA and numerical tests pass.
- No external Blender editor or second gameplay skeleton is required; offline tools and temporary source skeleton analysis are permitted.
- The complete UAL1/UAL2/ACCAD archives were *not* placed into the runtime bundle. Motion source audit reports are development data only.

## Mandatory live preview protocol

Every motion change needs a **separate Cloudflare branch preview URL with verified `/build-info.json` `commitSha` equal to that PR head** before it is submitted for visual acceptance. An old successful preview, local production URL, screenshot, or passing browser tests are not a substitute. Never silently merge to `main` just to obtain a preview.

The branch endpoint identified in Cloudflare's PR comment is:

`https://feat-c6-2-animation-baking-studio-playback-trilok.tejasdmjr996.workers.dev/studio/`

**Important:** this endpoint last had an independently recorded successful preview for older commit `7297f06`; it is *not verified at the current C6.2 head*. The PR's Cloudflare build checks for later heads have reported failures. `.github/workflows/c6-2-preview-probe.yml` checks that both `/build-info.json` matches the exact commit and the Studio route responds, rather than accepting stale deployments.

Only provide this endpoint to the owner as an **updated** preview after that probe succeeds; record the tested SHA and the corresponding Cloudflare deployment. If a build fails, surface the error and keep the PR unmerged.
