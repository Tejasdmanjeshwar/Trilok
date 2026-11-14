# Character Studio — Human body and facial customization (C4.2)

Tracking: Issue #65. Builds on the merged C4.1 Studio.

## Implementation

- Body and Face views in the Studio navigation with one contextual, scrollable inspector and full-size shared human viewport.
- A single metadata catalog composed from the *existing* BODY_CONTROLS, ALL_FACIAL_CONTROLS, and versioned head/local bounds in character-core. No second deformation evaluator or remapped native limits.
- Native MakeHuman body and facial controls, including permanent unsupported stress extensions, remain available under searchable Advanced shaping; readable names, area selection, accessible range and exact-number inputs are supplied.
- Supported MakeHuman body and facial presets, source-coupled ancestry channels, and section-local resets. Opposite-section values are preserved. This slice does not introduce undo/redo, a persistent recipe, or a random generator.
- Existing pinned human source geometry and C1 semantic skeleton are used. Head/local shape is processed via applyHumanMorphology; body displacement and bone/IK bind recalibration via MakeHumanBodyController; face via MakeHumanFacialController. Each edited model is assembled and validated before replacing the last good model.
- Manual camera and lighting state remains unchanged during editing, section switching and regeneration. Geometry, skinned rigs and facial controllers are disposed when superseded.
- Dedicated Vitest parity/infancy/endpoint tests and Chromium Studio tests, with desktop/touch screenshot artifact paths.

## Known limitations and release gates

This implementation chooses correctness and source parity over latency optimization: body/head changes create a fresh anatomical preview, with a short input debounce; facial-only changes reuse the live facial controller. Measure and optimize the reconstruction pipeline in subsequent work without weakening source fidelity. Features pending C4.3–C4.7 (history, full memory-only recipe state, detailed appearance, pose/inspection, performance refinement, seeded generator) are not presented as implemented. Save/Load and baking remain deferred to C9.

Before merge: exact PR-head Verify (strict TS, existing 1,000-seed replay, unit tests, production build and build identity) green; desktop/touch focused Chromium screenshots reviewed, with targeted infant and facial visual inspection. Confirm Cloudflare deployment identity independently after merge.

## Verified result and outstanding visual evidence

- [PR #69](https://github.com/Tejasdmanjeshwar/Trilok/pull/69) merged to `main` as `05155eef88b126b8c84414062d45d39c42391b20`.
- Exact-head GitHub [Verify run #43605215244](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43605215244) succeeded on `80ce5019d8c6063243b57d19981edc25c97852b4`: TypeScript, 318 full Vitest tests/replays, production build, build identity.
- New focused `e2e/studio-customization.spec.ts` desktop/touch tests and screenshot captures have been committed but **not executed or visually inspected** yet. The regular Verify policy intentionally excludes browsers; the owner should validate actual deployed body/face editing before visual sign-off.
- Live Cloudflare URL and `/build-info.json` were not readable from this environment; deployed SHA remains unverified. Do not equate GitHub merge with confirmed Cloudflare deployment.
