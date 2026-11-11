# Trilok Combat v0.4 — Symmetric Combat, Reactive Timing, Energy, Precision Targeting and AI

Status: **v0.4-A shared encounter domain implemented**. **v0.4-A.1 variable reaction windows and core multi-hit pending-hit resolution are now implemented in the pure domain. Energy multi-action turns are now implemented in the pure domain. Body-region targeting and armor damage are now implemented in the pure domain. Enemy AI and the browser adapter remain planned, not implemented.** Browser baseline remains playable v0.3.2 pending migration from the legacy duel adapter.
Design revision: **2026-11-11 — post-audit update, documentation only**.
Owner: combat domain + choreography + AI + presentation adapters.
Priority: stabilize authoritative timing, multi-action resource economy and regional damage before scaling enemy content or replacing character art. Design inspiration: Expedition 33 combines AP-funded actions, repeated free-aim attacks, weak points and real-time reactions; Trilok will use its own cost, timing and damage balance.

## Goals and non-goals

1. Both player and NPCs can **attack, react, parry, dodge, and switch equipped weapons** using the same combat rules. AI selects legal actions rather than receiving privileged outcomes.
2. Parry legality depends on the **incoming attack delivery**, **defender's equipment/techniques**, **resources and state**, and **per-move policy**, not on a single `enablesParry: boolean`.
3. Attacks are pending actions with an attacker, defender, hit marker, telegraph, and possible reaction. **Both sides** receive an identical opportunity to react, subject to different control strategies (human input versus AI).
4. Keep combat data deterministic and engine-agnostic. Three.js, WebAudio, clocks, animation, particles, and camera movement remain outside `packages/combat`.
5. Special abilities may change/override the defaults **per move**, with explicit validated rules. The design must support future party combat, multiple projectiles, area attacks, and boss phases without special-casing individual enemies.
6. Support **delivery-specific, defense-specific and move-overridden reaction timing** so ranged and melee attacks need not share parry/dodge windows.
7. Support **Energy**, multiple legal offensive actions per turn, and an independent action budget with strict anti-loop guardrails.
8. Support **free-aim target regions, armor coverage, weaknesses and deterministic critical/damage calculation** for both players and NPCs.
9. Keep implementation scoped: no full navigation mesh, ballistic simulation, per-pixel armor simulation, anatomical injury physics, online netcode or final model/animation pipeline in this milestone.

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


## v0.4 post-audit design decisions (2026-11-11)

The following features were reviewed after v0.4-A landed. **All new mechanics in this section are requirements for future implementation; they are NOT yet part of the deployed browser demonstration or complete in the domain.** The existing v0.4-A attack catalog has basic resourceCost and a shared timing profile, but no turn-continuation economy, per-delivery defaults, regional anatomy or armor simulation.

### A. Variable defensive timing: delivery defaults, move overrides and accessibility

A defense window is defined by the actual attack, the chosen defense technique and the current context. **Parry/interception is normally tighter than dodge**. Ranged attacks start with narrower defaults than melee attacks, but the individual move takes precedence. A visible, slow projectile can be easier to react to than a fast point-blank sword thrust. Telegraph duration and the valid reaction input window are separate properties.

**Proposed starting window sizes for tuning (not copied from Expedition 33):**

| Incoming attack | Defense technique | Total accepted window | Early / late from impact |
| --- | --- | ---: | --- |
| Melee contact | Weapon parry | 200 ms | -130 / +70 ms |
| Melee contact | Dodge | 400 ms | -280 / +120 ms |
| Ranged projectile | Weapon deflection or projectile intercept | 140 ms | -90 / +50 ms |
| Ranged projectile | Dodge | 260 ms | -170 / +90 ms |

These are **illustrative**, not final playtest values. Grade thresholds (perfect/good/partial/miss) must be defined separately within the accepted early/late window, not inferred from a single absolute-value bound. Timing is relative to an **authored impact marker**. Animation anticipation, projectile speed/visible travel, sound, target distance and input latency determine how fair a move feels.

