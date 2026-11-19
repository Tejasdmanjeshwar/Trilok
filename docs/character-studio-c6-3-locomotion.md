## 2026-11-20 — Original SHA-pinned BVH arm-gauge and Run-loop measurements (in-progress)

**Experiment status:** Original BVHs recovered from the previously successful [C6.3 acquisition #44587045292](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44587045292) (artifact `c63-100style-neutral-source-inspection`). Verified exact original SHA-256 directly against the retrieved files:

| Source | SHA-256 |
| --- | --- |
| `Neutral_ID.bvh` | `71aead2e3246bdb47a5b839cb3e60e0574e9a1a046c071cc147e2922a35f259f` |
| `Neutral_FW.bvh` | `2f28800baa299547c42c257d1c926172542a1e69b46a3d3e6aa0aded0e9b40f6` |
| `Neutral_FR.bvh` | `f46ca526027a3654c8939a0123413f6008906fb32125d5e885eafcaa830831cb` |

A separate offline numerical reconstruction decoded **declared Y-X-Z BVH rotation channels**, accumulated parent world orientations, applied the stored family correction and sagittal reflection, then evaluated both the committed 100STYLE profile and a *candidate only* zero-additional-roll source elbow/wrist reference (computed from the real MakeHuman shafts and independently observed target palm-normal cue). At source ID reference frame **282**, decoded source elbow/wrist world orientations matched the committed source rest quaternions to 0° numerical residual.

For the first source Idle cycle frame **1279**, the target elbow rest-local signed axial components (shaft-axis quaternion decomposition) were:

| Side | Current 100STYLE gauge | Candidate minimal-twist gauge |
| --- | ---: | ---: |
| Left elbow | +104.90° | +42.31° |
| Right elbow | −65.91° | +4.05° |

Across the five original Idle samples 1279, quarter, midpoint, three-quarter, 1372, the candidate reduced the left-elbow component by **62.59°** and shifted the right by **69.96°**, with no re-authored BVH Euler keys. Similar constant gauge differences occurred in Walk and Run. Source-to-target shoulder–elbow and elbow–wrist *link directions remained unchanged to numerical precision* in the independent offline FK calculation. **These are not ground-truth skin/hand orientation comparisons.** The remaining left-elbow 42° is not proven correct or incorrect; BVH has no independent source palm surface to resolve the reference roll. Note that local signed twist is measured in the actual target rest-axis convention, not the Euler channel basis.

The committed `scripts/calibrate-c63-100style.mjs` now includes a **diagnostic-only** candidate profile using `parallelTransportAnatomicalCue()`, measures original versus candidate source-backed shoulder/elbow/wrist poses at the reference, plus five phase samples per canonical source cycle, and emits `100style-minimal-twist-probe.json` in the existing temporary source-acquisition artifact. It does **not** rebake, replace, or promote any 100STYLE clips, or alter the official approved UAL1 profile/assets. The existing source-acquisition workflow's push trigger covers this amended script. Actual CI job success and resulting probe artifact must be inspected rather than assumed.

### Exact-head full-cycle source-acquisition verification

The [C6.3 source workflow #44601495062](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44601495062) **completed successfully** for commit `4c73b199d91e697f2c31fb5a5a7071887214bbfe`. Its downloaded, inspected `c63-100style-neutral-source-inspection` artifact contains `100style-minimal-twist-probe.json` with 16 original-BVH pose comparisons and **every-frame measurements** across the full selected Idle (94 frames), Walk (82 frames) and Run (48 frames) cycles.

Measured worst signed rest-local elbow axial magnitude from actual original-BVH samples:

| Source cycle | Left current | Left candidate | Right current | Right candidate |
| --- | ---: | ---: | ---: | ---: |
| Idle | +105.04° @ 1342 | +42.45° @ 1342 | −66.01° @ 1325 | +4.25° @ 1372 |
| Walk | +104.00° @ 625 | +41.41° @ 625 | −61.87° @ 648 | +11.99° @ 660 |
| Run | +84.52° @ 505 | +21.93° @ 505 | −59.22° @ 504 | +23.48° @ 543 |

The constant left-elbow reduction of ~62.59° does **not** mean 42° residual is physically natural. The current calibration conflates a sagittal body-forward source cue with a signed target palm surface, while the candidate simply transfers the *measured target cue* with a shortest-arc alignment. The official BVH lacks a source palm normal; neither case can certify true pronation from link positions alone. The original source channels, reference motion, toe fixes, approved UAL1 assets and 100STYLE experimental baked bytes were left unchanged. The corrected diagnostic can now be rerun against additional captured clips using the single existing source-family adapter; it is not a new retarget engine.

### Run seam source-authored diagnosis

Reconstructed the exact published source FR channel quaternions for the selected capture loop **499–546**. Source local quaternion angular differences at the wrap are:

| Joint | Angular difference |
| --- | ---: |
| LeftWrist | 13.9584° |
| RightAnkle | 11.768° |
| LeftElbow | 11.278° |
| RightElbow | 10.478° |
| Hips | 6.551° |

The worst difference in local *two-sample angular-speed magnitude* across the boundary is **LeftWrist 7.544°**; other prominent contributions are LeftAnkle **3.066°** and RightHip **2.374°**. This indicates the seam is present in the **source recording**, before target anatomical calibration. The original search's best overall loop score 499–546 has worst 13.9584°, mean 3.9081°, velocity mismatch 1.1046°, and vertical root seam ~0.00434 m. A nearby 501–547 source-backed candidate improves worst-joint angular difference to **12.6374°**, but worsens mean to **4.8299°** and velocity mismatch to **1.3977°**. No better physically acceptable candidate is established by this comparison; do not overwrite authoring keys or describe Run as seamless.

### Render and CI restrictions

Retrieved the previous successful Verify's static artifact, but its embedded `build-info.json` identifies commit `c3ce3a25a0ec6153f20428f17bdeaa41855f840f`, **not** the new diagnostic PR HEAD. It cannot validate subsequent code changes. Locally, Chromium could be launched through Playwright, but attempts to navigate HTTP, HTTPS, and `file:` Studio documents returned `ERR_BLOCKED_BY_ADMINISTRATOR`; standalone canvas `getContext("webgl2")` returned null. Consequently, **zero skinned MakeHuman visual screenshots have been validated** on this candidate. No authorized workflow_dispatch tool is available to start the repository's manually dispatched `studio-interaction-diagnostics.yml` / `100style-review` suite. Manual-only CI browser policy remains intact. No Netlify preview was deployed. Owner sign-off remains mandatory.

---

## 2026-11-20 — UAL1/100STYLE source-frame research and safely isolated diagnostic

**Status: partial diagnostic implementation only. No new source calibration, 100STYLE clip rebake, Chromium visual acceptance, Netlify preview or owner sign-off is claimed.** This is the existing draft PR #118; UAL1 approved assets are not modified.

### Reproduced reference-frame comparison

Compared the committed `assets/animations/studio-v1/profile.json` (UAL1) and `100style-neutral-profile.json` by exact matching C1 target ID. All selected target rest-world rotations and target anatomical frames were **identical (0° quaternion difference)**. For each matched source anatomical frame, the angular difference UAL1 versus 100STYLE was:

| Role | Left | Right |
| --- | ---: | ---: |
| Shoulder | 11.703° | 16.264° |
| Elbow | 90.395° | 90.727° |
| Wrist | 92.043° | 91.632° |
| Hip | 5.850° | 2.580° |
| Knee | 4.687° | 2.763° |
| Ankle | 1.874° | 11.258° |

**Interpretation caveat:** these are differences between distinct *source* reference-frame quaternions, **not** pose errors or proof of an exactly 90° forearm twist. Their joint distribution flags that the current arm calibration is qualitatively unlike the legs and requires physical cue validation before making another bake.

The UAL1 source descriptor uses `createHumanRestDescriptor()` with actual signed source finger/knuckle/thumb landmarks for an independently oriented elbow/wrist palm-normal cue. Its glTF inverse skin bind matrices were independently checked (recorded maximum consistency residual `6.383178585700477e-7`). The 100STYLE BVH carries 23 named joints, no finger/palm landmarks, and **no source skinned inverse bind matrices**. `scripts/calibrate-c63-100style.mjs` instead passes the *global torso forward vector* as the elbow and wrist secondary reference. Although this creates formally orthonormal `anatomicalFrame()` quaternions, it does not establish the source's volar/palmar roll reference, and the frame cannot legitimately be treated as equivalent to UAL1's measured palm cue. A body-forward secondary can rotate by ~90° relative to the physical palm plane even when shoulder–elbow–wrist shaft directions coincide.

The existing `source-anatomical` branch computes `Qdesired = (QsourceNow × inverse(QsourceRest)) × Fsource × inverse(Ftarget) × QtargetRest`. Its correctness requires `Fsource` and `Ftarget` to be anatomically homologous reference orientations. If the BVH arm cue is an arbitrary torso-forward reference, the retargeter transfers a well-defined **numerical** rotation but not a justified anatomical forearm/palm frame. Link-direction residuals cannot detect the axial error because rotation around a shaft preserves its endpoints.

Another independent check is needed: `AnatomicalFK.applyRestDeltas()` decomposes elbow rotation into swing and twist about the target-local `rotation` freedom and applies *swing alone* to the proximal lowerarm01 helper; a false source-derived twist is therefore partly excluded from proximal skin while the full delta reaches the elbow, lowerarm02/wrist and fingers. This is a plausible deformation amplifier, **not yet isolated as the independently proven root cause**. Do not remove helper twist distribution or change approved UAL1 presentation based solely on these profile measurements.

### Mathematical reference and research

- [UPF-GTI retargeting-threejs algorithm](https://github.com/upf-gti/retargeting-threejs/blob/main/docs/Algorithm.md): world-space quaternion offset transfer assumes a **shared anatomically equivalent auxiliary pose**; using dissimilar T/A or roll cues violates that premise.
- [100STYLE official dataset](https://www.ianxmason.com/100style/) and [Zenodo archive](https://zenodo.org/records/8127870): original fingerless BVHs and published locomotion data; a separate processed set contains rotations/velocities but does not by itself supply source palm-surface ground truth.
- [Mason, Starke, Komura, Real-Time Style Modelling of Human Locomotion](https://arxiv.org/abs/2201.04439): capture provenance and intended locomotion context.
- [A Kinematic Consistency-Based Method for Refining Axial Twist Errors](https://jsstec.org/_PR/view/?aidx=48265&bidx=4342): distinguish axial twist from swing and check parent/child kinematic compensation; its paper does **not** imply that missing palm orientation can be reconstructed uniquely.
- [KITRO, CVPR 2024 supplemental](https://openaccess.thecvf.com/content/CVPR2024/supplemental/Yang_KITRO_Refining_Human_CVPR_2024_supplemental.pdf): swing/twist decomposition as a way to separate joint-direction constraints from independently underdetermined axial rotations.
- [orangeduck/100style-retarget](https://github.com/orangeduck/100style-retarget): an independent skin-attached 100STYLE transfer for visual/algorithmic comparison. Verify redistribution and character licensing before using any assets.

### Safe reference-frame policy candidate

Added `parallelTransportAnatomicalCue()` to the existing pure C6.2 retargeting module and a focused test file. It is **not yet connected to the baker** and does **not** alter UAL1 or experimental 100STYLE clip bytes. The optional helper takes the real, calibrated target anatomical shaft and secondary cue, carries the transverse cue into the BVH's measured source shaft by the shortest possible quaternion swing, and returns a deterministic *zero-additional-roll convention*. It explicitly rejects degenerate/parallel transverse cues and antiparallel shafts. It does **not** assert this gauge equals the original motion-capture artist's palm bind frame or that all observed BVH axial channels are meaningless. It makes the missing absolute source surface frame an explicit, testable family calibration policy rather than silently claiming a measured palm.

**Next mandatory experiment before promotion:** Compare the actual source reference, idle, forward/back Walk and both Run arm phases with real MakeHuman skinned renders. Benchmark the original torso-forward cue versus this zero-roll gauge; measure shoulder/elbow/wrist full orientations, elbow axis, signed twist, source-supported wrist relative motion, proximal lowerarm helper versus semantic elbow, and visual skin volume at all four views. Require geometry/pose evidence before changing the shared profile or baking. For straight reference elbows, bend-plane normals are unstable; evaluate multiple nondegenerate frames and do not repeat the failed single-pose cross-product trial. If source quaternions and actual source joint behavior give a reproducible stronger reference, prefer that over the minimum-roll fallback.

**Remaining acceptance blockers:** official BVH-to-target source-vs-skinned visual reference, full-cycle deformation and foot ground checks, Run ~13.96° seam analysis, complete UAL regression and Verify, manually dispatched SHA-pinned desktop/touch Chromium captures, and a separately verified Netlify preview. No merge and no Cloudflare production deploy.

---

## 2026-11-19 — Forearm axial-roll investigation: failed calibration rejected

A source-versus-target audit of the **current, unaccepted** 100STYLE clips
revealed substantial canonical elbow local axial rotations during Idle:
approximately **105° left, 66° right**, despite the original source elbow
shaft chains being nearly straight (about **3.7° left, 4.3° right** at
source Idle frame 1279). The wrist's distal direction alone does not
measure source palm roll; this source BVH has no fingers or palm surface
bind orientation. The existing target descriptor uses a palm-derived elbow
cue while the source adapter uses an approximate forward cue, so low shaft
residuals cannot certify forearm pronation or hand deformation.

A common-family, measured shoulder–elbow–wrist bend-plane experiment was
baked and numerically compared **without promoting its generated assets**.
It increased the Idle elbow axial component to approximately
**133° left, 109° right**, and likewise worsened Walk/Run. It was
**reverted**. No isolated elbow Euler offsets, fake source palm geometry,
or changes to approved C6.2 retargeting or clip bytes were introduced.

**Consequence:** the current 100STYLE arm twist and Run presentation remain
unaccepted. An observable source anatomical roll cue (or demonstrated
source-to-target skin/bend-plane validation) is necessary before claiming
high-fidelity elbows/forearms. The source data and diagnostic trial are
reproducible from the pinned source acquisition workflow. Rejecting this
trial was intentional; a passing directional or bone-shaft numeric test
was not treated as sufficient evidence of anatomical realism.

## 2026-11-19 — BVH End Site anatomical-axis repair and unapproved visual status

**Second measured calibration defect:** after applying the common sagittal
source-coordinate reflection, the baker had still evaluated the BVH toe End
Site in the original unreflected *local* space. This is inconsistent with
`R' = S R S`: an offset `v` must be transformed to `S v` when applying
the converted rotation. Ankle-to-toe bone-link residuals missed the
distal toe-tip reversal because the source End Site is not a mapped joint.
The corrected family calibration reflects local End Site offsets before
applying the recorded world quaternion. It does not adjust a particular
animation or manually rewrite the target toe joints.

**Reproduction and results:** the official pinned source and typed
source-target calibration succeeded in
[source acquisition #44587045292](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44587045292).
On the same authored loops, previously near-180-degree canonical toe rest
rotations (about 165°–174° on Walk) became approximately 13°–36° on
Walk, 13°–27° on Run, and about 16° on Idle. An explicit sampled toe
End Site / mapped target toe-tip direction diagnostic now reports
agreement, and a separate canonical-clip regression rejects inverted toes.
**These checks share a mathematical skeleton model; they are not independent
skinned-sole contact, skin deformation, or rendered animation acceptance.**
The approved C6.2 assets remain untouched.

**Visual execution limitation:** the current exact-head GitHub Verify
workflow can validate types/tests/build. The required
`studio-interaction-diagnostics.yml` suite `100style-review` is
`workflow_dispatch`-only; the connected GitHub integration does not
expose creation of new dispatch events. A previous Chromium screenshot
artifact from SHA `451ebf1e0476fcb5ca9e7550f0958f9e78a02532`
was inspected for historical context only; it predates both anatomical
corrections. An attempted local Chromium inspection of the newer
SHA-pinned static build was blocked by the container's WebGL/browser
navigation restrictions (no valid WebGL context). No rendered quality
improvement, touch acceptance or deployment is claimed.

**Still blocked:** verify arm/wrist skinning and run swing in the corrected
render, validate true skinned toe/sole contact and toe orientation over all
morphologies, address the ~13.96° source-backed Run seam, manually dispatch
desktop/touch Chromium on the exact PR commit, and produce a SHA-matched
Netlify preview for the owner's approval. Do not merge or deploy production.

## C6.3 measured 100STYLE source-family anterior-axis correction (2026-11-19)

**Confirmed root cause of the apparent backward Run lean:** the original
calibration defined anatomical forward as `cross(rightHip-leftHip, torsoUp)`,
which is the **opposite** of the recorded 100STYLE forward locomotion direction.
Official source world trajectories on the selected loop measured alignment
cosines **−0.998903 for Neutral_FW and −0.999972 for Neutral_FR** against
that convention. This is a source-space orientation/sign mismatch, not an
excuse to make the target lean forward with per-clip Euler hacks.

The offline family adapter now derives this sign from both authenticated
forward trajectories, requires near-collinearity and agreement, and performs
one sagittal coordinate reflection for the entire 100STYLE Neutral family.
It applies the reflection consistently to world positions and world rotations
through `R' = S R S`, `S = diag(1,1,-1)`, before invoking the existing
C6.2 calibration. This is a **frame-convention conversion**, not a
runtime pose counter-rotation or a reflection inserted into the target rig.
Original BVH channel ordering and SHA-256 identities are preserved.

The recalibrated source/target measures, using the same source recordings and
loop intervals, show 1.362 m forward Walk travel and 1.700 m forward Run travel
along body-facing; the source Run leans **7.336°–13.303° toward motion** over
five samples, with source-to-target torso-lean differences approximately
0.059°–0.062°. A numeric-only source reacquisition and bake passed in
[workflow #44579105093](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44579105093).
The three reviewer-only canonical clips and common calibration profile were
rebaked and transferred to **this same PR #118**; normal C6.2 choices and
approved asset bytes remain untouched.

**Important limits:** source-vs-target reconstructed FK agreement is not
independent evidence of skinned hand orientation, trustworthy wrist twist,
foot skin-grounding, or visually natural arm pumping. The Run loop still has
a ~13.96° worst sampled rotational seam, unchanged by correcting a coordinate
convention. Full-cycle skinned Chromium inspection, source reference comparisons,
and owner visual approval remain mandatory. No merge or production deploy.

## 2026-11-19 — Anatomical revalidation and CI policy repair (PR #118, still blocked)

**Scope remains one C6.3 PR. Do not merge or promote these clips.** The owner's
specific negative visual findings (backward run lean and malformed arms) supersede
any earlier numeric-only claims of believable animation.

- Removed the browser-review job from the push-triggered
  `c63-100style-source-acquisition.yml`. Official SHA-pinned BVH acquisition,
  typed source FK, calibration/bake diagnostics and temporary artifact retention
  remain. Desktop/touch Chromium review has been routed into the existing
  **manually dispatched** `studio-interaction-diagnostics.yml` suite
  `100style-review`; a CI policy regression test protects both sides.
- Expanded opt-in rendered evidence for the actual skinned MakeHuman character
  to default/short/tall/muscular, front/side/rear/three-quarter, quarter-cycle
  samples, plus explicit beginning/end seam captures. This is **capture coverage**,
  not a perceptual quality validator. Browser dispatch and human screenshot
  evaluation are separately required.
- Extended the offline source/target diagnostic with independently reconstructed
  torso-facing/up vectors, signed torso pitch, and bilateral elbow/knee bend-plane
  normals at matched BVH timestamps. Reports retain undefined/degenerate bend
  planes as null, not a false zero-degree success.
- **Investigation status:** the existing source adapter uses a generic facing
  vector as the non-collinear secondary cue for the arms, with no recorded BVH
  palm/finger references. The shared profile thus cannot independently certify
  forearm pronation, wrist orientation, or the correct elbow bend plane.
  Moreover, sampled link-direction residuals exclude axial twist; they do not
  prove that the displayed torso and arms match authored 100STYLE poses.
  These are evidenced **validation gaps / plausible defect contributors**,
  not yet a proven primary root cause.
- **Blocking correction:** compare the new signed source/target evidence and
  actual source/target skinned renders throughout each loop, determine whether
  the backward lean is source-authored or retarget-induced, then repair the
  one common anatomical calibration. The three previously baked 100STYLE clips
  are intentionally unchanged until that diagnosis is measured. No per-clip
  Euler correction or weaker test tolerance is acceptable.
- **Unperformed acceptance:** no owner-approved visuals, no demonstrated wrist
  twist calibration, no accepted full-cycle skinned sole/slip measurements,
  no regenerated/visually accepted 100STYLE assets, no SHA-verified Netlify
  preview. Do not conflate CI workflow success with C6.3 acceptance.

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


### Recorded C6.3 100STYLE review candidate — verified source bake, not visual acceptance

The existing [source workflow #44571774651](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44571774651) **passed** with a shared, measured real MakeHuman calibration. These are link-direction and provenance checks, **not** evidence of skinned realism. The original BVH sources remain temporary and are not packaged into the browser. The following review-only derived clips, one versioned retarget profile and a source-manifest are now committed under \`assets/animations/studio-v1/\`. No UAL1/C6.2 clip/manifest/profile bytes were modified.

- One source-family skeleton fingerprint: \`6e04c8293605f3e1d3f2599141922ffc9872c07f7339f97422fa2e56de9db4d9\`; real MakeHuman target fingerprint: \`66ecf6318f96d9bb2223969e09a9fa7ef09433b4022fc53fe7913c76cfc5ffc7\`.
- **21 mapped C1 physical joints** via the existing C6.2 anatomical retargeter, **one shared reference from Neutral_ID frame 282**, signed heading normalization quaternion \`[0,-0.9945172067069279,0,-0.10457306328041553]\`, and measured source-to-target unit conversion **0.011590607340570977**.
- Pre-cut T-like source candidate whole-body direction deviation (after *diagnostic-only* measured heading alignment): ID **0°**, FW **17.51°**, FR **20.17°**. These are not verified inverse-skin bind matrices; BVH has no source skinned bind matrix. C1 source wrist twist is still unverified. The *same* ID-family profile is used across all three actual animations, with no per-clip facing workaround.
- Five actual recorded frames per motion were checked for source/target angular end-effector link direction; maximum residuals were ID **2.77°**, FW **2.31°**, FR **3.15°**. These small errors reflect rigid skeletal link directions, not target skin deformation, hand pronation, planted soles, inverse-knee behavior or loop presentation.

| Source | Reviewer-only canonical ID | Original BVH frames | Duration | Worst retarget loop seam | Committed SHA-256 |
| --- | --- | --- | --- | --- | --- |
| \`Neutral_ID.bvh\` | \`human-100style-neutral-idle\` | 1279–1372 | 1.550031 s | 0.2683° | \`796e707afd170fa75ef58f3a4c75c00fe47ef8e34b29ef0d4045ae379c6f14fc\` |
| \`Neutral_FW.bvh\` | \`human-100style-neutral-walk\` | 601–682 | 1.350027 s | 3.5221° | \`60666a3d9e530fd4db6e082f76dc2d409a0f54260f4b7d79f4ceea334ec580c6\` |
| \`Neutral_FR.bvh\` | \`human-100style-neutral-run\` | 499–546 | 0.783349 s | 13.9584° | \`c959623919c958fcb21f679fbd4686e4edca7a2eb8cef0ec1d746606cf2f5969\` |

The Run loop seam **13.96°** is *especially* an unresolved quality concern; a successful numeric threshold does not make it smooth. Loops are selected from real capture frames via dense quaternion/velocity/vertical seam search, without reverse playback, fabricated sinusoidal motion or end-frame overwriting. Root world distance is retained in provenance; runtime only receives source pelvis height as visual-only Y offset, with gameplay authoritative actor movement.

Character Studio now exposes these three directly playable experimental skinned clips **only** when visited with URL query \`?c63-100style-review\`. The first four approved UAL1 entries and default movement mixer are unchanged. This review path is deliberately separate from the unaccepted KayKit opt-in. The clip manifest sets \`acceptedForProduction:false\`, and tests verify exact SHA-256s, single 21-joint calibration, isolation from default menus, animation-sampler validity and deterministic pose reset. The existing C6.3 source workflow has additionally been extended with a desktop/touch Chromium matrix to screenshot three motions from four camera directions and four MakeHuman body presets; this browser gate must be checked for an exact passing branch SHA before owner visual acceptance.

**Outstanding:** independent visual source-skeleton versus skinned target comparison, wrists and toes, biomechanical bend-plane and ground-contact testing across whole cycles, actual review of all Chromium screenshots, final verified SHA Netlify draft preview, owner approval, any longer-C6.3 locomotion integration. These experimental clips are **not promoted** to replace UAL1. No merge or Cloudflare deployment is authorized.
