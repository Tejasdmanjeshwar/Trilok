# C3.5 — Local reference-guided continuous head morph (experimental)

**Owner decision, 2026-11-13:** the owner rejected both disconnected head generators in PR #48 and PR #50. PR #50 has been closed **without merging**. Do not reuse the head-swap code. This branch is based on the accepted `main` C2/C3 baseline.

## Requested architecture

The existing continuous C2 MakeHuman surface, body and neck remain authoritative. The owner provided an STL Hanuman sculpt for facial anatomical interpretation, not a replacement game head. This experiment ingests a **private local** STL in Character Lab and projects a cropped front facial depth field onto existing head vertices, without changing topology, UVs, C1 bones, jaw ownership, skeleton skin weights or the neck.

The uploaded `head.stl` measures 70,651 faces (34,999 welded vertices; 16 connected components) and includes hair/beard/crest, all of which must be removed from anatomical correspondence. The sculpt is a stylized mythological character, not a scientific human or macaque anatomical scan; units and rest registration are not supplied. Its catalog sheet specifies **CC BY-NC-ND 4.0**. Private noncommercial adaptation is permissible, but publicly sharing adapted geometry without an additional license is not. No reference-derived mesh or texture may be committed, cached persistently, exported or deployed on Cloudflare.

## First local experiment

- `LocalVanaraReferenceMorph.ts` accepts a caller-supplied THREE.BufferGeometry and an explicit face window (with a default crop). It rasterizes forward elevation and adds strictly bounded displacement to *existing* C2 face vertices.
- The first 16% of the original head/neck and the upper scalp are unmodified. Face regions must have C1 head/jaw ownership, and body vertices outside the target facial region are untouched. The original geometry index, UVs, C1 bones, four weights, and original material remain in place.
- `c2-lab.html` accepts a local .stl (10 MB maximum). The file is parsed into memory only and disposed on page exit. It is never uploaded or written to a generated build.
- Validation includes a synthetic licensed-independent reference surface applied to the *real* pinned C2 mesh and assertions for stable topology, source IDs, UVs, skin weights and skeleton. This is a headless technical gate, not a visual quality certification.

## Known critical limitations (NOT accepted)

This is **not** the final fully detailed reconstruction. An existing low-density, human-shaped face cannot resolve all details of a 70k-triangle sculpt through vertex positions alone, and one projected depth field cannot recover occluded facial surfaces or distinguish hair from skin without semantically registered mask boundaries. The current crop and normalized scale are provisional; manual anatomical landmark registration and objective front/profile fitting error remain open. The inherited procedural primate base shape, original jaw weights and original C2 human face loops may not support anatomically realistic primate lips, muzzle, nostrils or eyelids. Eventually use independently licensed reference geometry or obtain permission to distribute an adapted mesh if direct retopology/normal baking is required.

**Do not claim production-ready quality.** The next gate requires multi-view source/reference registration, geographically localized face masks, skinning/jaw pose screenshots, seam measurements, exact triangle budget, render screenshots, and explicit owner approval. No C3.6, C4 or C7 bear work.
