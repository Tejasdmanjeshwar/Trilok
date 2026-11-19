# C6.2 — Acquired animation sources and ingestion gate (2026-11-18)

## Verified acquisition

Acquisition ran in [GitHub Actions #44360056543](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44360056543) on C6.2 draft branch. Source archives were retained as **temporary workflow artifacts**, **not committed to Git**. Artifact: `c6-2-motion-source-probe` (7-day retention). Archive contents and SHA-256 values were checked from downloaded ZIP bytes.

| Source | Downloaded | ZIP bytes | ZIP SHA-256 | Verified content |
|---|---|---:|---|---|
| Quaternius Universal Animation Library 1 **Standard** | Yes | 15,904,933 | `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724` | `UAL1_Standard.glb` and root-motion variant, FBX; in-archive `License.txt` **CC0 1.0** |
| Quaternius Universal Animation Library 2 **Standard** | Yes | 18,735,003 | `4008ea208a604773a2b2177d965f0f5d3195498b5bf838c3f5785d68e95f2a68` | `UAL2_Standard.glb` and root-motion variant, FBX, mannequin; in-archive `License.txt` **CC0 1.0** |
| ACCAD quickwalk BVH | Yes | 181,817 | `5d6093360ace16d873f96c43be822bd88ea09e8a7f65b3e9df78b9f4be174e3c` | `eric1.bvh` |
| ACCAD female BVH collection | Yes | 5,171,377 | `84543297a24fe9900449675837b5b7758c5208d0f56b699d10a3eb362a46530a` | 81 BVH clips including stand, sway, run and sidestep |

Source URLs: [UAL1](https://quaternius.itch.io/universal-animation-library), [UAL2](https://quaternius.itch.io/universal-animation-library-2), [ACCAD motion lab](https://accad.ohio-state.edu/research/motion-lab/mocap-system-and-data). The itch.io download flow requires a short-lived signed URL; do not check it into source.

**100STYLE:** Verified [Zenodo record metadata](https://zenodo.org/records/8127870), including `100STYLE.zip` at **1,468,515,354 bytes** and separately a 14.75 GB labelled archive. The [100STYLE retarget BVH](https://github.com/orangeduck/100style-retarget) archive returned HTTP 200 with **4,675,218,694 bytes**. Neither multi-GB archive was downloaded. Data terms are distinct from any noncommercial sample character mesh; do not import the Geno model into proprietary Trilok.

## Recommended first integration

1. Use the **non-root-motion** `UAL1_Standard.glb` for idle/walk/jog/sprint. UAL2 provides supplementary combat actions. Treat their mannequin skeleton as a **source skeleton only**, not a second gameplay or Studio rig.
2. Create a deterministic **source-glTF/bind-to-canonical-C1 mapping**, including rest orientation, axis conversion, left/right, joints, unit scale, fingers, and separate semantic vs skin-only shoulder/forearm helpers. Bake to the existing `AnimationClipV1` contract. Do not copy simplistic Euler curves from C6.2.
3. Apply animation through the **existing calibrated anatomical FK, shoulder and forearm presentation helper, and corrective deformation pipeline**. Never bypass it with raw per-joint quaternion application as in the rejected C6.2 prototype.
4. Review the actual skinned human at all frames from side, front, rear and three-quarter; inspect hand distortion, foot sliding, root stability, pelvis balance, extreme morphs and memory/perf. Only then promote animations into the shipped Studio selection.
5. Compare ACCAD real mocap samples for realistic gait quality; integrate them only with verified license attribution and suitable source-clip processing. Large 100STYLE archives are optional and should be sampled on demand, not checked in.
6. Update THIRD_PARTY_NOTICES.md when real third-party clips are redistributed. Keep all current C5 pose, equipment, weapon/contact and combat authority invariants unchanged.

**Current release status:** Assets **acquired and hashes inspected**, **not retargeted, rendered or integrated**. C6.2 remains draft, visual acceptance failed; no PR merge or Cloudflare production deployment is implied.


**2026-11-19 status:** The formerly experimental UAL1 full-frame `source-anatomical` retarget is now the official four-clip Studio set after owner preview acceptance. Historical investigation of alternate source packs remains research, not an active dependency. See [C6.2 official library](character-studio-c6-2-baking-playback.md).
