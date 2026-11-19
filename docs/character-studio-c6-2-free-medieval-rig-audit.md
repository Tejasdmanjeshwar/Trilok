# C6.2 — Four $0 Kevin Iglesias medieval animation packs: actual FBX skeleton compatibility

**Audit date:** 2026-11-19. **Status: archives acquired, representative FBX skeletons inspected; NOT retargeted or rendered on MakeHuman.** Owner explicitly requested a *free-only* comparison. This is a **source compatibility audit**, not animation implementation or a live preview.

Verified offline GitHub Actions audit: [run #44458137224](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44458137224). The initial successful download-only probe was [#44456824402](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44456824402). Acquisition/inspection scripts: `scripts/audit-free-medieval-motion.py`, `scripts/audit-medieval-fbx-rigs.py`. All archives were fetched through the publisher's official, free itch.io flow in **temporary runner storage** and deleted before job completion. **No source FBX, extracted animation keys, textures, rig transforms, download cookies or proprietary binary archives were committed or uploaded as artifacts.** No public browser distribution has been authorized or attempted.

## Verified downloads (selected FBX ZIP variant, not Unity package)

| Pack | Official free download | ZIP bytes | SHA-256 | FBX entries |
| --- | --- | ---: | --- | ---: |
| Human Archer | https://kevdev.itch.io/human-archer-animations-free | 17,054,887 | `87565026f3a3b0aa8aeaadbcc155533ee58d927f5c443a6b2a11f396a461c904` | 142 |
| Human Melee | https://kevdev.itch.io/human-melee-animatons-free | 13,524,662 | `bcd47d323e40419d4dda188d51bd5d91021e6ca42d8dc0c30f1e5053401244f5` | 102 |
| Dwarf Melee | https://kevdev.itch.io/dwarf-melee-animations-free | 20,554,297 | `735bd248eeb00e90a258b79a5ca8f1618a91c0393f4c117bc6e63a02b4bb9446` | 98 |
| Human Throwing | https://kevdev.itch.io/human-throwing-animations-free | 14,543,364 | `0d04fca026bd870c0348566e8c3e17208ab0de1593e38c5bf337e2598857f1cf` | 110 |
| **Total** | | **65,677,210** | | **452** |

FBX entry counts include some equipment/prop files, not necessarily 452 distinct character action clips. Packs contain male/female and motion/transition variants. Download pages have two upload variants; the acquisition script now validates ZIP magic instead of choosing an unstable first upload, which may be a Unity package.

## Actual rig inventory (representative clips from each pack)

| Pack | Sample skeleton bones | Finger joints | Identical core anatomy across packs? | Distinct calibration needs |
| --- | ---: | ---: | --- | --- |
| **Human Archer** | 56 | 30 (15/hand) | Shared human skeleton | Human male/female rest defaults differ |
| **Human Throwing** | 56 | 30 (15/hand) | **Exactly same 56 joint names, parent links and model local-transform fingerprints as Archer for matching sex**, in sampled files | Can reuse Archer's sex-specific source profile if bind-pose checks pass |
| **Human Melee** | 56 | 30 (15/hand) | Same 56 names; **55/56 bone parent links match Archer; the difference is `bRoot` attached to external `rig` instead of scene root.** All joint-local model property fingerprints also match the corresponding Archer male reference **except `bRoot`** | Normalize this root attachment and verify global rest; rest of human mapping/calibration potentially reusable |
| **Dwarf Melee** | 75 | 30 (15/hand) | **Same 56 humanoid bone names plus 19 auxiliary bones:** beard (7), cape (6), hair (6) | Different body proportions; separate dwarf male/female calibration; explicit policy for unmapped auxiliary hair/beard/cape |

Examples actually inspected include male/female idles; female `BowIdle01`, `Attack1H01_L` and `ThrowBall01_R - Hold`; and backward running. Each sampled animation FBX contained an animation stack and a structural bone hierarchy. Sampled clip evidence does **not** imply every FBX was individually parsed or that its motion is natural/visually reviewed.

### Core humanoid structure

Observed source bone names include `bRoot`, `bHips`, `bSpine`, `bChest`, `bNeck`, `bHead`, `bJaw`, bilateral `bShoulder*`, `bUpperArm*`, `bForearm*`, `bHand*`, `bThigh*`, `bShin*`, `bFoot*`, `bToe*`; each side has three phalanges for thumb, index, middle, ring and pinky. `bSpineProxy` and `bHandPropL/R` also occur.

These are **not identical to C1 MakeHuman joints**. The source has three thumb bones per hand whereas C1's default thumb has two, and the source `bHandProp*` joint is not automatically equivalent to the canonical palm joint. C1's additional ankle/foot/toe semantics and CC0 shoulder/forearm skin helpers need an explicit chain/passive-joint policy. Left/right suffix semantics must be checked against actual normalized world positions, not assumed.

The FBX versions sampled are 7300 (Archer and Throwing), 7700 (Human Melee) and 7300 (Dwarf animation files). Import adapters need to support both binary formats and proper FBX pre/post rotations and geometric transform rules.

### Proportion evidence

Raw FBX model local translation lengths differ substantially:

- Male Human: `bHips` Y ~97.971, `bShinL` translation length ~41.223, `bForearmL` ~23.414, `bUpperArmL` ~20.158.
- Male Dwarf: `bHips` Y ~70.655, `bShinL` ~29.777, `bForearmL` ~18.700, `bUpperArmL` ~21.350.

The dwarf shin is approximately **28% shorter** than the human source, while the upper-arm segment is approximately **6% longer**. Thus a single uniform skeleton scale factor will not reproduce realistic hand/foot positions. A calibrated per-chain length/morphology policy is needed. Units must still be normalized from FBX `GlobalSettings` and actual bind matrices before metrically comparing with MakeHuman.

## Retargeting verdict

**All four require retargeting into Trilok's MakeHuman/C1 rig. None can be played directly as calibrated canonical C1 animation tracks.**

The good architectural opportunity is:

1. Create **one Kevin humanoid semantic bone-map family** for the 56 common joints (including independently mapped 15 digits per hand), with source importer and hierarchy validation.
2. Maintain separate **male/female rest-pose calibration profiles**; the sample male/female model local transforms differ on the majority of joints. Archer/Throwing appear interchangeable within the same sex. For Human Melee, first normalize/verify the `bRoot` difference rather than adding clip-specific corrections.
3. Create **dwarf-specific male/female calibration profiles** sharing the 56-joint semantic map but using own rest transforms and per-chain proportions. The 19 beard/cape/hair joints have no direct C1 skin weights: reject or explicitly ignore as *unmapped source-only secondary anatomy* for canonical humanoid motion, unless a matching target archetype adds the correct extensions.
4. Bake clips through the existing universal quaternion/auxiliary-reference rig retargeter to `AnimationClipV1`. Do **not** adjust individual archery or melee clips to repair bone coordinate axes.
5. Add generic C5 bowstring/grip and C6.3/C6.4 foot/weapon contact constraints after retargeting. The extracted archer animation is not by itself proof of accurate bow-hand contact.

### Important inspection limits

This audit reads **FBX Model local properties and name/parent connections**, not all inverse bind matrices, FBX constraint stacks, sampled animation curves, full geometric skin deformation or rendered frames. Consequently:

- Rest fingerprints indicate structural compatibility, **not verified equivalence of the true deformer bind poses**; inspect `Pose::BindPose`, FBX axis/rotation order, unit conversion, skin cluster transforms, and animation channels before authoring a final profile.
- No complete source-to-MakeHuman quaternion calibration or retargeted animation was generated during this audit.
- No Cloudflare SHA-verified animation preview was produced. PR #112 remains draft pending the established preview, deterministic and visual gates.
- License: The original publisher permits games to use some assets but restricts standalone/extractable animation redistribution. **Do not publish these FBX clips, animations as downloadable canonical JSON, or raw source asset archives through Trilok Character Studio until the exact license is confirmed to allow it.** Keep the existing CC0 Quaternius animation baseline independently available.

**Recommended first follow-up:** With exact licensing approval and a functional branch preview, implement the Kevin humanoid FBX importer and one calibration for Archer/Throwing same-sex clips. Validate two *different* clips (e.g. bow hold and thrown weapon) using that one profile and the actual MakeHuman skinned character. Then normalize Human Melee root, followed by Dwarf proportions and auxiliary-bone policy.
