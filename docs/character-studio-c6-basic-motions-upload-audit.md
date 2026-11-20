# C6 — Human Basic Motions FREE: user-uploaded FBX vs Unity package audit

**Status:** Original user-uploaded archives directly inspected 2026-11-20; **rig compatibility established, not retargeted or rendered on MakeHuman**. This is source-intake evidence, not a public runtime asset, animation quality acceptance, or deployment.

Source publisher: Kevin Iglesias. Source product: [Unity Asset Store Human Basic Motions FREE](https://assetstore.unity.com/packages/3d/animations/human-basic-motions-free-154271); alternative independent FBX distribution: [Basic Motions FREE](https://kevdev.itch.io/basic-motions-free). Cross-reference the previously downloaded source-rig evidence in [C6.2 four-pack audit](character-studio-c6-2-free-medieval-rig-audit.md).

The user supplied two distinct files to a ChatGPT conversation; the **attached files are not in GitHub and are not committed or distributed by this audit**. The raw FBX and Unity package remain private conversation inputs.

## Verified file identities and contents

| Uploaded file | SHA-256 | Format | Content |
| --- | --- | --- | --- |
| `Human Basic Motions FREE.zip` | `063d5e1822f85549d14035ef342b1feae45bac37962499a8b478c7eb997200cd` | ZIP, 16,657,270 bytes | 120 FBX files: **118 animation FBX + 2 model FBX**; 58 male clips, 58 female clips, 2 masked static hand poses; embedded creator PDF, texture and ZIP containing two Blender source files |
| `Human Basic Motions FREE Unity.unitypackage` | `dd5aaf1dfcb7cb907945190acbc6d34aa1be40d0ef38e7cf0cd86f2918d74339` | gzipped Unity TAR, 15,902,319 bytes | **118 animation FBX**, 2 models and one additional demo-scene FBX, plus Unity scripts, animation controller, avatar masks, materials, textures, scene and sample prefabs |

The creator's included `Human Basic Motions 2.4 FREE.pdf` lists exactly **118 animation files**, counting male/female, direction, root-motion and transition variants. It describes two additional static masked hand poses: `HandsClosed01` and `ObjectGripHands01`. Its stated terms are **Standard Asset Store EULA; royalty-free commercial use; resale not allowed**; see the PDF and the publisher's linked [license page](https://www.keviniglesias.com/#license). This is not blanket permission to publish raw or trivially extractable animation files in the browser or export them via Character Studio. Confirm redistribution boundaries before any public bake/deploy.

All binary FBX files were inspected via a bounded metadata-only reader: **120/120 ZIP FBX parsed**; **121/121 Unity-package FBX parsed**. Of the 120 overlapping FBX paths, **none is byte-identical across formats**, although all 118 animation paths exist in both; this is expected because the distributions have distinct FBX versions and root bindings, not proof of different authored motions. The Unity package has **one extra demo-scene FBX**, not an extra basic-motion animation.

## Rig identities — exact match to previously audited Kevin libraries

For the **118 animation FBX files in each upload**:

- **56 animated skeleton bones**, including **30 finger joints** (15 per hand: three per thumb, index, middle, ring, pinky), consistent across all sample clips and sexes.
- **One FBX animation stack per file.** The regular ZIP has 504 curve nodes / 168 curve groups per animation file; the Unity version has 513 curves / 171 groups per animation file. This difference requires FBX channel/root evaluation before assuming track equivalence.
- The default male and female rest-pose transforms differ; maintain sex-specific profile calibration. All 58 male animations in each version share their respective rest signature; similarly all 58 female animations.
- Both files declare **FBX Z-up**, front axis Y with negative sign, `UnitScaleFactor = 1.0`. Do not interpret raw translations as C1 meters until the importer has applied correct FBX unit/axis conversion and checked bind matrices.
- An exact source Model name/parent/rest-property fingerprint match was computed using the **same normalization and six-decimal rounding** as the previous four-pack audit.

| This upload | FBX animation version | Root convention | Previous Kevin source family that matches |
| --- | --- | --- | --- |
| **Regular ZIP** | FBX **7700** | `bRoot` under scene root | **Human Melee FREE** — matches both sampled male/female 56-bone topology and rest-property hashes |
| **Unity package** | FBX **7300** for 118 animation files | `bRoot` parented to an outer `rig` object | **Human Archer FREE and Human Throwing FREE** — matches the corresponding male/female 56-bone topology and rest-property hashes |

Relevant fingerprints (computed using `scripts/audit-medieval-fbx-rigs.py` conventions already documented in the four-pack audit):

- **Regular ZIP animated skeleton topology:** `48f275b74d09908ab182e4ddf5c815b7a436915e85a024ecf27c038b76a23713`
- Regular ZIP male rest: `268a2349d66b0d7051c9ec331a8738b81dc74f09281038da062f78aabc988db8`
- Regular ZIP female rest: `cf2d7b6eb313a6f137bc94e7483c2888446095e99f047500681f8969a46e76ba`
- **Unity animated skeleton topology:** `37f7c01fc25d0f7be6fd163edc1f3e64a4d2cf2deca9beccb688d5c97041451a`
- Unity male rest: `6a4f0e4108c6b9b0a247abf38064d9ec8f173815de011147edf6d49fb476e8b0`
- Unity female rest: `7b8933725933d6cacbdd56cfa24c8e6be56e0092a04df57efb1099fee60f3841`

The two uploaded distributions therefore share a **single semantic humanoid mapping** with the previous free Kevin packs. They do **not** share an identical full FBX rest/root profile: the root normalization must be explicit. This comparison tests FBX Model hierarchy and local rest attributes, **not the actual clip orientation and bind-matrix/deformation equivalence**.

The separate model-only FBX files differ from animation FBX: in the regular ZIP they contain 55 limb nodes (56 source node attributes); Unity's model files may be optimized/re-exported differently. **Do not derive clip mapping by counting bones in the model-only FBX** without checking its skin cluster and bind pose.

## Specific clips valuable to Trilok

- **Basic locomotion:** walk/run in eight directions each, including separately labelled root-motion variants. Sprint in five directions, also with root-motion variants.
- **Transitions:** idle 01↔02, turning left/right (in-place and `[RM]`), jump begin/flight/land (with corresponding root-motion options), fall.
- **Social:** male/female talk.
- **Reusable hand poses:** hands closed and cylindrical object grip. They are static *masked* poses, not proof of bowstring, two-hand sword, or shield alignment.

This is primarily a **locomotion source**, not a medieval archery pack. The uploaded files contain no dedicated bow-nock, draw, aim or release motions.

## Compatibility decision

**YES — accept for offline source comparison and future retargeting.** The **regular FBX ZIP** is simplest for a no-Unity, Three.js build-time importer; the Unity package contains equivalent named animation content and different root/FBX packaging useful for verifying the root adapter.

The already-established **Kevin humanoid mapping** can be shared with Archer/Melee/Throwing/Basic Motions. Use a **versioned source rest-profile** for each actual rig/rest variant, with a normalizing root adapter for the 7300/7700 difference; do not create special per-clip Euler offsets.

**Target still requires conversion:** these 56-joint sources are not the actual MakeHuman/C1 target bind/skin rig. A robust offline FBX importer must parse full pre/post-rotations, per-channel rotation order, bind and cluster matrices, animation curves and source-axis normalization. Feed its normalized skeleton and clips through the current generic canonical retarget engine, and validate true MakeHuman skin deformation and source-fidelity views. `[RM]` translations remain presentation-only until authoritative movement explicitly consumes them.

### No public promotion without gates

1. Confirm exact license conditions for the contemplated browser/runtime output and user-exportable animation data.
2. Retarget **at least two untouched clips** (e.g., `HumanM@Walk01_Forward`, `HumanM@Run01_Forward`) with one calibrated profile, including explicit finger/hand stance and root normalization, and compare to source moving reference.
3. Validate full loops, arbitrary 3-axis rotations, foot contact and actual MakeHuman shoulder/forearm skin helpers, plus regression of static C5 grips and C6.2 approved UAL1 motion.
4. Produce a **working preview with exact deployed build SHA** before asking for owner visual acceptance. Do not merge unreviewed clips or change Cloudflare production in order to obtain a preview.

No retargeted assets, preview or quality claim were produced by this file-inspection-only audit.
