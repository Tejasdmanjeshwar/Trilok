# Trilok v0.4-A — Generic encounter domain

## Implemented
The pure TypeScript combat package now exports:
- `encounter-types.ts`: actor, move, equipment, reaction policy and pending-attack contracts.
- `encounter-catalog.ts`: data-driven default bow/sword, projectile/melee moves, defense techniques, profiles and catalog validation.
- `encounter.ts`: `createEncounter`, `equipCombatant`, `queueAttack`, `getLegalReactions`, `gradeReactionV2`, and `resolveReaction`.

Both hero and NPC use the same actor IDs and pure state transitions; the caller supplies an attacker, defender, impact tick, observed contact range and selected defense move.

### Default reaction matrix
| Incoming attack | Bow | Sword |
|---|---|---|
| Projectile | Dodge / countershot interception | Dodge / weapon deflection |
| Melee contact | Dodge | Dodge / weapon deflection |

Attack moves can extend, restrict or replace technique compatibility. Even with an override, an actor must have the defense equipped (or explicitly granted by its defense move), afford the resource cost and satisfy cooldown/status rules.

### Validations
- Attack selection never applies damage; damage is applied exactly once at resolution.
- Melee contact distance is checked independently from engagement distance at selection.
- Defenses have reaction grades, timing profiles, outcome multipliers and resource/cooldown costs.
- Equipment changes are turn-gated, loadout-gated, costed, and at most once per actor turn.
- Unknown IDs, conflicting policy allows/denies, invalid clocks, impossible ranges, and malformed catalogs reject explicitly.

## Migration boundary
**The deployed v0.3.2 browser demonstration is intentionally unchanged.**
The existing `packages/combat/src/index.ts` one-on-one API remains as a temporary compatibility surface. The new generic encounter domain is exported alongside it until the web orchestration is migrated and all UI/animation tests pass. The old branch should then be deleted, not maintained indefinitely. Enemy AI reactions and weapon switching are **not** yet playable.

## AI decision
Use **HFSM + Utility scoring** in v0.4-B. HFSM controls tactical phase and interruptions; utility scores only legal candidate actions. Deterministic seeded decisions, reasonable error rates, no rule bypass. GOAP deferred until a real encounter demonstrates multi-step planning needs.

## Next
- v0.4-B: migrate web to the generic state machine, build data-driven HFSM + Utility enemy decision module, and enable NPC defense/switch behavior.
- v0.4-C: mirrored cinematic reaction/interception/weapon swap animation and visual feedback.
- v0.4-D: balancing, mobile profiling, replay determinism and runtime integration regression tests.

## Known limitations
The encounter core does not yet handle persistent stun scheduling, actor positions as authoritative spatial state, multiplayer, multi-target AoE, or a full action-point economy. These should be introduced based on tested encounter requirements, not speculative abstractions.
