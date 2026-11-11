# Trilok v0.4-B0 — First playable advanced combat preview

## Release
Playable version **v0.4.0-preview.1**, combat core **v0.4-A.3**, release channel **preview**. Every Vite build still has a unique Git commit/time build ID.

## In scope
- Replace browser-only BattleState with the generic EncounterSession backed by @trilok/combat.
- Energy bar and numeric balances for both combatants; actions remaining and turn index.
- Data-driven move chooser: Bow Arrow (1 Energy, continues), Recovery Shot (0, +2 Energy, ends turn), Sword Quick Slash (2 Energy, continues), Heavy Crush (4 Energy, ends turn).
- Sword/bow swapping costs 2 Energy, once per actor turn.
- End Turn button; remaining Energy does not force an action.
- Enemy **scripted** melee strike, rendered with the prior Rakshasa sword windup and authoritative 1850 ms hit marker. This is intentionally not the upcoming HFSM/Utility AI.
- The shared getLegalAttackMoves / getLegalReactions / resolveReaction pipeline controls actor turns, attack costs, legal defenses, reaction windows, HP and outcomes for both actors.
- The defender has the full melee 400 ms dodge / 200 ms parry defaults, with timing graded by the domain rather than frame rate.
- Defenses consume Energy; perfect parry refunds depend on the same core catalog. The enemy has a helmet in the data but this prototype deliberately targets the default torso region.
- Cinematic camera, shader arena, actors, projectile and pooled feedback remain presentation-only.
- Restart clears all pending choreography, movement, Energy and HP.

## Architectural boundaries
The browser adapter lives in apps/web/src/combat/EncounterSession.ts, and the static encounter recipe in preview-encounter.ts. Both use @trilok/combat; they don't maintain separate HP/damage/energy totals. The UI and scripted enemy select from legal domain moves.

No backwards-compatibility player-turn rules are used in the browser anymore. However, packages/combat still exports earlier 0.3.x symbols until a separate regression/consumer audit removes them safely.

## Known preview limitations
- Enemy turn is scripted overhead sword only. Enemy weapon swapping and parry/dodge choices are deferred to HFSM + Utility AI in v0.4-B1.
- Per-body-part free-aim raycasts and precise projectile interception animation are not yet wired; actor-targeted torso impacts are used as a stable integration step.
- Single-target encounter choreography uses existing placeholder rigs, not mocap. Heavy attack reuses melee motion and scaled playback.
- Manual browser and mobile visual/performance testing is needed; CI is a TypeScript/domain/build test, not a GPU/browser interaction test.

## Verification
1. Header reads COMBAT ARENA · V0.4.0-preview.1 and BUILD badge shows latest commit and timestamp.
2. Select Arrow and attack two or three times in one player turn; Energy decreases, actions remaining update, enemy HP decreases once per impact.
3. Select Recovery Shot; the turn ends and Energy restores 2 (subject to max).
4. Equip Sword: costs 2 Energy; Quick Slash may continue while Heavy Crush ends the turn.
5. Use End Turn at any player decision. The enemy approaches and winds up.
6. With bow, Dodge works and Parry is disabled; with sword, both are legal when Energy allows.
7. Test early/late dodge/parry around 1850 ms overhead impact; a missed input takes damage, a perfect input avoids it.
8. Restart returns starting HP and Energy; High/Mobile quality and FPS work.
