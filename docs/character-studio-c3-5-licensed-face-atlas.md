# C3.5 — Licensed Vanara facial relief transfer (draft visual acceptance)

This change uses **actual mesh vertex coordinates** sampled from `source/model.glb`
inside the uploaded `lord-hanuman.zip`, not inferred Gaussian muzzle shapes.
It deforms the existing continuous C2 CC0 humanoid face in its original rest
space, without loading the licensed GLB in the browser. The source mesh's hair,
beard, ornaments, crown, clothing, body, and skeleton are not shipped. Bear
morphology is not changed.

## Attribution and rights

**Lord Hanuman** by **iRahulRajput**, Sketchfab:
https://sketchfab.com/3d-models/lord-hanuman-dbe8eabbe65d442e92a6e056c9bd41f8

Licensed **Creative Commons Attribution 4.0 International (CC BY 4.0)**:
https://creativecommons.org/licenses/by/4.0/

Changes: the original model's frontal face vertices were projected to a bounded
49×49 depth map; quantized, cropped, aligned and blended into Trilok's
independently licensed continuous human head. This is an adaptation; the
original artist has not endorsed Trilok. Source GLB SHA-256:
`361cd7ee30f349b9baf8d1e856167e607adc82561c384bebb288dd7132a0786c`.

## Geometry extraction

- Input GLB: 375,005 render vertices / 667,803 triangles, one combined material.
- Face-only crop in original GLB coordinates: `x ∈ [-.088,.088]`,
  `y ∈ [.639,.783]`, `z ∈ [.072,.237]` (+Z frontal); 6,681 source
  vertices in the broad spatial gate.
- The actual source face contour is cropped by calibrated row-wise X extents
  to exclude hair/beard/crown and ornaments. A 49×49 grid samples nearby
  vertex-front depths at the 80th percentile within a 5.1mm XY radius.
  1,660 populated cells store the **actual source vertex-derived +Z value**
  in whole millimeters; zero indicates no measured facial surface.
- The compact map is bundled in `LicensedVanaraFaceAtlas.ts` and decoded once.
  No 56MB source download, geometry replacement, separate head attachment,
  runtime model dependency, new gameplay bones or alteration of source IDs.
- Source eye, nose and oral bands register to the C3.4/C3.5 pinned human
  landmarks. Measured relief is applied only to outward facial vertices,
  with neck border fade, bounded ±34mm per-vertex displacement and stable
  continuous jaw skinning. Existing UVs, C1/C2 joint ownership and jaw FK are
  preserved; no extra vertex faces are introduced.
- Primate surface color uses a restrained body-matched vertex modulation.
  The original hair/beard textures and ornaments are not imported.

## Important quality limits (do not mark as accepted)

This is a **geometry-backed facial relief transfer**, not high-resolution
retopology, a source-matched rigged facial mesh, or certified AAA facial art.
The 49×49 atlas cannot create eye/nostril/lip edge loops that the C2 topology
lacks, nor can it reconstruct ear depth or the inside of the mouth. The source
is a stylized Hanuman model, not a zoological facial scan. Existing C2 ear
silhouette remains an unaccepted limitation. Clamping intentionally prevents
large skull/neck distortions but may reduce reference likeness.

Required before owner approval: Fast Verify and pinned-source deformation tests;
actual deployed front/side/jaw-open screenshots from Character Lab, visual
checks on human body proportion, neck continuity, eye and mouth anatomy and
performance. No merge, C3.6, C4, or bear-scope expansion before signoff.