**EffectiveTimingResolver, one pure function used by player and AI:**
1. Choose attack delivery x defense technique default timing profile.
2. Apply specific attack-move timing override (full profile replacement or explicit additive modifiers); distinguish quick thrust, charged arrow, homing missile, etc.
3. Apply defender technique/skill, status/stance, equipment and temporary buff/debuff modifiers in documented, deterministic order.
4. Apply difficulty and accessibility assistance (wider windows, latency calibration) with tested limits and consistent fairness.
5. Validate/clamp resulting early/late/perfect/good/partial thresholds and **snapshot the effective profile for each pending hit**, preventing reactive equipment changes from altering the rules after telegraph starts.

For multi-hit skills, each impact gets a stable unique hit ID, timestamp, timing profile, reaction outcome and exactly-once damage resolution. One successful parry does not automatically cover every hit unless a move explicitly grants multi-hit coverage. Browser time and simulation ticks must map through one adapter; no FPS-dependent reaction rules. Audio and animation cues should emphasize the actual contact marker.

**Exception policy:** Timing defaults may be overridden per attack move and per defense move without adding special cases to the main browser loop. Ordinary unblockable only restricts applicable parries; undodgeable only restricts dodges. Overrides still pass central legality, equipment capability and resource checks.

### B. Energy economy and multiple actions in a turn

**Recommendation: one primary combat resource, Energy** (possible lore label Prana), not simultaneous Mana + Energy + Stamina + AP pools. Action-cost/turn-continuation rules must be independent of Energy balance. A character with unused Energy may still have ended its turn; a free action must not grant infinite attacks.

**Provisional balance targets (implemented as opt-in domain defaults; not yet playable or playtested):**

| Parameter or move | Energy | Turn action rule |
| --- | ---: | --- |
| Maximum Energy | 8 | Tunable by actor/progression |
| Initial Energy | 4 | Prototype default |
| Start-of-own-turn recovery | +1 | Capped at maximum; once per own turn, not per attack |
| Basic recovery strike | 0 cost; restore up to 2 | Ends turn; once per turn |
| Free-aim arrow | 1 | May continue, up to action cap |
| Quick melee strike | 2 | May continue, up to action cap |
| Heavy attack/finisher | 4 | Ends turn unless the move explicitly overrides |
| Equipment switch | 2 | Continues at most once per turn, with a commitment/telegraph |
| Dodge | 1 | Consumes Energy during reaction |
| Parry/interception | Technique-authored cost | Successful perfect execution may refund Energy, explicitly capped |
| Normal offensive actions/turn | Maximum 3 | Separate from Energy; tunable by skills/encounters |

**Unified lifecycle:** choose legal move -> validate actor/target/equipment/energy/remaining actions -> commit cost exactly once -> approach/aim/telegraph -> defender reaction -> resolve each hit -> recover -> apply move turn policy -> continue decision or end turn. An attack no longer necessarily forces the next actor's turn at first impact.

Add an authoritative immutable ActionEconomy/TurnPolicy boundary: current Energy, maximum, regeneration, remaining action budget, actions used, per-move limits, current commitment, turn ownership, payment timing and refund/cancellation policy. Use explicit continuation modes (continues / ends / bonus action) rather than checking a handful of weapon IDs in UI code.

**Anti-exploit requirements:** max Energy, max actions, per-move limits, bounded perfect-parry refunds, exactly-once costs for multi-hit moves, no recovery-strike chain farming, no free equipment-swap spam, and clear behavior for interruption, missing, killing the target early or running out of Energy. These rules apply identically to player and NPC.

### C. Free aim, target regions, armor and weak points

**Recommendation:** anatomy/target regions, equipped armor coverage and critical/weak-point rules are distinct data systems. A headshot must not be a universal critical. A helmet can protect the head enough that an exposed limb or torso is strategically better. A beast may expose a horn, wing or glowing core instead of humanoid body regions.

