# C6.2 reference animation baking, locomotion revision and Studio playback

**Status:** Draft PR #112. Canonical JSON assets and SHA-256 manifest are generated and committed from a pinned GitHub Actions Node/Vite bake. This record does not assert browser visual acceptance, CI passage, or C6 phase acceptance.

## Production route
The source of truth for all three original, proprietary Trilok motion source definitions is
`packages/character-core/src/animation-library.ts`. This is a tightly scoped
TypeScript procedural source: no externally licensed mocap data, Blender binary,
or Python dependency is required in the public build. The manually dispatched
pinned Blender 4.5.16 workflow remains available for future offline source-pose
experiments, but is intentionally not added to normal Verify.

`node scripts/bake-reference-animations.mjs --write` uses the repository's pinned
Vite compiler to load the typed source in Node 22, maps semantic roles to C1
joint IDs, normalizes local XYZ quaternions against exact bind transforms,
validates the resulting C6.1 clips and emits canonical JSON and a provenance
manifest under `assets/animations/reference-v1/`. The manifest distinguishes
SHA-256 of serialized source parameters and emitted clip bytes from the
non-cryptographic canonical rig compatibility fingerprint.

`pnpm animation:verify` recomputes the outputs and compares every byte against
the checked-in files. Regeneration is intentional; never update expected
hashes to conceal a changed source. No C9 character Save/Load is added.

## References

- **Relaxed breathing:** 3-second loop with modest spine/chest and symmetric
  clavicle/shoulder motion; no root displacement.
- **Controlled forward step:** 2-second in-place staged left lead and opposing
  right-leg motion with pelvis/upper-body compensation. Foot locking and
  grounded stride authority remain C6.3 work.
- **Weapon-ready gesture:** 2.4-second upper-body/arm coordinated, in-place
  gesture returning to neutral. Reference only; no equipped sword grip IK or
  combat contact events are synthesized.

## Pose ownership
Studio static mode retains the existing C5 `StudioPosePreview` as the sole
FK/IK/corrective owner. Entering animation disables equipment display,
sets a clean neutral FK base, then creates `StudioAnimationPlayback` against
the existing semantic skinned human. Switching/seek/pause sample explicit
timestamps; no combat events. Exiting destroys the adapter and restores
the chosen static pose, equipment selection, and C5 corrections.
Regeneration destroys the old adapter before retiring the old skin and creates
one for the accepted new model. Failed model rebuild retains the old model.
Background suspension resets clock anchoring rather than simulating hidden time.

## Deliberate limitations
Exact bind identity is required. Morphologies that keep the same C1 graph
are not proof of universal retargeting; foot-ground, hand contact, and source
skin corrective behavior still require rendered audits. No inferred hit
events, weapon layering, C7 topology retargeting, dismemberment, or C9 export.
See C6.3 and C6.4 for grounded gait and weapon-aware layered IK.

## Baked artifacts and audit

Committed original motion clips at `assets/animations/reference-v1/` have respective byte sizes **2,442**, **5,941** and **5,143**. The exact output SHA-256 values are recorded in `manifest.json`; the ordinary PR Verify recomputes source/clip/manifest bytes and fails on differences. Studio's `StudioReferenceLibrary` imports the **baked JSON**, verifies the canonical rig before playback, and never needs Vite's SSR API in the browser. The existing C5.2 Blender workflow was inspected but not invoked or duplicated; no new third-party assets or packages were added.

Rendered desktop/touch evidence is tracked by the focused `e2e/studio-animation-c6-2.spec.ts` test and the existing manually dispatched `Studio Interaction Diagnostics` workflow with suite `animation` on the PR branch, one iteration per desktop and touch project; this avoids PR-triggered Chromium costs. Until those have succeeded and been reviewed, claims about the quality of step grounding or deformation remain unverified.

## Verification gate

The first draft PR Verify run exposed an explicit CI policy violation: automatically
installing Chromium inside fast `ci.yml` is prohibited. The two failures in
`tests/ci-phase-gating.test.ts` were corrected by restoring the fast Verify
workflow and extending existing **manually dispatched** Studio Interaction
Diagnostics (`suite=animation`, `iterations=1`). This is not full C6 Phase
Acceptance; the scope is three reference clips and two viewport projects.
Do not merge until the manual workflow completes and actual screenshots are
visually inspected. Keep the baseline policy tests unchanged.

## 2026-11-18 animation quality review and next acceptance gate

The owner rejected the former `relaxed-idle`, `controlled-step` and `ready-gesture` as visually implausible. These were implementation reference clips, **not approved polished animation**. They have been replaced in the draft feature branch by `human-idle`, `human-walk` and `human-run`, with deterministic cyclic joint-pose authoring, opposing limb coordination, stride/flight rhythm, toe/ankle motion and presentation-only root offsets. This replacement is still a **procedural reference**, not a verified motion-capture-quality asset; do not assert realistic planted feet, C6.3 gait IK, or visual acceptance until there is multi-angle browser evidence and direct owner review.

**Production asset research:** MakeHuman supports skeleton poses/BVH; its source plugins and Blender MPFB2 tooling permit BVH-based motion import, but do not constitute an independently validated commercial-quality animation library (see https://github.com/makehumancommunity/makehuman/blob/master/makehuman/plugins/3_libraries_pose.py). Blender can bake/export armature actions to glTF (https://docs.blender.org/manual/en/dev/addons/scene_gltf2.html), but no Blender binary was available in this execution environment. Adobe documents that its Mixamo animations can be used royalty-free in video games (https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html), subject to its product-specific restrictions. Mixamo download requires access to the hosted asset; no external animation download, rights verification at the file level, or third-party clip ingestion occurred in this revision. Do not claim that the current procedurally-authored clips were sampled from Mixamo or Blender.

**Quality gate:** Inspect front, rear, side and 3/4 video or screenshot sequences on the actual MakeHuman-skinned Studio human. Reject visible limb inversion, foot clipping/sliding, joint pinching, mechanical arm swing, unstable root bob, and unmatched walk/run speed. Before C6.3 promotion, use externally authored/licensed motion or a measured foot-contact + balance solver for any cases the handcrafted loops cannot satisfy. Keep combat authority and C5 grip recovery unchanged. The user-facing Studio must never call these clips polished or AAA until actual evidence exists.
