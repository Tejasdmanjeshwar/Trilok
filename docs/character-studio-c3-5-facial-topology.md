# C3.5 — Human facial topology and semantic control foundation

**Status:** Implementation on feature branch; acceptance pending CI, Chromium visual inspection, and owner review. This is *not* a completed expressive face rig or production art asset. C3.6, C4 and C7 are out of scope.

## Source audit and existing limitations

- Pinned C2 MakeHuman CC0 **body** topology is a single closed indexed skinned source. The importer duplicates UV corners but retains immutable original source vertex IDs; facial material, seam and skin provenance must survive shape/reconstruction. See [C2 import](character-studio-c2-anatomical-import.md).
- C1 has a head and jaw joint, but *not* independent eyelid, lip, nose, cheek, or ear joints. C3.4 has two orbital surface probes and broad head-region deformation, not a dense expression rig.
- Existing C3.4 morphs preserve the source face indices, so small facial areas have only source-provided resolution. Head/jaw influences are inherited from official C2 weights and remain imperfect near thin oral/eyelid regions. The mesh does **not** have guaranteed eyelid rings, inner mouth cavity, individual nostril rims, eye sockets ready for anatomical eye animation, or lip mucosa. Artificially adding vertex density cannot create these missing anatomical structures.
- Previously merged primate/bear shared-topology previews remain **unaccepted experimental legacy**. Rejected PR #52 was not merged; its licensed face atlas is not used here.

## Implemented API

`FacialTopology.ts` exports a stable `FACIAL_TOPOLOGY_VERSION=1`, a 26-region `FACIAL_REGION_IDS` registry, source vertex/bone role landmarks, radial local authoring fields and `inspectHumanFacialTopology(human)`. The atlas derives eye, chin, crown and neck references from *owned neutral C2/C3.4 geometry* and C1 head/jaw weights. It includes orbital corners, upper/lower eyelids, brows, nasal bridge/tip, paired nostrils, lips, mouth corners, cheeks, jaw, chin and ears. The fields are a C3.6-compatible **control foundation**; they do not yet implement expressions or facial animation and they are not additional bones.

`refineHumanFacialTopology(human,{maxSourceEdges,minimumEdgeLengthMeters})` performs one conforming, adaptive pass on front-facing candidate source edges near those semantic fields. Canonical source-edge selection ensures both UV copies split together; face winding and original indices are preserved as a prefix of the new attribute buffers. Each new midpoint receives interpolated UV, normalized four-influence skinning and a stable two-source-vertex edge descriptor (not a fictitious upstream source vertex ID). Limits: 1–3000 split source edges, default 1200, minimum length default 2.5 mm. Refinement can only be performed once on the owned source geometry, after neutral rest-space C3 shaping and inverse-bind recalibration. It never mutates the canonical source template's original buffers. An explicit disposal path releases both original and derived GPU geometries.

The opt-in **C3.5 adaptive human facial topology** checkbox in Character Lab can compare source and refined human rendering and wireframes. The status panel provides actual vertex, triangle, and selected edge counts. Lab controls preserve camera orbit while rebuilding. Default original source and all combat behavior remain untouched.

## Acceptance and limitations

Vitest should exercise deterministic atlas ordering, bilateral field separation, source skin ownership, canonical edge continuity, UV/geometry preservation, four-weight normalization, C1 head/jaw FK and neutral recovery, budget validation, reproducible generation and idempotent disposal. Verify TypeScript, full Vitest + combat replay, build identity and both Chromium modes in CI. Capture and review **front, three-quarter, profile, jaw open/closed and close wireframe** rendered views on the feature-branch build. Require owner approval before merge.

**Not claimed:** measured final density adequacy around each eyelid and lip contour, reconstructed anatomical edge loops, production-ready nostril/mouth cavities, stress-free extreme deformation, GPU profiling on low-end phones, or visual sign-off. The existing upstream mesh may ultimately require a separately licensed higher-fidelity human face template with validated source-to-C2 bridging; such a replacement requires a new explicit asset-provenance and rigging review, not undocumented hardcoding.
