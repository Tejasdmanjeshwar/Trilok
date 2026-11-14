# C4.7 follow-up — Simple random human generator

The owner reviewed the original C4.7 generator and rejected near-neutral results and rule-based profile distributions. Random generation is intentionally reduced to **one Random character button**, with no profile, seed entry, locks, intensity sliders, or other generator controls. The previous generator and its UI are superseded.

## Behavior

- On each click, browser cryptographic entropy supplies a fresh in-memory unsigned 32-bit seed. The actual sampling remains deterministic for tests and within-session undo/redo; the seed is not exposed or saved.
- Generate independent uniformly distributed source-supported values for original MakeHuman body macros (including age, weight, muscle, stature, proportions and sex), normalized ancestry channels, a random subset of native body modifiers, structural facial controls and head/shape parameters, and existing skin tone and roughness. Structural face modifiers use native source ranges; temporary smile/blink/open-mouth expression previews remain under Pose rather than permanently appearing on generated face shapes.
- The earlier near-neutral style correlations and tightly constrained sampling are removed. No aesthetic profiles, role categories, demographic stereotypes, feature locks, safety extrapolation or generated equipment.
- Maintain the same validated human topology/rig, source-body and facial target bounds, immutable recipe, one-step undo/redo, latest-preview cancellation and rollback. No manual edit control ranges are changed.
- This is a **random baseline**, not a claim that every extreme combination will look anatomically attractive. A generated recipe passing schema validation does not prove absence of tearing or artifacts, so actual rendered browser examination of random seeds is required before final C4 acceptance.

## Validation

`tests/character-studio-generator.test.ts` checks deterministic seed replay, numerous valid uniform-range outputs, varied facial structures and body metrics, normalized ancestry, valid appearance, absence of profile/lock commands, and undo/redo. `e2e/studio-generator.spec.ts` checks one-button UI, fresh regeneration, editing, history, and desktop/touch screenshots.

Full Phase Acceptance remains pending on exact merged main SHA; inspect multiple very different random outputs (face front/side, infant if generated, shoulder/hand/knee and anatomy) and independently verify live Cloudflare build identity.
