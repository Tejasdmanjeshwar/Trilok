# C3.4 — Complete human head morphology (human-only CC0 topology)

**Scope:** One consolidated subphase of C3. No C3.4.1 slices, no animal
heads, no C4 Studio, C5 weapon IK or C8 combat actor migration. This is
the opt-in, pinned-source CC0 *human* head generator with continuous skinning,
not a primitive stand-in or a new topology family.

## Versioned recipe and controls

`c3.4-human-head-v1` extends the eight existing C3.2 body parameters with
nine bounded, explicit channels: skull width (0.90–1.10), skull height
(0.93–1.07), forehead (0.93–1.07), brow (0.92–1.08), cheeks (0.92–1.08),
jaw width (0.91–1.09), chin (0.92–1.08), facial depth (0.94–1.06),
and orbital spacing (0.95–1.05). All default to 1.0. The pure
`@trilok/character-core` schema rejects unknown, missing, nonfinite,
out-of-bounds and mismatched-generator parameters and has a deterministic
canonical recipe hash. C3.1/C3.2 generator identities remain valid and
unchanged; C3.4 does not imply a different head family or mutation of injury
state.

## Source-derived deformation and rig compatibility

`makeHumanHeadTransform` locates the original CC0 human head/jaw from the
four-weight source skin influence map and semantic neck/head/jaw rest positions,
finds a bounding cranial envelope and source-surface bilateral orbital probes.
Local soft fields shape the skull, brow, forehead, cheek, jaw, chin, facial
depth and eye spacing with smooth falloff into the source-derived neck
landmark. The source's existing indexed triangles, UV seams, original vertex
numbers, four normalized weights and single continuous mesh are retained.

The head pass composes with the C3.2 body rest-space transform before
rebuilding bone inverse binds; jaw-tip calibration and derived socket/IK
alignment use the same composite mapping. In particular, a shaped mandible
must open downwards in FK, while source orbital probes follow head FK using
head-local anchors; no new C1 "eye" joint is fabricated. Eye probes are
geometry-derived *reference landmarks*, not a complete eyeball/eyelid rig
or proof of visual optical alignment. All writes occur on newly owned neutral
meshes only. Original C2 CC0 preview is still the default, and C3.3's optional
shoulder/hip correctives remain available on shaped previews.

`/c2-lab.html` includes original/broad/long/brow/jaw/combined-stress human
head presets and nine labeled, accessible 0.01-step sliders; switching shapes
rebuilds the owned source and reapplies the selected anatomical pose.
A `data-c3-head-ready` diagnostic marker distinguishes a successful
human-head build from the fallback implicit geometry. No C4 editor,
save/bake pipeline or animal-head representation has been introduced.

## Verification and constraints

Pinned CC0 regressions exercise schema/hashes and invalid inputs, neutral
identity, opposite bounding extremes with coupled body proportions, source
and UV correspondence, joint/skin invariants, finite CPU skinning, stable
jaw opening and calibrated eye/head FK, rest recovery, posed source rejection,
and one-shot lifecycle. Phase-gated desktop/touch Playwright snapshots are
authored for C3.4 head views; expensive full Phase Acceptance waits until
C3.7. Fast Verify CI must pass TypeScript, full Vitest including the 1,000
combat-seed replay, build and exact build identity before merging.

**Limitations:** geometric region fields are smooth approximations. Full
eyelid rigging, eye-ball articulation, facial expressions, teeth/tongue,
photorealistic anatomy, self-intersection freedom, measured browser
performance and final rendered quality have not been certified. C3.5/6
introduce separately validated nonhuman topology families and C3.7 handles
coupled quality/acceptance. A merged PR is not owner visual signoff.
