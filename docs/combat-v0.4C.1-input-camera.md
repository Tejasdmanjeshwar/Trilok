# Trilok v0.4-C.1 — Player-Side Camera and Shooter-Style Free Aim

## Why this change
Previous v0.4-C switched to an \`enemy_attack\` shot behind the rakshasa, reversing player/opponent orientation during reaction timing. It also snapped the crosshair to a selected enemy region. These were confusing and did not resemble a third-person shooter aiming view.

## Updated camera contract
- **Keep the hero in the foreground and the enemy ahead** throughout the opponent's attack, melee windup, defensive reaction and counter. \`enemy_attack\` now derives its position from the hero, never the enemy.
- **Keep aim camera steady while the cursor moves**. The aim shot is player-side/over-the-shoulder, not locked to an opponent's head/torso region.
- Cinematic closeups can alter angle or FOV while remaining on the **player side of the combat axis**; do not jump to an opponent's POV at the instant of a timed defense.
- Reduced-motion setting is respected.

## Device-independent aim contract
\`packages/input\` exports \`AimCursor\`: one normalized screen-space coordinate and input adapter interface. No Three.js, DOM, or battle-state coupling.
- **Mouse:** cursor follows pointer movement in the game canvas. Left-click fires.
- **Touch and pen:** drag anywhere on the unobstructed arena to move the reticle *relatively* (avoids a finger obscuring the target). Use the existing **STRIKE** touch button to fire.
- **Keyboard:** arrow keys position the reticle; Space/STRIKE fires.
- **Web Gamepad:** right stick (axes 2/3) moves aim with a deadzone; right trigger (button 7) fires once per press. This is an optional bridge; native console controller bindings should produce the same normalized input and explicit fire action.
- Settings for touch sensitivity, analog rate and deadzone are validated and independent of render frame count (rate scales with dt).
- Browser adapter \`BrowserAimInput\` owns pointer capture, keyboard state, optional gamepad polling and cleanup. The shared combat engine never sees device-specific events.

## Manual hit flow
1. On a legal free-aim move, the game shows an independently movable crosshair rather than a region picker or automatic target lock.
2. A camera ray from the current cursor determines whether an actual region is under the reticle. The HUD shows **HEAD**, **TORSO**, **ARM**, **LEG** or **MISS** and armor/weak-point information.
3. At **fire commitment**, \`CombatHitVolumes.snapshotCameraAim\` records the screen ray's actual world-space aim point and intended region (or null if the user aimed at empty space).
4. The projectile originates at its weapon socket and travels toward that saved aim point. At the authored impact event, \`CombatHitVolumes.impact\` resolves the *actual* body-part collision. Camera parallax, target movement and misses may change the outcome. No hidden automatic headshot.
5. The domain applies armor and weak-point rules from that actual hit zone; the rendering adapter only plays resulting feedback.
6. Non-free-aim attacks continue to use their existing behavior.

## Caveats / next validation
- This is **straight-ray third-person shooter prototype** aiming, not ballistic gravity or environmental occlusion. Weapon-origin shots and camera-origin crosshairs can disagree at very close range (parallax); that mismatch is deliberately modeled rather than hardcoded away.
- The mouse automatically enters aiming when a legal free-aim attack is selected; there is not yet a dedicated hold-to-aim action. Future input profiles can add aim-held semantics without changing \`AimCursor\`.
- Rig collision proxies are coarse; authored skinned mesh volumes and moving-environment occlusion are future upgrades.
- Browser GPU, touch ergonomics and deployment need manual verification; GitHub CI checks the deterministic cursor calculations, hit/miss logic and camera orientation but cannot test live mobile performance.

## Quick verification
1. Header shows v0.4.0-preview.4 with a new build hash; Engine v0.4-C.
2. While selecting Arrow, **move the mouse**: crosshair follows precisely, camera stays steady; left-click fires at the screen point rather than snapping to a region.
3. On phone/tablet, **drag on the arena** to adjust crosshair; tap STRIKE to fire. HUD remains reachable.
4. Move crosshair onto head then off target: marker changes from HEAD/helmet hint to MISS. Off-target firing must miss.
5. Confirm real head vs arm impacts can produce different damage, and moving target can cause a miss.
6. Let the enemy attack: camera remains behind the hero on all melee/ranged windup, impact and defensive reaction shots.
7. Test keyboard arrows and Space, optionally gamepad right stick + right trigger.
8. Repeat with Mobile quality, portrait and landscape; restart and verify no stuck cursor, wrong POV or duplicate shots.
