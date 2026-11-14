# C3.6 — Native MakeHuman CC0 body morphology (review candidate)

## Source of truth and scope

Candidate starts at `9ef46d99011cff7dcfcc8d50b429f912a76b97a1`, with accepted C3.5 facial PR #54 and deferred Save/Load PR #55. Source is official MakeHuman `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`, identical to the C2 base OBJ, rig and weights. `assets/makehuman-body-v1.json` pins 846 original CC0 source `.target` files by immutable Git blob SHA and byte length, grouped under neck, torso, hip, stomach, buttocks, pelvis, armslegs, breast, genitals, bodyshapes, measure and macrodetails. These total roughly 123 MB of original uncompressed source text. `scripts/fetch-makehuman-body.mjs` verifies each source blob, CC0 header, zero-based index and finite displacement before compiling a stable source-coordinate body atlas. It never executes MakeHuman's AGPL application.

The official original JSON modifier metadata maps 142 direct native body controls (signed and unipolar) across neck, torso, shoulders/arms/hands/fingers, legs/feet, pelvis, abdomen, chest, body shapes and measurements; macro metadata additionally describes sex, age, ancestry, weight, muscle, height and proportions. Signed `[-1,1]` and unipolar `[0,1]` are original direct-control ranges. The permanently available `±1.25` endpoints and `stress/gain` control are **unsupported extrapolation**, never native acceptance failures.

## Implementation

`MakeHumanBodyController` stages original source-indexed delta sums in a float64 accumulator, then scatters the exact displacement to all existing render UV duplicates, recomputes source-shared normals and publishes objective triangle degradation and timing diagnostics. The controller does not create geometry, change source IDs/UVs/index buffers/skin weights or write gameplay state. Body shaping is composed **before** C3.5 facial controls on a fresh owned C2 template, allowing facial controller baselines to derive from the currently shaped body, without repeatedly adding the same displacement. Legacy C3.2 presets/C3.4 head presets remain opt-in and use their original code paths. Body controls/presets retain user camera and current pose during the owned-surface rebuild.

Experimental macro evaluation uses deterministic piecewise interpolation among original gender/age/ethnicity and universal muscle/weight, height/proportion source target families, with an explicit neutral baseline subtraction. This is a data-based approximation to MakeHuman's dependency engine, **not yet a validated executable-oracle recreation of all macro dependencies**. Breast size and firmness and some specialist modifier interpolation may require additional source-derived dependency rules. In addition, source-body vertex moves do not yet derive new C1 joint offsets, inverse-binds or IK/socket refits, so substantial limb-length and stature morphs require additional coupled skeleton tests and corrective implementation.

## Review and validation

Unit tests require 846 source targets and 142 native direct modifiers, check target coverage, supported endpoints, exact source vertex displacement for representative controls, unchanged UVs/topology/weights, neutral return, deterministic recomputation, macro ordering, stress separation and rejection of invalid input. GitHub Verify must pass the complete typecheck, full seeded combat test suite, build and compiled identity; `C3.6 Native Body Visual` runs Chromium desktop/touch screenshots. **These tests do not prove native MakeHuman executable parity, collision-free surface or anatomically correct IK under every macro combination.**

Visual reviewer: visit the branch-specific Cloudflare preview `/c2-lab.html` only when its `/build-info.json` matches the exact PR head SHA; inspect neutral, paired body controls, macro ranges, posed wrist/fingers, neck/shoulders/hips, extreme extrapolation and facial overlays. **Do not merge without owner approval.** C4, C7 species geometry, C9 Save/Load and combat migration are excluded.

## Outstanding acceptance blockers

1. Verify exact authored target behavior against a matching pinned MakeHuman executable or independent golden reference for macro and dependent modifiers.
2. Refit and test C1 rest joints, bind inverses, semantic sockets and IK chains for the whole native body/macro envelope, including elbow/wrist/knee/ankle and neck articulation.
3. Inspect Chromium screenshots for original head + body combinations and resolve reproducible native-range clipping, inversions, seams and self-intersections.
4. Confirm a working Cloudflare preview and report exact candidate SHA. Owner visual approval is mandatory.
