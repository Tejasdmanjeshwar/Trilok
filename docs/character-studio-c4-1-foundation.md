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

## Verification gates

Exact PR-head Verify must pass strict TS, all unit and replay tests, build, and build identity. Focused Chromium screenshots are emitted under test-results/studio when the e2e test runs, and require visual review before signoff. Verify Cloudflare /studio deep link and deployment SHA separately after merge; CI success alone is not a deployment or visual acceptance claim.