- **Target regions:** authored stable IDs per species/actor (head, torso, left/right arm, legs, horn, tail, exposed_core, etc.), hit-volume mapping, visibility and region-specific susceptibility/stagger/weak-point properties.
- **Armor:** equipment slot/coverage by region, material/type, protection, penetration/resistance by attack damage type, optional durability and armor-break states. Natural armor uses the same protection model.
- **Aiming:** actor-targeted vs free-aim vs future area selection. User camera raycast with named collider/rig sockets supplies intended region; **the actual region hit at impact**, considering animation/projectile travel and defender movement, controls damage. A missed head should never become a guaranteed head critical.
- **Weak points and criticals:** damage/crit eligibility depends on actual impacted region, current exposure, armor, precision and move/actor traits. Start with deterministic, explainable modifiers; add seeded randomness only if balance demands it.
- **Mobile:** readable target region selection, modest aim assistance and adaptive aim controls, without invalidating armor/weak-point rules.
- **Both sides:** AI may aim at visible vulnerable regions using expected damage, hit probability and resources, without reading hidden armor/weak-point state it could not plausibly know.

**Single authoritative damage pipeline (implementation order to validate):**
1. Validate attacker, chosen move, attack cost, target actor and aim mode.
2. Authoritative spatial resolver determines real impact/hit and actual region (not merely intended aim).
3. Resolve dodge/parry/intercept and contact/miss.
4. Resolve regional armor coverage, shield/guard and damage-type penetration/resistance.
5. Resolve exposed weak point, critical eligibility, damage amplification, stagger/status/break in an explicitly documented arithmetic order.
6. Apply rounded/clamped final HP/status/armor change once and emit a structured HitOutcome trace.

HitOutcome must explain attacker, defender, intended/actual region IDs, reaction, base damage, damage type, armor mitigation, resistance, critical/weak-point effect, stagger and final damage. Keep renderer geometry and Three.js raycasts outside the pure combat domain; share stable region IDs/data. For a provisional numerical illustration, a base-20 headshot with 1.5x vulnerability and eligible 1.4x precision crit deals 42 unarmored; with critical suppressed and 45% effective damage surviving helmet mitigation it deals round(20 x 1.5 x .45) = 14. **These are examples for system tests, not shipped balancing.**

Do **not** implement full ballistic simulation, individual plate physics, wound modeling or complex procedural anatomy yet. Use authored hit volumes, simple coverage and deterministic rules first.

### D. Coupling risks and architecture safeguards

- Energy regeneration + multi-attack turns + free aim + weak-point criticals can create dominant infinite loops or one-turn kills. Test them as one system, not independently.
- Ranged parry/dodge defaults must be tuned for readable visual/audio telegraphs and mobile latency; narrow windows without readable attacks are unfair.
- Protected vs exposed regions require visible UI/impact feedback so players understand why their damage varies.
- Distinguish Energy from turn-action budget; do not turn every move into an implicit turn-ending special case.
- Content is data-authored: small validated move, timing, turn policy, target region, armor and outcome profiles. Avoid giant monolithic optional interfaces or hardcoded character IDs.
- One pure reaction timing resolver, one action budget/turn transition evaluator and one region-aware damage resolver should serve both sides. HFSM + utility AI must query these same systems instead of duplicating them.
- Automated tests must cover multiple hits/frame skips, boundary timing, resource exhaustion/refunds, repeated aimed attacks, actual vs intended region, armor/critical interactions and deterministic replay.


## AI architecture decision — HFSM + Utility scoring (GOAP deferred)

**Decision:** Implement a lightweight hierarchical finite state machine (HFSM) for tactical mode, action availability, interruptions, and recovery, plus a bounded utility scorer to rank actions legal under the shared combat domain. **Do not use GOAP in baseline v0.4-B.**

