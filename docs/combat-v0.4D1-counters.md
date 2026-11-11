# Trilok v0.4-D1 — Move-Authored Perfect Intercepts and Ripostes

## Design decision
Reactive defense is an actual weapon action, not a generic flash:
- **Bow projectile interception** animates the bow countershot action at interception, destroys/neutralizes the incoming shot through domain reaction damage=0, then (if perfect and allowed by the incoming move) automatically launches a stronger retaliatory arrow.
- **Melee sword parry** animates a blade deflection, then only a *perfect* successful parry invokes the separately authored strong sword riposte.
- **Dodge** never grants a counter by default.
- Good/partial/miss defensive timing doesn't spawn a counter, even if some damage was prevented.
- Counterattack is explicitly **unreactable** (no parry, dodge, projectile interception or counter-counter): a terminal retaliation, not a new attack decision phase.
- Both parties use the same rules and audiovisual path; counters do not consume extra Energy or actions.

## Domain contracts
- \`DefenseSpec.perfectCounterId\` is optional and references \`CombatCatalog.counters\`.
- \`AttackSpec.counterPolicy\` is optional: \`allow\` uses defender's authored counter, \`deny\` prohibits it, and \`override\` references a different authored counter ID.
- \`CounterSpec\` authors damage, type, delivery, visual presentation and impact offset. There is one immutable \`PendingCounter\` and separate \`resolveCounter\` impact resolver; there is **no recursive reaction queue**.
- \`ReactionResolution.outcome.counter\` contains the pre-authorized automatic response, or null.
- Domain consumes no Three.js classes; presentation gets one authoritative plan, effects and damage result.
- The generic default catalog leaves perfectCounterId unset for backward-compatible combat consumers. The Trilok preview recipe enables sword and bow counters explicitly. Heavy attack's authored policy denies counter retaliation.

## Choreography
- Bow-intercept animation has bow draw/arm release rather than sword-parry pose.
- Strong sword riposte has its own named clip (not a generic hit reaction).
- Bow countershot release occurs at 300ms, impact at 710ms. Sword riposte impact occurs at 560ms. Combat domain owns impact outcomes and exact HP updates.
- Presentation cues only trigger sound, sparks and animation. They cannot change damage.

## Verification
1. Perfect bow interception with equipped bow produces countershot and extra opponent damage **at counter impact**, not instantly.
2. Perfect sword deflection produces strong melee riposte and extra damage **at riposte impact**.
3. Good/partial deflections, dodges and missed reactions do not counter.
4. Move policy can disable or override a counter.
5. Counter is unreactable and cannot start a second counter.
6. Energy rule remains: first defense free, successive defensive actions cost Energy.
7. Test both hero and AI, mobile frame skips, restart and weapon equipment.
