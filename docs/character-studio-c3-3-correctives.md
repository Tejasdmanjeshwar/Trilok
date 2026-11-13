# C3.3 — Experimental shoulder/hip pose correctives and morphology alignment

**Scope:** Incremental C3 work on the pinned CC0 human only. C3 is not
phase-accepted. No C4 Studio, C5 weapon IK solver, C8 hit-proxy migration,
combat mechanics, head-family generation, or completed visual quality claim.

## Implementation

- `HumanPoseCorrectives` installs four **opt-in** relative morph targets on a
  freshly shaped/owned CC0 `SkinnedMesh`, one for each shoulder and hip.
  Each local target applies a bounded, smooth radial offset around a calibrated
  rest skeleton center and longitudinal limb axis, gated by the original
  four-slot skin ownership. Corrections are driven solely by the submitted
  validated FK shoulder/hip flexion/abduction commands; neutral returns to zero.
  This is a first-order joint-volume *approximation*, not a biomechanical
  muscle model or proof of self-intersection-free movement.
- Original source IDs, UV seams, index triangles, normals, C1 graph/joint
  identities, skin weights, source geometry and unit root scale are unchanged.
  Corrective targets are presentation-only; C2 rest diagnostics stay unchanged
  unless a C3 morphology preset is selected in Character Lab. On replacement,
  targets and influences are released before the old source mesh is disposed.
- `HumanMorphologyAlignment` captures C1 socket rest anchors **before** C3
  reshaping, maps them through the same anatomical deformation, derives
  immutable per-instance socket offsets and measures bilateral upper/lower
  arm and leg IK segment lengths from the actual morphed rest skeleton.
  `socketWorld` and `chainWorld` follow the posed canonical joints.
  C1 immutable socket descriptors and `SemanticCharacter.socketWorld`
  remain untouched; the new derived API is explicitly opt-in for future
  rendering/IK work and does not change combat domain legality or contacts.
- No new generator identity or recipe parameters: C3.3 corrective presentation
  is derived from C3.2 recipe output, not serialized into the C1 recipe.
  All buffers are deterministic functions of the same source, shape and pose.

## Verification and limitations

New pinned-source tests assess neutral/rest recovery, seam-identical corrective
deltas, four-target lifecycle, FK-driven activation, finite skinned positions,
per-instance socket frames, bilateral reach metrics and pose restoration.
Fast Verify CI must pass typecheck, all Vitest tests including 1,000 seeded
combat replays, production build and build identity before merge.

**Still outstanding:** quantified preservation of joint cross-sectional volume
under extreme combined poses; surface self-intersection checks; accurate
morphology-dependent grip contact (C5); full pose-aware IK constraints (C6);
composite stress rendered signoff; more sophisticated anatomical correctives;
head topology families, lifecycle/performance acceptance, and final C3
desktop/touch Phase Acceptance. Do not claim C3 completion or begin C4.
