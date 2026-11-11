# Trilok v0.4-D3 — One Continuous Projectile Clash

## Status
Prototype implementation, pending live browser/mobile visual verification. Supersedes the **ranged** half of v0.4-D1, retaining the separate melee sword riposte.

## Physical contract
1. Player A releases a projectile at its authored bow-release cue. That creates a stable projectile ID and a persistent mesh.
2. Player B may select a projectile-interception defense. Its **existing intercept bow animation releases B's arrow once**, at an earlier authored interception time.
3. The two arrows travel concurrently toward a **pre-impact clash tick** and collide midair. The domain chooses whether the incoming arrow survives, the interception arrow survives or both shatter. A pooled particle/spark burst, impact audio, camera impulse and brief feedback accompany the clash.
4. Any surviving arrow retains **the same projectile ID and same visual mesh**, redirects from its existing location, then travels to the original attacker/defender. Damage applies only when it reaches the combatant.
5. **No separate bow draw, second release animation, new arrow, or extra counter action.** The free-first-defense Energy system remains intact. Melee-melee perfect parry retains its separately authored sword riposte.

## Authored power model
- An attack can author `AttackSpec.projectilePower` (fallback power 10 for old definitions).
- An equipped intercept move can author `DefenseSpec.projectileInterception`: power, pre-impact launch lead, pre-impact clash lead, continuation duration/damage, deadband, and per-grade power multipliers.
- For the prototype, impact offset 1150ms, bow release 715ms, defender intercept launch 315ms before hit, and clash 115ms before original hit. This makes both arrows visible before contact.
- The outcome compares `interceptorPower × timingGradeMultiplier` with incoming power, using an authored deadband:
  - **Incoming survives:** weaker defensive projectile breaks; original arrow continues with power-scaled damage.
  - **Mutual destruction:** comparable opposing strengths; both arrows break, neither combatant takes projectile damage.
  - **Interceptor survives:** defending arrow destroys its opponent and continues automatically as a counter, scaled by residual power.
- A stronger authored intercept can survive on *good* timing, and a weak one can fail even on *perfect* timing. Combat skill is separate from projectile strength.
- Incoming `counterPolicy: {mode:"deny"}` suppresses surviving interceptor follow-through. A ranged override may supply continuation damage; it **cannot** create a separate sword riposte from a projectile clash.

## Domain / presentation split
- `packages/combat/src/encounter-clash.ts` determines the clash from authored moves, timing and strength without Three.js or browser dependencies.
- `ReactionResolution.outcome.projectileClash` contains exact projectile identities, powers, collision time, outcome, and optional continuation.
- `EncounterState.pendingProjectile` blocks new actions while an unresolved survivor remains in flight. `resolveProjectileContinuation` applies damage at its own contact event, not at the earlier clash.
- `apps/web/src/effects/ProjectileClashEffects.ts` renders two pooled arrow meshes/trails and pooled spark fragments; only visual continuity and effects live there.
- `apps/web/src/main.ts` fires the intercepting projectile during the reaction, not after the first attack ends, and uses authoritative clash + continuation events for animation timing.
- `EncounterSession` handles player and AI through the same graded reaction and projectile continuation rules.

## Verification
1. Equip bows for two ranged combatants. A fires; B intercepts; two actual arrows are visible and collide in midair.
2. Perfect/strong intercept: A's arrow breaks, B's arrow keeps flying to A and deals damage at contact **without a second bow animation**.
3. Good/equal clash: both arrows break in a sharp particle/audio burst; no delayed hit or counter.
4. Partial/weak clash: B's arrow breaks; A's arrow keeps flying and can still deal damage.
5. Alter move-level power and policies: stronger good-timed intercept can win; deny prevents counter continuation.
6. Early/late inputs and no intercept preserve normal timing and damage rules. First intercept free, later reactions cost Energy.
7. Sword melee perfect parry still plays its independent sword riposte; arrow clashes never trigger sword ripostes.
8. Repeat on mobile, restart and low/high graphics. Slow frames should not apply duplicate damage or resurrect destroyed arrows.

## Honest limitations
The current prototype uses deterministic pre-impact collision markers and straight 3D trajectories, rather than a true continuous ballistic solver for arbitrarily moving projectiles and environmental occlusion. Collision position is derived from the incoming arrow's flight at its authored clash tick. These choices preserve order-independent combat truth and low mobile runtime cost. Multi-projectile volleys, arbitrary asynchronous collisions, detailed ricochet physics and full 3D obstruction need additional work. Live browser/mobile testing is still required; CI cannot validate rendering feel.
