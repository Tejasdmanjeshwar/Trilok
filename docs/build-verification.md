# Trilok — Verifying the Deployed Build

Trilok shows a playable version, a combat engine version, and an automatically generated build identity.

| Label | Meaning | How it changes |
| --- | --- | --- |
| Playable | Features connected to the browser game | Manually changed when the playable experience changes |
| Combat engine | Latest underlying shared combat-domain implementation | Updated when the engine advances |
| Build | Exact Git revision plus UTC bundle timestamp | Generated automatically every time Vite builds |

## In-game verification

1. Open https://trilok.tejasdmjr996.workers.dev/.
2. Look for COMBAT ARENA · V0.4.0-preview.4, with combat engine v0.4-C. These labels should match `apps/web/build-version.json`.
3. Directly below the title, look for BUILD <8-character-commit> · <HH:MM> UTC.
4. Tap the BUILD badge to expand the playable version, combat engine, full commit, UTC timestamp and unique build ID. Use Copy details to share a report.
5. Compare the commit with the latest commit at https://github.com/Tejasdmanjeshwar/Trilok/commits/main.
6. Open https://trilok.tejasdmjr996.workers.dev/build-info.json to inspect the same build metadata outside the interactive application.

## What to verify for each deployment

- Build freshness: new commits yield a new commit prefix; a rebuild of the same commit yields a different UTC timestamp/build ID.
- Semantics: playable version is not bumped just because unpublished combat-engine functionality advanced.
- Gameplay: arena, FPS, weapons, Energy, turn actions, free first dodge/parry/interception, subsequent Energy costs, free mouse/touch cursor aiming, armor feedback and Restart work.
- Mobile: BUILD badge is tappable, popup is readable, controls are unobstructed in portrait and landscape.
- Performance: High/Mobile quality presets work without regression after repeated combat and restarts.
- CI: GitHub Verify workflow passes typecheck, tests, build, and manifest-vs-commit validation.

If the BUILD badge remains old, inspect the Cloudflare deployment first, then refresh or open a private browser tab. A build badge cannot prove a pending Cloudflare deployment has completed.

## Implementation

- apps/web/build-version.json: single source of truth for manually assigned playable and combat engine versions.
- apps/web/vite.config.mjs: embeds one build identity in the browser bundle and emits dist/build-info.json.
- apps/web/src/build-info.ts: purely formats and exposes build metadata.
- The commit is sourced from TRILOK_COMMIT_SHA, CF_PAGES_COMMIT_SHA, GITHUB_SHA, COMMIT_SHA, or git rev-parse HEAD; the UTC timestamp is generated at bundling time.
- The public build manifest contains no user-specific or secret information.
