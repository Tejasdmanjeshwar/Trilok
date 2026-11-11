# Trilok v0.4-A.2 — Energy, chained attacks and bounded turn economy

## Delivered in the shared combat domain

- `EncounterRules`: `maxActionsPerTurn`, `energyRegenPerTurn`, `maxPerfectDefenseRefundPerTurn`, all validated.
- `TurnBudget`: remaining actions determined from `actionsUsed`, `moveUses`, and per-actor perfect-defense refunds used during the current combat turn.
- `AttackTurnPolicy`: `continue` or `end`, optional `maxUsesPerTurn`, and bounded `energyGainOnCompletion` (must end turn).
- `queueAttack` validates Energy, legal equipment and remaining action budget, then charges once at commitment and tracks the move use.
- `resolveReaction` progresses multi-hit attacks without additional attack costs. After the final hit it either returns control to the attacker or transitions to the next combatant.
- `endTurn` explicitly concludes an actor's optional remaining actions; it cannot cancel a pending hit.
- `transitionTurn` grants Energy regeneration exactly once to the next actor at their own turn start, capped at `maxResource`.
- Perfect weapon deflect/intercept can grant a configurable Energy refund; capped globally across the combat turn and capped at max Energy. Dodges do not gain the parry refund.
- Weapon switching is still restricted to the acting combatant, once per turn and paid from Energy.
- This is one generic implementation for player and NPC; neither bypasses costs/limits.

## Default authoring in `DEFAULT_COMBAT_CATALOG`

| Move | Cost | Continuation |
| --- | ---: | --- |
| Arrow | 1 Energy | Continue, max 3 uses |
| Quick sword slash | 2 Energy | Continue, max 3 uses |
| Heavy crush | 4 Energy | End, max 1 use |
| Recovery shot | 0 Energy, +2 on completion | End, max 1 use |
| Equipment switch | 2 Energy | Not an offensive action; once per actor turn |
| Dodge | 1 Energy | Defense |
| Weapon parry | 1 Energy; perfect may refund 1 | Defense |
| Projectile interception | 2 Energy; perfect may refund 1 | Defense |

`STANDARD_ENCOUNTER_RULES` is opt-in during migration: max 3 actions, +1 Energy per own turn, up to 2 Energy perfect-defense refunds across a turn. Actor Energy begins at the values passed to `createEncounter` (prototype suggestion 4/8), never silently reset.

## Compatibility and limitations

- `createEncounter` without explicit rules uses `LEGACY_ENCOUNTER_RULES` (1 offensive action, no regen, no refund), preserving the current pure-domain test baseline until the browser controller migrates. This is a temporary migration setting, not the intended final balancing profile.
- The deployed Three.js duel still uses the older one-on-one adapter. Energy chaining is not yet playable in the browser.
- Pending attacks cannot be interrupted/cancelled yet; the cost is paid on commitment and successful completion awards are applied once after the final hit. Interruption refunds require a deliberately specified policy before implementation.
- Regeneration is applied when a living actor becomes active; stunned-actor scheduling and multi-actor battle termination remain future domain work.
- Defense costs are paid for an actually selected reaction; choosing a legal defense outside its timing window still spends its cost. AI and UI must make this clear.
- Current catalog balancing is provisional and must be playtested before content scales.

## Tests

`tests/encounter-economy.test.ts` covers chained shots, action caps independent of Energy, move limits, recovery/finisher end-turn policy, once-per-turn regeneration, weapon-switch costs, perfect parry refund caps and legacy compatibility.

## Next

v0.4-A.3: target regions, regional armor, weak points and explainable damage. Then migrate the web encounter to v0.4 domain and implement HFSM + Utility enemy decisions.
