# C3.5 — Hanuman STL facial-reference acceptance audit (2026-11-13)

**Status:** reference audited for design use; **no source mesh or sampled vertices authorized as runtime geometry**. C3.5 owner visual acceptance and Cloudflare preview remain pending. The rejected PR #48 is closed/unmerged; PR #49 camera Focus is the `main` baseline.

## Artifact and provenance

Owner supplied `pavanputra-hanuman-son-of-wind-god-model_files.zip`. Its included catalog PDF identifies *Pavanputra Hanuman — Son of Wind God* by **Vedic Futura** (published 21 December 2023). The PDF explicitly declares **CC BY-NC-ND 4.0** and separate commercial 3D-printing terms. Do **not** commit or redistribute the model, author a remesh/retopology derived from it, extract and ship its vertex positions, generate source-traced texture/normal maps, or claim commercial permission. The supplied copy is only an internal art-direction reference; any commercial use or closer geometry translation needs separate rights clearance. Independent anatomy-based, original geometry is permitted subject to legal review. Existing Smithsonian USNM 334797 skull/mandible CC0 records remain the independent scientific anatomy reference; skull measurements are *not* exterior soft tissue.

Input SHA-256 / offline measurements (Python `trimesh` 4.11.1, raw STL read):

| Input | SHA-256 | Faces | Unique imported vertices | Watertight | Connected pieces |
| --- | --- | ---: | ---: | --- | ---: |
| `head.stl` | `9265780b6aba26ae44e01a36084aa3187c9ef8ec5762af0738b8b00ece0446cb` | 70,651 | 34,999 | No | 16 |
| `Lowpoly full.stl` | `6f5accfdd0ca44e04483ee6697e2b605e290db0b5df501fa4d0c33baa9ab5937` | 453,665 | 226,089 | No | 169 |
| `Highpoly full.stl` | `4296b414edb9b258cc921d28561bfab73abd9b767d240de23a95424f60902cf7` | 2,427,588 | 1,213,342 | Yes | 1 |

The isolated head occupies native bounds X=0.590..6.190, Y=25.233..34.125, Z=5.318..12.074. These are **author/export units, not meters**; the head is translated relative to whole-model bounds and its hair dramatically affects extrema. It cannot establish canonical human-head meters or anthropometric ratios. STL lacks UVs, material slots/textures, bone hierarchy, weighted skin, face loops and jaw hinge semantics. The head has an almost entirely connected main shell (70,634 faces) and tiny disconnected artifacts. This is a detailed hard-surface sculpt/print source, not an animation-ready face.

## Feature observations from the actual mesh render

Front / profile geometry inspected with a VTK offscreen depth-buffered render (not face-color marketing renders). The sculpt is a deliberately stylized mythological anthropoid, **not a measured bonnet macaque**. Readable traits are a heavy supraorbital brow, deeply set paired eyes, strong lateral cheek/zygomatic framing, expanded upper-lip/muzzle and a separate lower lip/chin/jowl silhouette. Hair crest, beard and ornament account for much of the oversized global head bounds; do not reproduce their literal geometry, use them to understand silhouette layering only. Fine triangles in the sculpt are **not** deformation-friendly edge loops.

## Independent head construction contract

1. Retain C1 C2 head/neck/jaw bones, jaw opening semantics, humanoid body and source skin ownership. Use the C2 human head **itself** as the metric envelope and bound braincase width/height/depth; neck contour is an interface, not a skull scaling factor.
2. Build **new original species-specific external face topology** with cheek/zygomatic/temple planes, orbital rims and lid rings, a broad maxillary muzzle, separate nose pad with paired nares, mouth loops, lower jaw/chin and connected auricular forms. Avoid global spherical rings + Gaussian protrusions as the final facial topology. Do not map or copy any vertices/faces from the licensed STL.
3. Use normalized, explicitly named anatomical landmark zones and one deterministic generator implementation; explicitly document ratios as *authored design constraints*, not measurements taken from this sculpt.
4. Preserve a C2-matched skinned neck seam under head turn and jaw motion. At the handoff, inspect normal direction, UVs, four finite/normalized weights, separate jaw lip ownership and no zero-area or self-intersecting triangles. No dummy teeth/eyelids without functioning topology.
5. Hard gate replacement head triangles at **≤130% of the actual C2 human head triangles removed** (skin/eyeballs included) and bound the braincase by C2 width/height. Keep camera Focus and user orbit state.
6. Make original/refined geometry opt-in on the primate family only. Bear stays an **unaccepted legacy preview** until C7. No D14 combat changes, C3.6 or C4.
7. Review multiple visual stages: base neutral silhouette (front/side/three-quarter), facial landmark separation at head scale, jaw-open/side, neck seam while turning, and desktop/mobile metrics, with Cloudflare PR preview and explicit owner approval before merging.

**Decision:** suitable for internal conceptual facial landmark guidance; unsuitable for direct vertex transfer, mesh import, animation or redistribution. If the requested target cannot be achieved independently and legally, seek a suitable CC0/CC-BY reference or original commissioned asset, not a derivative of this CC BY-NC-ND sculpt.
