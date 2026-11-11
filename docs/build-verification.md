# Trilok — Verifying the Deployed Build

Trilok shows a playable version, a combat engine version, and an automatically generated build identity.

| Label | Meaning | How it changes |
| --- | --- | --- |
| Playable | Features connected to the browser game | Manually changed when the playable experience changes |
| Combat engine | Latest underlying shared combat-domain implementation | Updated when the engine advances |
| Build | Exact Git revision plus UTC bundle timestamp | Generated automatically every time Vite builds |

## In-game verification

1. Open https://trilok.tejasdmjr996.workers.dev/.
2. Look for COMBAT ARENA · V0.4.0-preview.11, with combat engine v0.4-D7. These labels should match `apps/web/build-version.json`.
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

### v0.4-D6 additional acceptance checks

- New build shows v0.4.0-preview.11 and core v0.4-D6.
- Bow attack and intercepting shot follow visibly curved ballistic trajectories, not straight linear interpolation.
- For enemy ranged attacks, a **green feasible** and **gold perfect** segment appear *before* the impact end of the timing bar. The perfect segment is computed from feasible collision solutions.
- Perfect input yields a midair contact, regardless of whether the attacking or intercepting arrow wins; no new arrow is spawned after the clash.
- A winning intercept follows its original trajectory toward the attacker and may miss if its actual ballistic ray does not contact a body collider.
- Repeat on touch and keyboard; inspect FPS and any timing-band overlap on narrow screens.

### v0.4.0-preview.11 — Contact and wound acceptance

- Shoot the enemy's exposed body region: the **arrow should stop or embed at first body contact**, with damage text, animation, audio, and hit VFX in the same rendered frame; it must not pass through and cause delayed feedback.
- Aim a precision arrow at the exposed **neck** (a small target beneath the helmet). On a critical, a brief blood splat and an embedded arrow should appear at that exact hit region and follow body animation.
- Helmet-protected **head** shots may damage but suppress critical-only embedding and blood.
- The lightweight recovery shot must not embed, and missed or intercepted arrows must not leave wounds.
- Test an actual surviving intercept projectile: first contact, not a fixed expiry time, should resolve it.
- Restart should clean all lodged arrows and effects. Switch from MOBILE to HIGH, test portrait and landscape, and verify no duplicate damage when FPS drops.

### D7: reliable precision, arrow silhouette and persistent wounds

- Shoot twice with the same bow, unmoved crosshair and target pose; expect repeatable hit results and body regions, not RNG.
- A body region actually under the aim marker should not be spuriously missed merely because the camera ray struck the leading surface of the collider. A reticle in empty space must still miss.
- Inspect arrows in flight and when lodged: the distinct **three fletching vanes and nock** should be visible, especially when zoomed in.
- Critical precision hit on exposed neck: blood burst, arrow attachment and a dark-red wound mark at the actual impact position; wound and arrow follow animated body part.
- Ordinary hits and recover shots do not create critical-only wounds. A helmet-blocked headshot also suppresses those critical effects.
- Restart clears persistent wounds. Check touch/desktop and at MOBILE/HIGH graphics quality. Confirm build version.
