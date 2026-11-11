# Trilok v0.4-D5 / D6 — Synchronized impacts and extensible wound effects

Status: Playable prototype, subject to manual browser/mobile validation. Both slices share a single authoritative contact contract.

## D5: First-contact damage/animation synchronization
- The source of truth for a ballistic projectile's body hit is the first **swept** intersection along its authored trajectory, not its scheduled endpoint.
- \`CombatHitVolumes.firstTrajectoryContact\` returns anatomical region, world-space contact point, contact normal, integer contact tick, instantaneous velocity and animation attachment object. Sampling is deterministic at bounded ≤12ms segments, irrespective of frame duration. A fractional contact inside a segment is interpolated to an integer tick.
- For normal ranged shots, the browser probes from release to the current simulation tick, and calls the same \`EncounterSession.resolveIfReady\` at contact (or reports an explicit miss once the authorized attack interval ends). Interceptions continue using the authoritative clash solver.
- For surviving intercept projectiles, the browser probes **from the clash** to the current tick. The existing \`pendingProjectile\` resolves at first contact rather than letting the arrow pass the target until a planned future deadline.
- Domain resolvers accept **contactTick only with contact=true**, within the attack/survival bounds. They allow early contact but never resolve before contact. Once consumed, the matching pending attack/projectile is cleared; repeats cannot deal damage again.
- Render handling stops the arrow before its next render update, and the same contact triggers HP, audio, camera impulse, faster region-based recoil, and damage text. No independent 'arrow_hit' animation timestamp grants damage anymore; it remains a timeout fallback.
- Hit-volume raycasters reset the screen-picking near/far range separately to prevent tiny swept rays from clipping manual camera aim.
- The current collision proxy represents the *current* animated pose; historical animation rewind and exact per-frame bone time interpolation are future production work.

## D6: Author-authored effect routing and persistent wounds
- Each attack optionally declares \`impactEffects: [{id,when}]\`. \`when\` is \`damage\` or \`critical\`. This is **data**, not a hardcoded \`if (arrow)\` or \`if (blood)\` in the rules.
- Pure \`selectImpactEffects\` reads already-resolved damage/critical status and selects effect IDs. The \`ImpactEffectDirector\` browser registry maps IDs to presentation handlers and prevents duplicate dispatches.
- Preview precision arrow authoring: \`blood_splat\` and \`embed_arrow\` on confirmed critical damage. Recovery shot declares no persistent effects. Other moves can specify different IDs independently.
- Blood uses pooled, brief red particles at the authoritative hit point. No additional gameplay damage is applied by blood VFX.
- Embedding **transfers the original flying arrow Group**, not a replacement shot, into the affected animated skeletal attachment using world-preserving Three.js reparenting. It then replenishes the pooled flight slot. At most eight wound meshes persist in the arena; older wounds are disposed, and restart/dispose clears them.
- Hit reactions include a fast full recoil, a heavy critical recoil, and localized upper-limb/head reactions. Existing generated warriors and authored GLBs can reuse the motion interface.
- **New effects**: a future attack can declare \`{id:"burn_fx",when:"damage"}\` or \`{id:"freeze_fx",when:"critical"}\`, and a renderer can register a handler. **This does not implement actual damage-over-time, status durations or movement freezing**; those belong in a separate, data-driven gameplay status layer, which should subscribe to the same confirmed hit event.
- Armor can suppress critical hits. An armored critical-ineligible hit must not embed or produce a critical blood burst.

## SOLID / DRY contract
- Domain: combat legality, actual damage, critical evaluation, effect eligibility and one-time impact consumption.
- Spatial adapter: actual contact at a rig-following body volume, accurate region/normal/velocity/time and bone anchor.
- Presentation dispatcher: typed confirmed impact context, effect handler registration and bounded deduplication.
- Projectile renderer: owns visual meshes and attachment lifecycle; does not calculate damage or critical eligibility.
- Browser orchestrator: relays events and does not invent damage, force a hit after trajectory overshoot, or duplicate effect selection.

## Acceptance tests
1. A projectile that first contacts a limb at time T triggers exactly one damage result, hit animation, number, sound and impact effect in the rendered frame handling T; not a later fixed attack marker.
2. A slow-render callback that jumps across T detects the first swept contact and stops/transfers the arrow before drawing it through the body.
3. A ballistic miss passes through the attack interval with no hit, no embedded arrow, and no blood burst.
4. Surviving interception arrows resolve at the first body contact; projectile identity and trajectory continuity are preserved.
5. Critical precision arrow on exposed eligible region lodges at its actual point on the rig. The arrow stays attached while the body part animates.
6. Headshot blocked by critical-suppressing helmet has no critical-only embed or blood.
7. Lightweight/recovery shot never embeds, even if it deals damage.
8. Restart frees wounds and resets effect deduplication.
9. Test both camera sides, mouse/touch, slow/high FPS simulation, animation clipping and reduced motion.
10. Verify visual polish in real browsers: the CI's scene/math tests do not constitute mobile GPU end-to-end validation.

## Limitations
The contact query uses coarse invisible sphere proxies and the current rig pose; it is not high-fidelity skinned-triangle collision. Wound mesh depth is stylized, not physically modeled skin penetration; production character assets will need improved anatomical anchors and optional decals. Eight global embedded arrows is a prototype performance cap. Blood is a short-lived visual effect rather than a persistent bleeding status.

### Preview exposure and move authoring
The enemy's iron helmet still suppresses **head** criticals. To make the mechanic testable without removing armor, the humanoid anatomy now exposes a smaller, unarmored **neck** region as a precision-critical target. The spatial proxy follows the torso rig. Defense moves may also author `impactEffects` so future surviving counter projectiles use the same effect-selection pipeline as regular attacks.
