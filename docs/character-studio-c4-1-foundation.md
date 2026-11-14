# Character Studio — Foundation (C4.1)

Tracker: Issue #65. This is an incremental implementation record, not final C4 acceptance.

## Delivered

- Standalone Vite HTML entry at /studio/ with a prominent game navigation link. It does not import the game or Character Lab startup.
- Shared pinned MakeHuman CC0 human mesh, semantic skinned skeleton and owned disposal through the existing loadAnatomicalHuman service. No duplicate mesh/rig or speculative anatomy.
- Camera orbit, pan, zoom, explicit front/side/rear/three-quarter views and reset; neutral, golden hour and twilight lighting.
- Responsive, accessible Studio layout with compact real navigation, contextual inspector, meaningful focus/pressed states, loading, retry, reduced motion, and viewport cleanup.
- Focused unit and desktop/touch Playwright tests for navigation, UI, screenshot captures, camera/light actions, and internal-label hygiene.

## Scope and constraints

This phase displays the existing neutral human and currently supported viewing functionality only. Interactive body/face parameters and presets are C4.2; history and in-memory recipes are C4.3; appearance, enhanced pose inspection, refinement and random generation follow later. No Save/Load, baking, combat authority changes, or additional archetypes were implemented.

## Verification evidence

- [PR #67](https://github.com/Tejasdmanjeshwar/Trilok/pull/67) merged into main as `172465dbfb6e2c43aa6e5978d6f4fcf62f1ebc51`.
- Exact final PR head `16b28961e142f96dc426ab5bd60d704d52b927d6` passed [Verify run #43602051590](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43602051590): strict TypeScript, 311 Vitest tests (including deterministic combat replay), build, and manifest identity.
- Prior PR head `5ef7c8700573f2007fc75d6195339a7878925519` passed desktop/touch Studio Playwright tests in [run #43601744824](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43601744824), with screenshots in artifact `studio-browser-evidence`. The UI screenshots were inspected. The touch screenshot exposed partial feet overlap with the stage footer; final head adjusts compact-screen field of view. Updated touch screenshot review of that final tweak remains outstanding.
- Regular Verify was restored to its existing browser-free CI policy. Full Phase Acceptance still owns comprehensive Chromium checks.
- Cloudflare /studio and deployed build identity could not be independently retrieved from this environment. Do not equate merged code or CI with verified live deployment.
