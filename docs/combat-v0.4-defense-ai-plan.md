# Trilok Combat v0.4 — Symmetric Defense, Enemy AI and Move-Level Rule Overrides

Status: **v0.4-A pure combat domain and catalog implemented**; web encounter adapter and AI/presentation are scheduled for v0.4-B/C. Baseline: playable v0.3.2. The v0.3.x duel remains active pending migration. Do not mark enemy reactions as playable yet.
Owner: combat domain + choreography + AI + presentation adapters.
Priority: implement before adding many enemies, large ability catalogs, or final character art.

## Goals and non-goals

1. Both player and NPCs can **attack, react, parry, dodge, and switch equipped weapons** using the same combat rules. AI selects legal actions rather than receiving privileged outcomes.
2. Parry legality depends on the **incoming attack delivery**, **defender's equipment/techniques**, **resources and state**, and **per-move policy**, not on a single `enablesParry: boolean`.
3. Attacks are pending actions with an attacker, defender, hit marker, telegraph, and possible reaction. **Both sides** receive an identical opportunity to react, subject to different control strategies (human input versus AI).
4. Keep combat data deterministic and engine-agnostic. Three.js, WebAudio, clocks, animation, particles, and camera movement remain outside `packages/combat`.
5. Special abilities may change/override the defaults **per move**, with explicit validated rules. The design must support future party combat, multiple projectiles, area attacks, and boss phases without special-casing individual enemies.
6. Keep implementation scoped: no full navigation mesh, arbitrary projectile interception physics, online netcode, or final model/animation pipeline in this milestone.

## Default defense matrix (v0.4)

| Incoming attack delivery | Defender equipment | Legal reactions by default | Presentation |
| --- | --- | --- | --- |
| Ranged projectile | Ranged weapon with projectile-intercept capability | **Ranged parry / interception** or **dodge** | Shoot/deflect the incoming projectile with a counter projectile; or evade |
| Ranged projectile | Melee weapon with deflection capability | **Melee parry / deflection** or **dodge** | Deflect incoming arrow/weapon with melee weapon; or evade |
| Melee contact | Ranged-only weapon | **Dodge** | Move out of reach; cannot normally parry a sword with a bow |
| Melee contact | Melee weapon with deflection capability | **Melee parry** or **dodge** | Weapon clash or evasive movement |

**Important:** The table describes defaults for compatible, reactable single-target strikes. Special moves, actors, statuses and techniques can narrow or explicitly extend the choices. A ranged weapon does **not** automatically intercept every projectile if it lacks the necessary interception move, ammunition, timing, line of sight, or resource.

Parry is a **reaction result category**, not a single animation: the resolved technique must be distinguished as `projectile_intercept` versus `weapon_deflect`. Dodge is a separate technique and cannot be silently reinterpreted as a parry.

## Model and API boundary (proposed, refine during implementation)

```ts
type AttackDelivery = "melee_contact" | "ranged_projectile" | "area"; // area future
type ReactionKind = "dodge" | "parry";
type ParryTechnique = "weapon_deflect" | "projectile_intercept";
type ReactionTechnique = "dodge" | ParryTechnique;

interface AttackMove {
  id: string;
  delivery: AttackDelivery;
  tags: readonly string[];            // e.g. unblockable, piercing, homing
  rangeMeters: number;
  impactMarkersMs: readonly number[]; // multi-hit ready
  reactionPolicy?: ReactionPolicyOverride;
}

interface Equipment {
  id: string;
  attackMoveIds: readonly string[];
  reactionTechniques: readonly ReactionTechnique[];
  switchCost: number;
}

interface DefenseMove {
  id: string;
  technique: ReactionTechnique;
  cost: number;
  cooldownTurns?: number;
  reactionPolicy?: ReactionPolicyOverride;
}

interface ReactionPolicyOverride {
  mode?: "inherit" | "extend" | "replace";
  allow?: readonly ReactionTechnique[];
  deny?: readonly ReactionTechnique[];
  // Explicit timing/effect adjustments are move data, validated at load.
  timingProfileId?: string;
  outcomeProfileId?: string;
}

interface PendingAttack {
  attackerId: string;
  defenderId: string;
  attackMoveId: string;
  begunAtTick: number;
  impactTick: number;
}
```

This is an **illustrative data contract**, not a requirement to introduce all interfaces/packages at once. Keep the actual implementation minimal and evolve it with tests. Prefer stable IDs and registries over direct object references in serializable battle state.

### Eligibility resolution — one pure function for heroes and AI

Planned signature: `getLegalReactions(context: ReactionContext): readonly ReactionOption[]`, returning **technique + defense move + cost + timing profile**, not just a boolean.

Evaluate, in order:

1. Resolve incoming **attack move**, delivery type, tags, hit geometry and reaction restrictions.
2. Resolve defender's equipped weapon(s), learned reaction techniques, status effects and currently permitted switch/stance.
3. Apply default attack-versus-defense compatibility (matrix above).
4. Apply the incoming attack move's validated `reactionPolicy` and the defender's move-specific policy. Explicit allow/extend cannot create a missing capability or bypass required resources unless the move **explicitly grants that special capability**.
5. Filter by resource, cooldown, telegraph visibility, projectile feasibility, and action/state restrictions. Resolve precedence deterministically: **explicit deny wins**, unless a separately modeled special immunity-bypass effect declares otherwise.
6. Return legal choices with reasons for rejection (debug/UI/AI). Use one authoritative `resolveReaction` that accepts a selected legal technique and timing grade and outputs state events.

