# C3.5 scan-backed head replacement — source and integration gate

**Status (2026-11-13): SCAN ACQUIRED; registration, seam and rendered acceptance still open.** This audit is part of C3.5, **not** a new numbered subphase, acceptance, or permission to begin C3.6/C4. The existing mammalian C3.5 faces remain human-source morphs. No scan has been bundled or represented as the new head. This document intentionally makes no production-ready or visual-acceptance claim.

## Source-specific CC0 verification

| Required reference | Identified museum source | Rights evidence | Actual mesh suitability |
| --- | --- | --- | --- |
| Bonnet macaque cranium | Smithsonian NMNH, *Macaca radiata*, male, USNM **334797**, [cranium](https://3d.si.edu/object/3d/macaca-radiata-cranium%3A4437e090-6a07-49ea-9e86-862ff3fa9f8d) | Smithsonian item record explicitly marks **Metadata Usage: CC0** and media public domain | Acquired and audited: 750,000 triangle ASCII PLY, 372,999 exact-welded vertices; 320 boundary edges, 0 non-manifold edges; landmark boxes measured. Detailed manual eye/nasal validation still open |
| Bonnet macaque mandible | Smithsonian NMNH, same *Macaca radiata* individual **USNM 334797**, [mandible](https://3d.si.edu/object/3d/macaca-radiata-mandible%3A3c52a05e-e7fa-441e-ad64-012213802891) | Smithsonian item record explicitly marks **Metadata Usage: CC0** and media public domain | Acquired and audited: 241,727 triangle ASCII PLY, 120,332 exact-welded vertices; 243 boundary edges, 0 non-manifold edges. Condyle-box registration is approximate, not final anatomical fit |
| Brown bear skull | University of Dundee D’Arcy Thompson Zoology Museum, *Ursus arctos*, **DUNUC 2030**, [museum record](https://app.dundee.ac.uk/museum/collections/zoology/zoology3d/brownbearskull/index.html), [Sketchfab model](https://sketchfab.com/3d-models/brown-bear-skull-e01dc94d20df4b888c7a6979bffb45a9) | Dundee's [Open Access — CC0 Public Domain collection](https://sketchfab.com/uod_museums/collections/open-access-cc0-public-domain-3b3ffee70cc04e01952dd6803b366074) lists this bear skull. **Model file/embedded textures must still be verified after acquisition.** | **Unverified:** Dundee states 43 cm skull length, Artec Eva scan/OBJ export, but mesh bytes have not been downloaded or inspected |

Do not conflate a different Smithsonian macaque specimen with the matching USNM 334797 cranium/mandible pair. The Dundee scan is skeletal anatomy, **not** a ready-to-rig bear head or an external fur/skin mesh. The material/texture of a scanned skull is not appropriate exterior facial material.

### Source acquisition and audit (2026-11-13)

Both supplied files were retrieved from ChatGPT Library `/Trilok/Anatomical References/` and materialized for *offline geometry analysis*; source scans are not committed as runtime assets.

| Artifact | Exact SHA-256 | Input size | Measured topology |
| --- | --- | ---: | --- |
| Cranium archive `USNM334797_cranium_-600_dec.zip` | `6f0d0e9a128cfd2671a417d8f379be6fd0c347bf79c85e94a69f6a19cabdef3a` | 33,221,364 bytes | wraps a 151,710,569-byte ASCII PLY |
| Cranium PLY `USNM334797_cranium_-600_dec.ply` | `11492e50f9ad9593d5437d9cffaeaf825fd14311f639b3f5506437aed1b8b81e` | 151,710,569 bytes | 750,000 triangles, 2,249,996 export vertices; 372,999 unique coordinates after exact welding |
| Mandible PLY `USNM334797_mandible_-400.ply` | `9b5ea19a9e92bad1f2026f9f7e1eaeeb599bd77ddc289d7ce5eeba33f6db91dc` | 48,153,719 bytes | 241,727 triangles, 725,181 export vertices; 120,332 unique coordinates after exact welding |

Both are ASCII triangle-soup exports (nearly three duplicated vertices per triangle). Exact coordinate welding yields **zero edges with more than two incident faces**, but 320 (cranium) / 243 (mandible) open boundary edges. No faces of near-zero area below 1e-5 square millimetres were detected. These are anatomical scan references, **not runtime geometry**. Note the in-file `Blender 2.80` conversion comment is export metadata; Trilok does not require Blender. The files themselves do **not** declare a linear unit: measurements here assume millimetres based on specimen dimensions, not a proven scanner calibration.

The cranium's bounds are approximately **75.392 × 61.254 × 110.415 mm**, with native axes left-right X, cranio-caudal Y and anterior +Z after visual assessment. Estimated source-space landmark proxies (mm): crown (-1.563, 29.150, -14.352), occiput (-0.593, -13.960, -51.829), rostrum (-2.130, -3.323, 51.242), zygomatics (-35.303, -15.137, -9.163) and (+35.090, -13.719, -6.008), orbital proxies (-11.075, 23.349, 13.411) and (+15.377, 22.686, 11.454). These are medians of source-coordinate selection boxes rather than expert hand-annotated point positions. The upper dental and nasal rim positions require further manual inspection.

The mandible is a separate local frame; a preliminary paired condyle-box proxy translation of approximately **(-1.009, -26.892, +13.113) mm** puts it in a plausible jaw-closed pose. This is **not** anatomical condylar registration, rotational ICP, or final occlusion verification. Its expected positional error may exceed several millimetres.

A normalized 21-station lateral and sagittal *skeletal* envelope derived from both scans is retained in `VanaraScanCalibration.ts` with the specimen identity, exact PLY SHA-256 values, landmark-box proxies and source dimensions. `VanaraHeadGeometry.ts` consumes this envelope for low-poly width, sagittal depth and center profiles; soft tissue, ears, skin colour and eyelids remain procedural designs, not measured skull data. The runtime does not fetch or package either museum mesh.

## Mandatory asset-acceptance checklist before geometry replacement

1. Acquire the **exact** museum-provenance files through their authorized distribution channels. Record source object IDs, canonical URLs, retrieval date, CC0 statement, original filenames and SHA-256 hashes. Document redistribution rights for embedded textures separately; do not include scan photographs unless permitted and needed.
2. Inspect and report scanner coordinate units (Smithsonian PLY is identified as millimetres; confirm Dundee OBJ scale rather than guessing), handedness, bounds, face winding, missing data, open boundaries, self intersections, disconnected pieces, and whether cranium/mandible share a frame. Compare Dundee's reported **0.43 m** length after unit conversion.
3. Extract reproducible anatomical landmarks from the **actual** scans: occipital/crown, orbital rim centres, zygomatic width, nasal aperture, maxillary projection, mandible condyles, dental arc and chin. Keep skull and soft-tissue geometry conceptually distinct. Record measured scan ratios and any authored stylization offsets.
4. Build genuine **species-specific external head topology** from those landmarks (not a MakeHuman human face with larger protrusions): continuous muzzle-to-cheek and nostril-bearing nasal pad for macaque; deeper bear muzzle, broad rhinarium, skull/cheek contours and short round ears; separate movable jaw, upper/lower lips and oral cavity; accurately placed eyes and ears. No literal exposed skull on the finished character. Ensure neck interface is watertight or validate explicit seam overlap and normals.
5. Preserve the humanoid rig's canonical C1 IDs, jaw and neck motion, four-weight normalization, versioned deterministic recipes, source body UV/skin ownership, C2 human mode, and all combat authority contracts. Change head-family *surface* semantics explicitly rather than claiming identical head connectivity when faces are replaced. New geometry must have an owned lifecycle and be disposed when presets change.
6. Automated tests: provenance/hash, scale/orientation, manifold and zero-area checks, landmark ordering, vertex normals/UV/weights, matched cranium/mandible pose, jaw-open neutral recovery, skinning extremes, deterministic rebuild/hash and disposal. Browser evidence: paired **front, three-quarter, side, jaw-open** views of both families plus neck transitions, desktop/touch camera continuity, and body extreme coupling. Reject obvious human nose/face remnants or hidden geometry intersections.
7. Run Fast Verify at the exact PR SHA, inspect required statuses, and merge **only after** passing CI and actual rendered anatomy review. Owner must then inspect the deployment separately before marking Issue #41 C3.5 visually accepted.

## Current repository limitations

- `MammalianHeadDeformation.ts` and `MammalianFaceAnatomy.ts` deform the pinned MakeHuman head's original indices. Skin weights, UVs and the underlying C2 source topology remain shared. The graph's `head_primate_v1`/`head_bear_v1` labels are **not evidence** that zoological topology is installed.
- C3.5 tests currently verify bounded offsets, color/nose/jaw fields, C1 identities and replay compatibility; they do **not** establish scan-based geometry or credible zoological silhouettes.
- The existing C3.5 candidate must not be marked accepted; no claimed direct scanner data, no scan-backed code path and no release of C3.6/C4.

## Experimental candidate implementation on PR #48 (not final C3.5)

A **new independent procedural head topology** is integrated in the primate-only
morphology path in `VanaraHeadGeometry.ts`. It creates a versioned-recipe-driven
macaque-inspired outer cranium, broad buccal cheeks, projecting muzzle, recessed
bilateral nostrils, lip/oral crease, orbital relief, eyelid pigmentation,
lateral ear fields, and two skinned eye globes. Instead of projecting the human
nose, it removes render triangles of the original human head above a calibrated
neck cut. It reuses existing head and jaw semantic skin bones and keeps the
original C2 body's vertex attributes and weights. The bear keeps the legacy
experimental morph and is deferred to C7. A separate C3.5 test checks generated
vertex attributes, skinned influences, face degeneracy, C1 jaw articulation,
and deterministic rebuild output.

**Not scan derived:** The current dimensions are authored, stylized procedural
ratios, NOT measurements extracted from Smithsonian skull meshes. The real
specimen files have not yet been acquired, checked or imported. This candidate
is a bounded evaluation of genuine new topology, **not completion** of the
request to use the Smithsonian skull/mandible as anatomical foundations.

**Not continuous at neck:** The new species-specific head is a separate
closed skinned mesh whose lower ring overlaps the retained C2 neck surface.
It is not yet a welded, manifold whole-body mesh, nor does it demonstrate
final UV/texture, fur, lip interior, external ear folds, tongue or dentition.
A cap and detached eye-globe components are intentional preview choices.
The required acceptance gate must include overlap, neck rotation, jaw open,
3/4 silhouette, cranial/mandibular anatomy, geometric defects under extremes,
and actual screenshots. In particular a separate mesh is not a claim of
single-piece topology.

**No release promotion:** do not mark C3.5 accepted, merge, or open C3.6 based
on a successful unit suite. Confirm exact source suitability and visually
verify species anatomy first. The existing `docs/character-studio-c3-5-mammalian-heads.md`
documents the previously merged legacy candidate; this audit supersedes it
for the new Vanara replacement.

### Subsequent implementation on PR #48 — scan-calibrated candidate

The head profile now uses the scanned specimen envelope rather than unrelated authored cranial ring widths. The generator records `sourceCalibration: USNM334797-bonnet-macaque-envelope-v1`, compares generated triangles against the number of source human-head triangles removed at the actual neck cut, and rejects any shape above **130%**. An automated test covers the pinned scan constants and the live generator budget.

**Outstanding acceptance blockers:** accurate orbital/nasal/maxillary point annotation, reliable rigid cranium-to-mandible joint registration and bite alignment, watertight or explicitly validated C2 neck interface, credible jaw-open lip/oral cavity geometry, extreme skinning / replay, actual desktop and touch rendered screenshots, and owner visual acceptance. The current separate head **overlaps**, rather than welds to, the retained neck. The scan's bone geometry cannot substitute for a finished skin surface. Fast Verify and browser acceptance on the new PR head must be separately checked. This candidate is not final C3.5 and must remain a draft until resolved.

### 2026-11-13 focused anatomy and seam follow-up

- A constrained **rigid** minimal-rotation alignment from the matched left/right condyle and cranial-joint ROI proxies is implemented in `VanaraScanRegistration.ts` (instead of applying only a translation). The left/right proxy baselines differ by about 2.05 mm, so the best rigid fit has **~1.02 mm per-condyle residual**; the rotation is approximately **4.68°**. Two condyle points cannot constrain rotation about the intercondylar axis or prove dental occlusion. The fitted mandibular symphysis and condylar midpoint now drive the Vanara mouth-level and jaw-following weight envelope. **This is not a fully validated cranium/mandible articulation.**
- The **C2 retained neck's actual source-index boundary** is extracted after the anatomy-preserving head cut. The new head's first ring copies the retained C2 positions and four bone influences, with a smooth transition toward head/jaw ownership. C2 vertex identity, original UVs, body skin weights and canonical C1 bones remain untouched. The replacement no longer contains the earlier redundant bottom cap. Head/body seam vertex colours and normals are matched at rest and faded into the new face to prevent a conspicuous shading collar.
- The generated head remains a **separate skinned mesh**. Position, colour, normal and CPU skinning correspondence under head/neck FK are covered by tests, but this does **not** prove a single globally manifold welded body/head mesh. The C2 cut must be inspected visually, including neck rotation, jaw-open and extreme morphology poses.
- The generator sizes its low-poly ring count to the actual C2 neck contour and enforces `generatedHeadTriangles <= measuredRemovedHumanHeadTriangles * 1.30` for each instance. No Smithsonian high-poly mesh is shipped. A single `VanaraScanCalibration.ts` stores specimen shape data and hashes; unused duplicate source definitions were removed.
- Automated coverage includes source landmark identity, bounded envelope, rigid jaw transformation residual, deterministic generator output, four-influence normalization, non-degenerate faces, FK-stable neck positions, colours/normals, and CPU skin correspondence.

**Still not accepted:** true occlusal/dental registration and jaw joint pivot validation, complete mouth aperture/inner oral topology, anatomically credible skin/muzzle/ear and eyelid shapes, no-hidden-intersection evidence, browser front/three-quarter/side/jaw-open screenshot review, desktop/touch camera validation, measurable frame time and GPU resource stress tests, and owner Character Lab sign-off. CI passing is not equivalent to render quality. Keep PR #48 draft/unmerged; bear remains C7 and C3.6/C4 are not started.
