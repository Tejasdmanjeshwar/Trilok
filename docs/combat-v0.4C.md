# Trilok v0.4-C — Precision combat and cinematic feedback

Status: implemented in the playable Three.js prototype; animation/aim balance still require mobile playtesting.

## Defense cost revision
- **First legal dodge, sword parry or ranged interception is free** for each actor since the beginning of their previous own turn.
- Every subsequent defensive action in that interval consumes that defense move's authored Energy cost (normally dodge/parry 1; interception 2).
- A single counter tracks **all** defense techniques. Alternating dodge and parry does not reset the free allowance. Missed or unaffordable input that never commits a defense does not increment it.
- On the actor's next own turn, the counter resets, independent of the attacker's rendering sequence or multi-hit frame skip.
- Perfect defenses never create free Energy: their capped refund is never greater than the Energy actually spent on that defense. Prototype catalog currently sets perfect refunds to zero.
- Both players and AI call the same \`getLegalReactions\` and \`resolveReaction\` functions and respect the same cost/cooldown/timing checks.
- \`ReactionResolution.outcome.energySpent\` exposes the real cost for future HUD feedback and analytics.

## v0.4-C browser integration
- **Aim selector** in the combat command panel appears on supported free-aim moves (hero's bow arrow). Choose Head, Torso, Arms or Legs, or tap/click the enemy's body on the canvas to select a 3D rig-linked region.
- **World-space target marker** follows the selected bone/rig-attached region during animations and camera transitions, with exposed/armored weak-point hinting.
- **Coarse hit volumes** are authored as invisible sphere proxies attached to Torso, Left/Right Arm and Left/Right Leg. They support camera raycasting for deliberate aim and independent projectile impact raycasts.
- **Important:** Intended aim and actual contact are separate. The aim ray is snapshotted when the attack is committed. At impact the ray is checked against the defender's current proxies. If they have moved, the shot can miss or strike a different zone; selecting Head does not automatically award a headshot.
- **Regional damage and armor** are calculated only by the existing pure combat domain: equipped helmet protects Head; unarmored weak points can generate precision criticals if the actual struck region matches. No GUI damage rules.
- **Feedback** uses structured hit outcomes: distinct critical, armor-absorbed, weak-point, miss and interception effects, damage numbers at actual impact location, and camera counter framing.
- **Camera director** adds an over-shoulder aim shot, enemy-attack shot, and counter/reaction shot while retaining current intro/decision/victory shots. Includes reduced-motion behavior.
- **Existing gameplay:** Energy, multi-action turns, legal enemy HFSM+Utility decisions, enemy equipment switching, telegraphs and build tracking remain intact.
- **Performance:** No expensive skinned-mesh collider simulation. Target proxies use small, shared game-authored sphere volumes, raycasts only on committed impact and manual targeting; one target-marker projection per render frame.

## Acceptance tests
1. Game header shows **v0.4.0-preview.3**, core **v0.4-C** and a fresh build identifier.
2. Enter an enemy attack with sword or bow: first dodge/parry is 0 Energy; in a successive combo reaction, the next defense costs its normal Energy, even if switching from dodge to parry.
3. Repeated defense at zero Energy is unavailable, but the first is always legal if that technique/weapon supports it.
4. Select Head when using the hero's arrow. Helmet hint should appear; the hit should be mitigated and not automatically crit. Aim at unarmored regions to compare damage.
5. Tap the enemy's head or torso on phone/desktop: selected region and crosshair should update.
6. If target movement displaces the collider from the snapshotted trajectory, the arrow misses rather than inventing a head hit.
7. On impact, appropriate armor/critical/weak-point text and VFX occur near the struck region; enemy parry and dodge still use the shared reaction resolver.
8. Camera transitions support aim, enemy attack and counter. No stuck state or animation regression after repeated attacks and restart.
9. Try mobile portrait/landscape, High/Mobile quality, FPS and restart. Verify aiming controls do not block combat buttons.

## Limitations / next work
- The hit-volume system is **gameplay-prototype grade**, not the final authored rig or full projectile-ballistic collision. Current attack rays are straight and based on a snapshot rather than full simulated projectile velocity, occlusion by environmental meshes or physically accurate armor shapes.
- Visuals are procedurally assembled placeholder warriors. Dedicated GLB assets, detailed animations, limb/armor socket authoring, camera QA and accessibility calibration remain a production polish phase.
- A one-enemy duel is still the current scope; multi-target aim, hostile projectiles ricocheting, true interruption/cancellation, replay capture and network reconciliation are future features.
- Browser/CI unit tests cannot replace hands-on GPU, mobile and end-to-end input testing.