- The encounter state and reaction legality are authoritative. The HFSM provides *context* (observing, deciding, approaching, attacking, reacting, recovering, staggered, boss phase), never independent damage or eligibility rules.
- A tactical HFSM state filters candidate intents and provides interruption/commitment rules. A utility scorer evaluates only the currently legal intents (attack, guard/deflect, projectile intercept, dodge, reposition, switch weapon, wait).
- Utility factors should include expected **region-aware damage after armor**, actual aim visibility, hit/crit probability, target distance, survivability, Energy and remaining action budget, animation commitment, telegraph perception, effective timing uncertainty, cooldown, switch cost, recent action repetition and encounter personality. Score only legal moves under a bounded per-decision budget.
- Use explicit, data-authored score curves with sensible normalization, reproducible seeded noise/tie-breaking, hysteresis (to avoid oscillation), and per-actor decision frequency/budget; record selection traces for tuning.
- For reaction events, the AI chooses from `getLegalReactions()` and submits a plausible timestamp using the same **effective attack/defense timing profile** as the player. Difficulty modifies perception delay and execution variance, not illegal reaction access, hidden armor knowledge or infinite Energy.
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

### v0.4-A.1 — Timing profiles and multi-hit windows (domain implemented)
1. [x] Add delivery × defense-technique timing defaults and attack/defense/hit-level timing overrides; snapshot effective windows when each attack is queued.
2. [x] Model stable per-hit IDs and independently resolvable impact markers; resolve each hit once, charging the attack once, and advance the turn only after the final hit (or defeat).
3. [x] Add tests for asymmetric boundary conditions, modifier precedence, accessibility-scale inputs, stale hit IDs and long frame skips.
4. [ ] Migrate the **browser presentation** to generic encounter timelines; telegraph/commit/release/recovery markers remain owned by choreography until integration.
5. [ ] Validate timing accessibility and perceived reaction fairness through actual mobile playtesting.

### v0.4-A.2 — Energy and action economy (pure-domain implementation)
1. [x] Implement immutable Energy, own-turn regeneration and an independent configurable offensive action budget.
2. [x] Add multi-attack continuation, explicit end-turn, finishing moves, bounded recovery effects, existing defense costs, perfect-defense refunds capped across a turn, and once-per-turn equipment switching.
3. [x] Test Energy/action limits, multi-hit single charge, recovery, regen boundaries, resource/refund caps, move use counts and symmetric actor transitions.
4. [ ] Integrate the new state and Energy HUD into the playable browser encounter with a compatible presentation controller. Legacy encounter creation defaults to one action/no regen until migrated.
5. [ ] Balance actual Energy/turn profiles with AI difficulty and mobile encounter tests.

### v0.4-A.3 — Precision regions, armor and damage (pure domain implemented)
1. [x] Author validated anatomy/target-region IDs, regional armor coverage, damage types, exposure states and deterministic precision-critical eligibility.
2. [x] Distinguish intended free aim from actual spatial impact and use one explainable pure damage pipeline; `HitOutcome.breakdown` provides damage, armor mitigation, critical/stagger information and reason codes.
3. [x] Cover helmet vs exposed head, humanoid and nonhumanoid weak points, regional armor, misses, deflected hits, validation and independent multi-hit damage in headless tests.
4. [ ] Implement rig-attached hit volumes, raycast aiming/impact tracking and target-region feedback in the browser adapter (v0.4-C).
5. [ ] Tune damage types, armor/vulnerability coefficients and weak-point balance with real encounters (v0.4-D).

### v0.4-B — Enemy decisions and counterplay
1. [x] v0.4-B0: migrate browser HP, Energy, attack legality, turns and reaction timing. [x] v0.4-B1: add pure seeded HFSM + Utility enemy decisions, legal equipment switching, attack chaining and scheduled reaction attempts. [ ] Remove obsolete v0.3.x domain exports after consumer audit.
2. [x] Enemy can switch between a visible greatsword and warbow during its decision turn, paying the same Energy and once-per-turn cost as a player; switching is visibly announced.
3. [x] Enemy can choose legal dodge, weapon deflection or projectile interception with deterministic seeded timing error and actual reaction costs; defaults can fail naturally.
4. [x] Add novice, capable and elite profiles with configurable awareness, reaction variation, aggression, Energy management and switching preference. [ ] Balance all profiles by browser/mobile playtests, add actual aim-raycast visibility inputs and more nuanced weakness awareness.

