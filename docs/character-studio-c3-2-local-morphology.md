# C3.2 — Localized human morphology and experimental Character Lab preview

**Scope:** Second C3 increment; C4 standalone Studio, C3 head families, final IK/socket
refits, and production-ready sculpt quality remain out of scope. Builds on merged
C3.1 with opt-in versioned recipes, preserving C1/C2 API and D14 combat.

## Implementation

- Pure `morphology-local.ts`: `c3.2-local-anatomy-v1` validates all eight explicit
  parameters and generator/topology identity. Global stature/breadth remain C3.1
  compatible; localized `shoulders`, `chest`, `waist`, `hips` each allow
  0.90–1.10; arm and leg girth allow 0.94–1.06. A neutral recipe has all 1.0.
- Calibrated rest-frame semantic shoulder/hip/spine landmarks determine smooth,
  finite torso deformation bands and paired shoulder/hip translations. Limb
  surface influence ownership comes from the actual four-slot CC0 skin weights;
  finger and foot proportions do not inherit limb girth; arm/leg radial shape
  fades near shoulder/hip and wrist/ankle. This is an initial smooth
  engineering deformer, **not an anatomical muscular sculpt**.
- Bone positions (including presentation-only skin helpers) are transformed in
  the same rest space; inverse bind matrices, indexed rest mesh positions,
  original-source-index-averaged normals and bounds are refreshed. Existing
  `AnatomicalHuman` resource ownership, one-shot neutral restriction, original
  source-index/UV correspondence, and canonical C1 IDs remain unchanged.
  C3.1 validation and generator behavior are preserved unchanged.
- Existing `/c2-lab.html` has a *separate opt-in* C3.2 experimental preset
  selector: broad shoulders, chest, narrow waist, hips, arm girth, leg girth,
  and a combined stress combination. On selection, a fresh owned pinned CC0
  mesh is imported and shaped before FK is initialized; the prior instance is
  released after replacement. Current diagnostic pose/camera/source controls
  remain. Selecting *Original CC0 anatomy* preserves default C2 behavior,
  and the old implicit prototype is never a C3 morph target.
- Recipe and runtime injury state remain separate, with no C4 save/edit
  workflow, combat retargeting, or assumed gameplay balance change.

## Verification

The real pinned CC0 unit tests cover canonical stable hashes and schema
rejection, 1.0 identity, two opposed bounded extremes, unchanged original
source IDs and seam/index/UV/weight arrays, finite CPU skinning and FK neutral
recovery, double-apply rejection, and fail-before-write on posed geometry.
Mandatory fast CI checks TypeScript, complete Vitest (including 1,000 combat
seed replay), production build and compiled identity.

**Visual acceptance remains provisional.** This simplified soft envelope can
have volumetric distortion in high-stress shoulder/hip/elbow poses and is not a
pose-space corrective morph. It does not prove contact with clothing or
weapons, perfect limb cross sections, no self-intersections, true muscle
growth, accurate IK reach, physical-device performance or a certified
dismemberment topology. Evaluate rendered front/side/rear, raised arms, crouch,
finger/jaw, and combined stress in the actual deployed Character Lab.
A targeted visual concern warrants a corrective slice. Full desktop/touch
Phase Acceptance is triggered only on **complete C3** candidate SHA,
according to `docs/ci-phase-acceptance.md`.

## Next slice

Prioritize shape-quality and pose-space correction around shoulders/hips,
landmarked longitudinal limb-length controls and derived socket/IK reach
metadata; preserve deterministic ownership before adding new head topology
families. Keep C4 outside the C3 PRs.
