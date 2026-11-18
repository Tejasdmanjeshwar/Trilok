# C6.2 reference animation baking and Studio playback

**Status:** scoped feature branch implementation. This record does not assert browser visual acceptance or C6 phase acceptance.

## Production route
The source of truth for all three original, proprietary Trilok reference motions is
`packages/character-core/src/animation-library.ts`. This is a tightly scoped
TypeScript procedural source: no externally licensed mocap data, Blender binary,
or Python dependency is required in the public build. The manually dispatched
pinned Blender 4.5.16 workflow remains available for future offline source-pose
experiments, but is intentionally not added to normal Verify.

`node scripts/bake-reference-animations.mjs --write` uses the repository's pinned
Vite compiler to load the typed source in Node 22, maps semantic roles to C1
joint IDs, normalizes local XYZ quaternions against exact bind transforms,
validates the resulting C6.1 clips and emits canonical JSON and a provenance
manifest under `assets/animations/reference-v1/`. The manifest distinguishes
SHA-256 of serialized source parameters and emitted clip bytes from the
non-cryptographic canonical rig compatibility fingerprint.

`pnpm animation:verify` recomputes the outputs and compares every byte against
the checked-in files. Regeneration is intentional; never update expected
hashes to conceal a changed source. No C9 character Save/Load is added.

## References

- **Relaxed breathing:** 3-second loop with modest spine/chest and symmetric
  clavicle/shoulder motion; no root displacement.
- **Controlled forward step:** 2-second in-place staged left lead and opposing
  right-leg motion with pelvis/upper-body compensation. Foot locking and
  grounded stride authority remain C6.3 work.
- **Weapon-ready gesture:** 2.4-second upper-body/arm coordinated, in-place
  gesture returning to neutral. Reference only; no equipped sword grip IK or
  combat contact events are synthesized.

## Pose ownership
Studio static mode retains the existing C5 `StudioPosePreview` as the sole
FK/IK/corrective owner. Entering animation disables equipment display,
sets a clean neutral FK base, then creates `StudioAnimationPlayback` against
the existing semantic skinned human. Switching/seek/pause sample explicit
timestamps; no combat events. Exiting destroys the adapter and restores
the chosen static pose, equipment selection, and C5 corrections.
Regeneration destroys the old adapter before retiring the old skin and creates
one for the accepted new model. Failed model rebuild retains the old model.
Background suspension resets clock anchoring rather than simulating hidden time.

## Deliberate limitations
Exact bind identity is required. Morphologies that keep the same C1 graph
are not proof of universal retargeting; foot-ground, hand contact, and source
skin corrective behavior still require rendered audits. No inferred hit
events, weapon layering, C7 topology retargeting, dismemberment, or C9 export.
See C6.3 and C6.4 for grounded gait and weapon-aware layered IK.
