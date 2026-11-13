# C3.5 scan-backed head replacement — source and integration gate

**Status (2026-11-13): BLOCKED on acquisition and inspection of the exact scan files.** This audit is part of C3.5, **not** a new numbered subphase, acceptance, or permission to begin C3.6/C4. The existing mammalian C3.5 faces remain human-source morphs. No scan has been bundled or represented as the new head. This document intentionally makes no production-ready or visual-acceptance claim.

## Source-specific CC0 verification

| Required reference | Identified museum source | Rights evidence | Actual mesh suitability |
| --- | --- | --- | --- |
| Bonnet macaque cranium | Smithsonian NMNH, *Macaca radiata*, male, USNM **334797**, [cranium](https://3d.si.edu/object/3d/macaca-radiata-cranium%3A4437e090-6a07-49ea-9e86-862ff3fa9f8d) | Smithsonian item record explicitly marks **Metadata Usage: CC0** and media public domain | **Unverified:** downloaded model bytes, mesh components, normals, topology and anatomical fit have not been examined |
| Bonnet macaque mandible | Smithsonian NMNH, same *Macaca radiata* individual **USNM 334797**, [mandible](https://3d.si.edu/object/3d/macaca-radiata-mandible%3A3c52a05e-e7fa-441e-ad64-012213802891) | Smithsonian item record explicitly marks **Metadata Usage: CC0** and media public domain | **Unverified:** available full-resolution PLY is described in millimetres; skull-to-jaw registration not tested |
| Brown bear skull | University of Dundee D’Arcy Thompson Zoology Museum, *Ursus arctos*, **DUNUC 2030**, [museum record](https://app.dundee.ac.uk/museum/collections/zoology/zoology3d/brownbearskull/index.html), [Sketchfab model](https://sketchfab.com/3d-models/brown-bear-skull-e01dc94d20df4b888c7a6979bffb45a9) | Dundee's [Open Access — CC0 Public Domain collection](https://sketchfab.com/uod_museums/collections/open-access-cc0-public-domain-3b3ffee70cc04e01952dd6803b366074) lists this bear skull. **Model file/embedded textures must still be verified after acquisition.** | **Unverified:** Dundee states 43 cm skull length, Artec Eva scan/OBJ export, but mesh bytes have not been downloaded or inspected |

Do not conflate a different Smithsonian macaque specimen with the matching USNM 334797 cranium/mandible pair. The Dundee scan is skeletal anatomy, **not** a ready-to-rig bear head or an external fur/skin mesh. The material/texture of a scanned skull is not appropriate exterior facial material.

### Access blocker

The museum's Dundee link embeds a Sketchfab asset. [Sketchfab's documented Download API](https://sketchfab.com/developers/download-api/downloading-models) requires an authenticated Sketchfab account and returns a short-lived authorized archive URL; anonymous API access cannot be assumed. No linked credentials or authenticated download capability was available to inspect and bundle this exact file in this session. Smithsonian catalogue pages list full-resolution PLY, but actual mesh files have not been obtained in the current execution environment. **No unverified mirror, invented mesh, screenshot-derived reconstruction, or generic bear stand-in should be labeled as these scans.**

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
