# Character Studio C5.2 — Two-Handed Greatsword and Staff Grip

## Scope and source

This C5.2 review candidate extends merged C5.1 on `main` at `5549de6cef8db6a6443e9a95075de23f1f2d9840`. The 2026-11-15 owner screenshot rejected the first version: both elbows were raised and crossed across the head, and a sword/staff appeared pinched between the wrists. Although that version met a numerical two-palm residual, **the render was not a valid grasp**. It remains unmerged in [PR #84](https://github.com/Tejasdmanjeshwar/Trilok/pull/84).

The pinned MakeHuman skeleton, mesh and source skin weights are the anatomical ground truth. Official MakeHuman pose files are BVH poses, not a built-in weapon-grip IK or anatomical contact solver: [pose-authoring reference](https://www.makehumancommunity.org/assets/creatingassets/faq/how_can_i_create_poses.html). No unlicensed pose, external DCC asset or replacement rig is added.

## Corrected architecture

- Reuse **one source-calibrated AnatomicalFK**, existing finger flexion/opposition/spread, shoulder source-skin correctives and source semantic `primary_grip` / `secondary_grip` sockets. Never change combat-domain timing, damage, projectile authority, root motion or C5.1 single-hand grips.
- **Distinct authored resting stances:** a low, wider shaft guard for the staff and a higher, diagonal greatsword-ready guard. Both come from legal source-relative shoulder/elbow/forearm/wrist degrees of freedom, not a world-space Euler hack. Staff and greatsword no longer share the overhead symmetric arm pose.
- **Weapon-specific geometry:** staff grip zones follow separated palms on a long continuous shaft. The greatsword reference deliberately uses an **extended, two-hand hilt**, rather than the short C5.1 sword handle. A sampled search over the source FK demonstrated that the compact 11 cm hilt was not reachable with safe low elbows in the tested mirrored family of source poses. Do not falsely label it an ordinary short-hilt longsword or claim all poses impossible.
- **Small corrections after the authored pose:** calibrated forearm pronation aligns the knuckle lines with the weapon axis; a bounded offhand adjustment refines the support-hand contact; bounded wrist/forearm corrections minimize the remaining opposed grip-axis error. The primary-hand socket determines the rigid weapon transform and the opposite socket supplies the contact constraint. No second rig and no speculative whole-body motion.
- **Anatomical safety:** reject poses with forearm centerlines passing near the head, elbows or palms raised toward it, insufficient forward grasp, or left/right forearm centerlines overlapping. An unreachable case restores the base pose and does not attach a floating weapon.
- Fixed search step sizes, finite native joint limits, and no frame-time updates make the pose reproducible and bounded. Existing scene/morphology rebuild and disposal lifecycle are reused.

## Verification

Real pinned MakeHuman source-rig tests check both handedness choices, hand-scale/height morphology variants, repeatable commands, root invariance under movement, socket identity, actual primary/secondary weapon contact coordinates, all existing Studio pose selections, neutral restoration and head/forearm safety envelopes. Crossguard/fingertip surface-to-surface contact and production art quality are **not** certified by palm-frame distances alone.

The reworked source-rig candidate before the last extra guard checks was measured in Verify #43682906063 (successful, 69 test files plus typecheck/build):

| Reference | Offhand residual | Opposed grip-axis dot | Highest elbow, world Y | Highest palm, world Y | Head joint, world Y |
| --- | ---: | ---: | ---: | ---: | ---: |
| Long-handled greatsword | 6.54 mm | 0.626 | 1.448 m | 1.500 m | 1.709 m |
| Staff | 4.90 mm | 0.796 | 1.354 m | 1.373 m | 1.709 m |

These are geometry measurements on the default source rig, not visual acceptance. Root, hands, fingers and upper-arm visual deformation still require close-up inspection. The Playwright tests capture **whole-body and focused desktop/touch screenshots** for both weapons and either lead hand, as well as a source-body regeneration; in accordance with the existing CI policy they run through manually invoked Phase Acceptance, not automatic PR Verify.

**Status:** rework in progress on PR #84; do **not** merge or claim completion without latest-head Verify, a rendered preview checked against the owner-reported failure, and owner approval. C5.3, combat presentation migrations, Save/Load and baking remain excluded.
