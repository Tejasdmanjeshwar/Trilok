# Character Studio — Memory-only recipes and editing history (C4.3)

Tracking: [Issue #65](https://github.com/Tejasdmanjeshwar/Trilok/issues/65).

## Scope implemented

- **Versioned, immutable human recipe:** `StudioRecipeV1` contains schema version, human topology family, stable generator identifier, seed, native body and facial control values, head/local morphology, and selected preset identity. The validator rejects unknown anatomy, invalid channels/ranges, nonfinite values and mismatched schema. It does not add a public file format.
- **Pure editing commands:** individual adjustments, native presets, section resets and full reset go through a single source-validated reducer. Anatomy is separate from camera, lighting, selected tab, filter and viewport controls.
- **Bounded history:** in-memory `StudioHistory` keeps 48 entries by default, groups pointer/keyboard range gestures as one action, supports undo/redo with branch invalidation, and treats each preset/reset as one command. A failed latest render restores the last successfully rendered recipe; stale results never alter history.
- **Presentation:** top-bar Undo, Redo, and Start over; Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y outside text entry. Full reset asks for confirmation; changing sections does not reset history or camera.
- **Preview race safety:** each anatomical change obtains a unique generation token and aborts superseded source imports. A fresh body/head preview is accepted only if its token is newest; old candidates are disposed. Facial-only updates check their token *after* any asynchronous source loading and *before* modifying the live surface. The previous valid model remains visible on failure.

## Verification

The new unit suite exercises schema rejection, deterministic recipe fingerprints, age 0–0.06, native extreme ranges, source presets, grouped slider changes, history bounds, undo/redo, race suppression, and rollback. A dedicated Playwright desktop/touch journey covers history during an in-flight render, section changes, reset, camera stability and fresh-session nonpersistence. The repo's PR Verify remains browser-free by policy; the browser journey is run with manually dispatched acceptance or an independent focused browser check.

The entire workflow remains deliberately **memory-only**: no localStorage, indexedDB, cloud sync, file import/export, Save/Load or baking. Seed and version describe the recipe but do **not** implement the C4.7 character generator. Advanced Focus remains C4.5. Combat and Character Lab are unmodified.

## Handoff gates

Before merging, require exact-head TypeScript, Vitest/replays, production build and build-identity verification. Inspect actual focused desktop/touch rendered screenshots when available; keep unverified visual evidence explicitly open. After merge confirm main SHA and check Cloudflare build identity independently. Full C4 acceptance remains separate from completion of this slice.
