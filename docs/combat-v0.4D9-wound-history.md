# Trilok D9 — Persistent Arrow Wound History

## Player experience
Multiple confirmed arrow impacts remain visibly attached to the damaged character rather than disappearing on the next attack. The damage readout includes a count of lodged arrows as an observable record of combat. Wound marks remain as history until encounter reset or the bounded decal collection rotates them out.

## Retention
Persistence is calculated strictly from authoritative combat outcomes, never from RNG.
- **Minor**: 1–11 effective damage, retained for 2 combat turns.
- **Deep**: 12–23 damage or an exposed weak-point hit, retained for 3 combat turns.
- **Severe**: 24+ damage or a true critical, retained to the end of combat.
The policy can be substituted via `ArrowWoundRules` without editing combat mechanics.

## Ownership and lifecycle
`ProjectileClashEffects` retains up to 16 original lodged arrow meshes, including per-defender identity and optional expiration turn. Two flight slots still handle in-flight and intercepting arrows. `clearActive()` retires only active projectiles between attacks; `clear()` clears both active and embedded arrows on restart. `expireTurn()` retires eligible temporary arrows; severe arrows persist through victory/defeat until restart/disposal. At the render cap, older temporary arrows rotate out before encounter-long ones. The renderer never stores private combat HP state.

`ImpactEffectDirector` receives the resolved `DamageBreakdown` and turn number as optional context. Attack authors request `wound_mark` and `embed_arrow` on confirmed damage; critical blood is independent. Each request is deduplicated by resolved hit ID. Both ordinary and enemy bow attacks author persistent effects; recovery shots do not.

## Safety and extensions
Persistent arrows are visual-only and do not change combat economics, hit probability or bleeding rules. All lodged arrows follow the same animated anatomical anchor as the collision volume. Restart and disposal release all geometries and materials; temporary and permanent arrows are independently tested. Future status effects or player-controlled arrow extraction should use combat-domain actions, not renderer state.

## Acceptance
Repeated successive hits retain separate arrows, expiration respects the configured turn threshold, severe arrows survive until restart, original projectile identity is preserved on the bone, and none of this destabilizes interception or ongoing turns. Check low/high graphics and narrow/mobile screens in the live browser after CI.