### v0.4-C — Choreography and presentation (prototype implementation)
1. [x] Reuse player and enemy animation driver and visible weapon rigs; keep authored GLB animation polish as follow-up.
2. [x] Add rig-linked coarse hit-volume proxies, pointer/menu region selection, snapshotted shot trajectories, impact spatial checks, armor/critical/weak-point feedback and shared defensive results.
3. [x] Add aim, enemy attack and counter camera shots, region marker, Energy/action hints and defense-cost display.
4. [x] Keep mobile/touch selection and existing quality presets; [ ] manually playtest mobile ergonomics, collision precision, animation and difficulty tuning.
5. [x] Implement first free shared defense reaction, charging subsequent dodge/parry/intercept uses through the same authoritative domain resolver.

### v0.4-D — Reliability / balance
1. Test both-direction attack resolution, equip/swap legality, range, costs, cooldowns, status constraints and move overrides.
2. Test all four default matrix rows, allowed/forbidden override combinations, no invalid parry with bow versus sword, and special interception exceptions.
3. Test deterministic AI with fixed seed, bounded AI response and frame-skip/restart/interrupt behavior, including per-move timing, Energy chains and regional targeting.
4. Check a player can reliably land attacks (AI is not always invulnerable), that skilled defense remains rewarding, and that Energy loops or repeated weak-point crits do not trivialize encounters.
5. Run typecheck, unit tests, build, and manual mobile browser profiling before marking complete.

## Acceptance criteria

- [ ] Either side can switch weapons using the same legal equipment transition.
- [ ] Either side can respond to an attack with the same legal reaction resolution; AI uses it, too.
- [ ] Ranged projectile can be parried by a capable ranged countershot **or** melee deflection, and can be dodged.
- [ ] Melee contact attack can be parried by capable melee equipment or dodged; ranged-only equipment cannot ordinarily parry it.
- [ ] Per-move overrides can deny or explicitly grant specific counter techniques without branching on attacker identity.
- [ ] Resources, cooldowns, timing, reach and choreography are validated centrally.
- [ ] Parry/dodge use different delivery defaults and distinct per-move effective timing profiles, with accessibility and multi-hit behavior verified by tests.
- [ ] Energy balance and action budget independently govern multi-attack turns, recovery, swaps and reactions; no infinite-resource or infinite-turn sequences.
- [ ] The same hero/NPC action lifecycle can continue after a valid affordable quick/free-aim attack, or end predictably after a finisher.
- [ ] Free aim selects named target regions and the actual impacted region, not merely the intended aim, determines damage.
- [ ] Armor coverage, damage types, regional weaknesses, crit eligibility and deterministic rounding explain helmet-protected vs exposed critical hits.
- [ ] Structured HitOutcome events explain damage breakdowns and make future HUD/AI integration testable.
- [ ] AI sometimes dodges, parries, switches weapons and sometimes fails, with clearly readable feedback.
- [ ] Existing v0.3.x duel mechanics, camera and mobile controls regressions are covered by tests.
- [ ] Core logic remains deterministic, pure and renderer-independent; UI, effects, camera and AI all consume the same domain decisions.

## SOLID / DRY guardrails

- **SRP:** attack legality, damage, AI decisions, equipment, movement, animation and feedback have distinct responsibilities.
- **OCP:** register new weapon/move/counter data without editing giant per-weapon condition chains.
- **LSP/ISP:** interfaces expose actor capabilities and narrowly typed actions; don't require every actor to implement every defense.
- **DIP:** AI and presentation depend on shared combat contracts/events, not on each other or on concrete browser objects.
- **DRY:** shared legality/reaction, effective-timing, Energy/turn-policy and region-aware damage resolvers for player/NPC; one attack lifecycle, validated move-level overrides and one timing source. Avoid premature abstractions, subclass trees or duplicated browser-side rules.

**Implementation status (v0.4.0-preview.3):** v0.4-A core, v0.4-B0 browser migration, v0.4-B1 enemy HFSM+Utility and v0.4-C prototype region aiming/impact detection, armor/critical HUD and camera variants are implemented. Manual browser/mobile QA, authored GLB animation, detailed environment occlusion and balance remain outstanding. Defensive economy updated: first reaction free, later reactions cost Energy; no free perfect-parry Energy farming.
