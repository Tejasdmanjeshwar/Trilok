# C3.5 — Human facial source topology and control foundation

**Status:** Draft PR #53, 2026-11-14. Source-preserving control tessellation implementation; anatomical acceptance and owner visual review **not yet achieved**. C3.6 and C7 are excluded.

## Repository source, anatomical limitations and preserved contracts

The pinned MakeHuman base OBJ is CC0-1.0 from upstream revision `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`, documented in `assets/makehuman-core.json`. The imported **body** group is a continuous watertight human shell. The importer tracks original source vertex IDs through UV corner duplication. C1 supplies head and jaw joints, not independently animated eyelid/lip bones. C3.4 modifies the continuous rest-space head before the C3.5 pass and rebinds the skeleton.

Baseline measurements from earlier CI: **14,517** imported render vertices, **26,756** triangles, **19,158** OBJ source vertices (including excluded helper geometry). At the original region influence threshold, the upper eyelid has only **four** local control samples per side; the lips, mouth corners and nostrils also lack sufficient reliably demonstrated edge loops for expression-quality closures. These are **field coverage counts**, not proven topological eye/mouth rims.

**Critical distinction:** Two subdivision stages increase local deformation resolution while keeping the existing source surface unchanged. They do **not** fabricate actual palpebral margins, oral cavity, nostril airway, eyeball or anatomically validated eyelid/mouth closure. Claiming completion on subdivision alone would repeat the previous error.

## PR #53 engineering correction

The 26-region stable `FacialTopology.ts` landmark/weight atlas and `refineHumanFacialTopology` canonical first-pass edge splitter are retained. They follow MakeHuman geometry, preserve C2 UV, source correspondence and official four-influence weights. Original source vertex indices and attribute contents remain exact.

**Rejected, removed from this branch:** `FacialEdgeFlow.ts` generated closed elliptical level-set rings at arbitrary front-facing positions. Although manifold-conforming, they were not true anatomical loops. `FacialApertures.ts` removed projected disks and capped their recessed replacements. The visual result had misplaced eyes and a wedge-shaped oral cavity. Their diagnostic UI and tests were removed as well.

**New, `FacialSourceTopology.ts`:** a second conforming adaptive edge pass scores edges of the *existing refined source surface*, with priority for upper/lower eyelids, eye corners, lips, mouth corners, nostrils and brows. No source vertex is displaced, no additional surface or cavity is generated, and existing topology is refined based on real source connectivity. Each secondary midpoint stores parent canonical IDs, t=0.5, interpolated UV and normalized official C1 joint influences. A canonical topology ID is shared across render duplicates on UV seams; all generated geometry is owned by the current `AnatomicalHuman` and disposed during template unload/rebuild. New output is capped at **26,000 render vertices and 55,000 triangles** over the whole human. Validated budget inputs are `primaryEdges=32..3000`, `secondaryEdges=32..5000`; defaults 2400 and 2800.

The `controlWeights(region)` interface produces independent per-vertex local authoring weights for any of the 26 regions without mutating the rest mesh or constructing C3.6 morph targets. These are **source-space radial authoring fields**, not real anatomical muscle or eyelid sliding constraints. Temporary test-only field displacement and jaw/head FK recovery must remain diagnostic.

Character Lab's opt-in C3.5 checkbox now displays the source-connected refinement, preserving camera framing when changing the human head recipe. The previous recessed mouth/eyes mode has been deleted. No changes to combat, runtime character selection, C1 joint hierarchy, C2 default mesh, C3.4 morphology or unrelated C7 experimental previews.

## Evidence, gates and unmet acceptance

Existing pre-replacement CI and screenshots are **historical evidence for rejected prototypes only**, not evidence for this new source-derived implementation. The new SHA must pass TypeScript, Vitest including deterministic replay, Vite build and build-identity verification. The C3.5 Chromium workflow captures front, profile, three-quarter, jaw-open and wireframe scenes at desktop and touch viewports. The current test suite checks source-attribute prefix, interpolation ancestry, normalized skin weights, deterministic recreation, head/jaw pose recovery, bilateral local control support and input bounds. CI results and measured neutral triangle counts must be recorded *after they run*. Rendered images must be actually inspected before asserting correctness.

**Still not established:** anatomically correct upper/lower palpebral loops, closure with eye-contact, lip vermilion and wet/dry boundary, independently opening anatomical oral cavity, nostril rims, facial deformation at extremes without artifacts, professional human facial anatomy/appearance, stable UV texture continuity under expressive deformations, and final owner visual approval. New higher-fidelity, appropriately licensed and physically aligned source data plus a validated neck/topology bridge may be required. This cannot be replaced by another arbitrary ellipse or capped pocket.

**Merge is prohibited until** final branch CI succeeds, Chromium images are visually reviewed from the exact SHA, measured head control density and posed deformation are satisfactory, and the owner explicitly accepts the face. C3.6 morph targets, C3.7 phase acceptance and C7 species reconstruction are separate work.

## Follow-up requirements for genuine anatomical completion

1. Verify source geometry from the pinned licensed asset in front/profile/wireframe against upper and lower eye margins, canthi, vermilion border, oral commissures and alar/nostril rims; annotate and measure *actual* edge-loop correspondence rather than positional control falloff.
2. If the pinned body shell lacks the requisite boundaries, source a compatible CC0/appropriately licensed human facial topology containing real eyelid and lip features. Maintain a continuous same-body character with mathematically explicit, reproducible surface bridging, new UVs and four-weight skinning, and source-to-derived IDs. No external editing.
3. Temporary closure/opening and asymmetric deformation must run on the actual geometry and expose occlusion, surface normals, inverted triangles, skin tears, jaw linkage and region isolation. Use screenshots from actual Chromium rendering for signoff.

Tracking: [Issue #41](https://github.com/Tejasdmanjeshwar/Trilok/issues/41), [draft PR #53](https://github.com/Tejasdmanjeshwar/Trilok/pull/53).
