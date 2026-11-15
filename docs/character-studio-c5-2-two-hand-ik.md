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
