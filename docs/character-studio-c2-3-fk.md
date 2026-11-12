# C2.3 — Anatomical forward kinematics (in progress)

The C1 anatomical graph and bind-pose identifiers remain unchanged. The C2.3
laboratory introduces `AnatomicalFK`, a Three.js presentation-layer pose
controller constructed **after** source landmark calibration. It captures each
bone's rest quaternion and converts anatomical motion axes from the calibrated
rig to the bone's rest-local coordinates. It applies independent, bounded
`flexion`, `abduction`, `opposition` and `rotation` targets in a fixed order.
Repeated calls reset bones to rest, and input validation completes before any
pose mutation. Targets use C1 semantic IDs, not an implicit left/right bone index.

## Diagnosis from C2.2

- C1's human presets specify identity bind quaternions. C2.2 calibrates
  translations but doesn't establish anatomical rotation bases.
- The prior lab curled every finger by the same negative local X Euler angle,
  even though individual fingers are mirrored and the calibrated finger shafts
  do not share that arbitrary local axis.
- The forearm demo applied ±2.8 radians of wrist Y rotation, which turns the
  hand as a wrist assembly instead of rotating about the elbow-to-wrist axis.
- Official MakeHuman lowerarm01/lowerarm02 bones are mapped to the simplified
  C1 elbow; source helper/twist weight redistribution remains **C2.4** work.
  This phase does not falsely claim a fully articulated two-bone radius/ulna.

## C2.3 implementation boundary

- For fingers, flexion axes are built from the measured finger-shaft direction
  and knuckle-plane normal (with +Z as provisional palmar anterior). Individual
  proximal and distal phalanges receive their own bounded target angles.
  Thumb opposition uses the thumb direction relative to the index base.
- For the forearm, axial rotation is an independent elbow control oriented by
  the rest-pose elbow-to-wrist landmarks. Wrist flexion and deviation are
  separate degrees of freedom. This **does not yet distribute twist** along the
  forearm skin and should not be visually signed off until C2.4.
- Shoulders, clavicles, elbows, hips, knees, ankles, spine, neck and jaw have
  elementary constrained controls. Complex coupled anatomical constraints,
  scapulohumeral rhythm and muscle deformation are not implemented here.
- No animation timeline, IK solver, morph targets or D14 combat changes.

## Validation

`tests/character-anatomical-fk.test.ts` checks deterministic input-order
invariance, rest restoration, semantic coverage, two-hand finger control,
forearm versus wrist behavior, clamping, and atomic rejection of invalid
targets. Existing CC0 rig and combat suites remain required gates.

**Outstanding before C2.3 acceptance:** verify these tests and type/build in
GitHub Actions; inspect actual imported-CC0 Chromium hand and arm screenshots
in both desktop and mobile configurations; correct conspicuous direction or
intersection defects. The FK mathematics alone is not proof of visual quality.

**Next:** C2.4 weight and twist quality, including source lowerarm02 transfer,
followed by C2.5 stress-pose validation and C3 readiness.