The `ReactionGrade` (perfect, normal, partial, miss) is independent of technique. Do not reuse the existing grade name `parry` as the action kind; rename that grade to `good`/equivalent during migration to avoid ambiguity.

Default "unblockable" should disable ordinary parries, not necessarily dodges. "Undodgeable" should disable ordinary dodges, not ordinary parries. A truly unavoidable move is a separate, clearly telegraphed gameplay design choice and should not dominate encounters.

## Move-level overrides: examples

| Move | Policy delta | Result |
| --- | --- | --- |
| Standard arrow | Inherit | Bow can intercept, sword can deflect, either can dodge |
| Sword slash | Inherit | Melee can parry, ranged-only actor dodges |
| Heavy crushing strike | Deny `weapon_deflect` | Evade or use an explicitly granted special counter |
| Guided projectile | Deny `dodge` unless a move grants an anti-homing evade | Projectile interception or deflection become more valuable |
| Divine interception shot | Grants `projectile_intercept` with cost and special timing | May counter a specified attack type beyond the default rules |
| Counter-stance skill | Extends `weapon_deflect` for an explicit move/tag at a resource cost | Exception is local to the skill; no global hardcoded boss logic |

Preserve attack move overrides and defender reaction move overrides as **data**, not nested conditionals inside `main.ts` or enemy-specific branches. Validate invalid combinations at load time (unknown technique IDs, contradictory allow/deny, missing animations, impossible timing windows).

## AI architecture decision — HFSM + Utility scoring (GOAP deferred)

**Decision:** Implement a lightweight hierarchical finite state machine (HFSM) for tactical mode, action availability, interruptions, and recovery, plus a bounded utility scorer to rank actions legal under the shared combat domain. **Do not use GOAP in baseline v0.4-B.**

- The encounter state and reaction legality are authoritative. The HFSM provides *context* (observing, deciding, approaching, attacking, reacting, recovering, staggered, boss phase), never independent damage or eligibility rules.
- A tactical HFSM state filters candidate intents and provides interruption/commitment rules. A utility scorer evaluates only the currently legal intents (attack, guard/deflect, projectile intercept, dodge, reposition, switch weapon, wait).
- Utility factors should include projected damage, target distance, survivability, resource/stamina, animation commitment, telegraph perception, timing uncertainty, cooldown, switch cost, recent action repetition, and encounter personality.
- Use explicit, data-authored score curves with sensible normalization, reproducible seeded noise/tie-breaking, hysteresis (to avoid oscillation), and per-actor decision frequency/budget; record selection traces for tuning.
- For reaction events, the AI chooses from `getLegalReactions()` and submits a plausible timestamp based on perception/reaction profile. No omniscient instant parries; difficulty modifies perception delay and skill, not access to illegal moves or hidden information.
- The HFSM is small and event-driven, not a general-purpose behavior-tree/GOAP platform. An enemy can intentionally miss or choose an inferior legal action; tune competence rather than forcing perfect play.
- Introduce GOAP only if a concrete encounter requires **multi-step resource/state planning** that a local utility scorer cannot express, e.g., disarm guard -> build stagger -> exploit vulnerability. It would produce strategic goals/plans, while HFSM manages execution and combat domain validates every step. Benchmark its planning costs before adopting.
- Package boundary: pure TS `packages/combat-ai` depends on `packages/combat` contracts; the core never imports AI. Presentation consumes combat events, not AI private state.
- Add deterministic HFSM transitions, utility score ranking, interruption, resource scarcity, anti-repetition, and performance tests in v0.4-B.

## Symmetric combat and enemy behavior

- Replace `player_turn -> enemy_windup` and `strike(state)`'s immediate damage assumption with a **generic action lifecycle**:
  `Select action -> Equip/position -> Telegraph -> Defender reaction -> Contact/impact -> Resolve -> Recovery -> Next actor`.
- A `PendingAttack` must support any attacker and any defender, so enemies can dodge/parry **player** arrows and melee attacks; this is not cosmetic.
- Defender-controlled input uses the existing `ReactionBuffer`; AI issues a timestamped reaction decision through the **same** validation path. Neither input source may bypass legality or reaction timing.
- Enemy equipment includes loadout slots and switching capability. Initial enemy can choose sword or bow based on distance, a readable stance, available resources, and a per-encounter AI strategy. Weapon swap consumes an action cost, commitment window, or cooldown; **no unexplained instant swaps at the point of impact**.
- Switching is ordinarily legal only in decision/recovery states. Exception: explicit quick-draw/counter-swap move with cost, telegraph and timing defined in the move, shared by player/NPC.
- NPC strategy ranks legal options (attack, switch, dodge, intercept, deflect, wait) by health, distance, weapon reach, stamina, current tactical objective, and difficulty. Implement it as a **deterministic seeded policy** with a bounded decision budget and explicit profiles.
- Enemy defense should have **imperfection and cost**. No always-perfect counters: reaction precision, cooldown, stamina/ammo, occasional mistakes, vulnerability windows, and offense/defense tradeoffs must be tunable. Avoid opaque RNG auto-immunity; expose enemy intent and outcomes clearly.
- An NPC ranged interception must have authored projectile trajectories and readable counter-shot telegraphs. The **rules** decide hit/intercept; visual collision merely depicts the resolved event.
- Multi-hit attacks should eventually evaluate distinct reaction windows and costs for each authored hit, without double-applying damage on a frame skip.

