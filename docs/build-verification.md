# Trilok — Verifying the Deployed Build

Trilok shows a playable version, a combat engine version, and an automatically generated build identity.

| Label | Meaning | How it changes |
| --- | --- | --- |
| Playable | Features connected to the browser game | Manually changed when the playable experience changes |
| Combat engine | Latest underlying shared combat-domain implementation | Updated when the engine advances |
| Build | Exact Git revision plus UTC bundle timestamp | Generated automatically every time Vite builds |

## In-game verification

1. Open https://trilok.tejasdmjr996.workers.dev/.
2. Look for COMBAT ARENA · V0.4.0-preview.15, with combat engine v0.4-D10. These labels should match `apps/web/build-version.json`.
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


### D8: adaptive AI and free opening actions

- At the start of a player turn, switching from bow to sword must consume **zero Energy and zero actions**; attempting a second switch during the same turn must fail.
- On a sword turn, a **Rapid Slash** can be used exactly once **as the first attack**, for zero Energy and zero ordinary actions. After it finishes, normal actions remain available. Starting with another move disables this opener until the next own turn.
- The guardian may choose its own once-per-turn rapid slash. Weak-point selection evaluates anatomy, armor and exposed/protected state instead of assuming every target has the same humanoid weak spot.
- Repeatedly aim at the same exposed body region. Elite defenders should become more likely to recognize and successfully time defensive actions; novices should remain less reliable. These are **probabilistic AI reactions** controlled by seeded, reproducible decisions; the underlying projectile geometry never acquires hit/miss RNG.
- When the guardian deliberately targets an **exposed player weak point**, the parry/intercept telegraph takes on a red tint. Ordinary torso attacks must keep the normal style.
- Compare rapid, standard and heavy sword swings. Heavy attack has its own windup/impact/recoil animation, audio reinforcement and stronger camera punch. With reduced-motion settings, essential combat timing and health/energy updates must still work.
- Inspect desktop and touch controls at HIGH and MOBILE settings. Verify the public build `/build-info.json` commit matches the deployed Git SHA.

### D9: arrow wound history smoke tests

- Fire two or three ordinary precision arrows into different exposed regions. Each confirmed contact must leave **its own original arrow**, visibly attached to the hit limb/torso while the defender moves. The lodged count must increase, and a new shot must not clear prior wounds.
- Advance two or three encounter turn transitions: a minor (damage under 12) arrow expires after 2 turns; a deep (12–23 damage or weak-point) arrow after 3; severe hits (24+ or critical) remain until combat reset, subject to the 16-arrow rendering cap.
- A recovered shot, spatial miss, dodge, projectile clash with no body hit, and zero-damage block must not embed an arrow. Critical hits may still emit blood; ordinary hits do not.
- Repeated embedded arrow growth must not break the two active flight slots, ongoing interceptions, or restart/disposal; after restart all lodged arrows, marks and counters must clear. Check both desktop/mobile and low/high quality modes.