## Presentation responsibilities

- New enemy reactions require dodge clips, deflect/weapon-clash clips, counter-projectile clips, weapon swap clips and equipment visibility. Reuse a symmetric animation driver for hero and enemy.
- `CombatCameraDirector` chooses readable framing when **either** actor attacks or defends; no hardcoded `hero always attacks` assumption.
- `CombatMovementController` handles approach, evasive displacement, return to stance, and target-relative anchors. It must not calculate authoritative damage or legality.
- `CombatFeedback` and `CombatAudio` react to domain events (intercept, deflect, dodge, partial guard, miss), independent of who performed them; no extra gameplay rules there.
- Enemy weapon swap must be visually obvious before the next attack and reflected in HUD/intent; player should be able to anticipate and respond.
- Player targeting, AI planning, and UI all consume the same reaction-option query rather than duplicating eligibility logic.

## Implementation stages

### v0.4-A — Domain/data model
1. [x] Add authored attack/defense/equipment catalogs and explicit reaction policy overrides with validation.
2. [x] Implement generic pure `getLegalReactions()`, `queueAttack()`, `resolveReaction()`, `equipCombatant()` and encounter state.
3. [ ] Migrate v0.3.x browser presentation from hero-only combat API to the generic encounter controller during v0.4-B; remove the temporary legacy compatibility interface once UI/animation tests pass.
4. [x] Add headless tests for four matrix cases, overrides, symmetric attack direction, costs, timing and reach.

### v0.4-B — Enemy decisions and counterplay
1. Implement seeded `EnemyCombatPolicy` based on the same legal-action query and known telegraphs.
2. Let enemy equip/switch between sword and bow on its own turn with costs/cooldowns.
3. Allow enemy to parry or dodge a player attack using the same reaction scheduler and damage resolver.
4. Tune enemy profiles (novice, capable, elite): perception delay, reaction variance, resource usage and risk appetite.

### v0.4-C — Choreography and presentation
1. Player and enemy share attack, defensive and weapon-swap animation interfaces.
2. Add countershot interception, weapon deflection, dodge and weapon switch VFX/audio.
3. Improve camera composition for mirrored roles and ensure readable telegraph timing.
4. Preserve graceful mobile profile and keyboard/touch input accessibility.

### v0.4-D — Reliability / balance
1. Test both-direction attack resolution, equip/swap legality, range, costs, cooldowns, status constraints and move overrides.
2. Test all four default matrix rows, allowed/forbidden override combinations, no invalid parry with bow versus sword, and special interception exceptions.
3. Test deterministic AI with fixed seed, bounded AI response and frame-skip/restart/interrupt behavior.
4. Check a player can reliably land attacks (AI is not always invulnerable) and that skilled defense remains rewarding.
5. Run typecheck, unit tests, build, and manual mobile browser profiling before marking complete.

## Acceptance criteria

- [ ] Either side can switch weapons using the same legal equipment transition.
- [ ] Either side can respond to an attack with the same legal reaction resolution; AI uses it, too.
- [ ] Ranged projectile can be parried by a capable ranged countershot **or** melee deflection, and can be dodged.
- [ ] Melee contact attack can be parried by capable melee equipment or dodged; ranged-only equipment cannot ordinarily parry it.
- [ ] Per-move overrides can deny or explicitly grant specific counter techniques without branching on attacker identity.
- [ ] Resources, cooldowns, timing, reach and choreography are validated centrally.
- [ ] AI sometimes dodges, parries, switches weapons and sometimes fails, with clearly readable feedback.
- [ ] Existing v0.3.x duel mechanics, camera and mobile controls regressions are covered by tests.
- [ ] Core logic remains deterministic, pure and renderer-independent; UI, effects, camera and AI all consume the same domain decisions.

## SOLID / DRY guardrails

- **SRP:** attack legality, damage, AI decisions, equipment, movement, animation and feedback have distinct responsibilities.
- **OCP:** register new weapon/move/counter data without editing giant per-weapon condition chains.
- **LSP/ISP:** interfaces expose actor capabilities and narrowly typed actions; don't require every actor to implement every defense.
- **DIP:** AI and presentation depend on shared combat contracts/events, not on each other or on concrete browser objects.
- **DRY:** a single rule evaluator and reaction resolver for player/NPC; a single attack lifecycle; data-driven overrides; one timing source. Avoid premature abstraction, subclass trees or duplicating the old combat functions.

**This file is the implementation plan. No gameplay code was changed by writing it.**
