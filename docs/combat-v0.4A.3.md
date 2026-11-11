# Trilok v0.4-A.3 — Regional targeting, armor and explainable damage

## Status
Implemented in the renderer-independent `@trilok/combat` domain. **Not yet playable in the deployed v0.3.x Three.js duel.**

## What shipped
- Data-authored, validated anatomies with stable region IDs and a default actor-target region; humanoid and horned-creature examples are supplied.
- Separate armor definitions with per-region coverage and damage-type-specific mitigation. Equipped armor is validated against each actor's anatomy.
- Free-aim attacks optionally capture an intended region at queue time. The authoritative impact adapter must later supply an actual struck region (or explicit spatial miss). Intended head targeting never guarantees a head impact.
- Exposure states (`exposed`, `protected`, `hidden`). Hidden regions cannot be selected; protected weak points suppress vulnerability and precision critical effects.
- Precision criticals require an explicitly free-aim-enabled move, matched intended/actual region, exposed eligible anatomy, a critical multiplier, actual contact and armor that does not suppress criticals.
- One pure `resolveRegionDamage` path computes reaction mitigation, region vulnerability, armor attenuation, eligible critical amplification, deterministic rounding, HP cap and stagger signal; the same resolver handles NPCs and players.
- Immutable `ReactionResolution.outcome.breakdown` includes intended/actual region, damage type, reaction multiplier, vulnerability, armor absorbed, critical status, final damage, stagger and reason codes.
- Existing encounters without anatomy remain compatible with the v0.4-A.2 unregional damage rules. Existing combat cost, multi-hit and timing resolution paths are retained.

## Calculation order
1. Validate selected move and target region, commit Energy once, store intended aim.
2. At authored impact, accept a spatially resolved contact region or explicit miss; validate ID and visibility.
3. Apply dodge/parry/interception multiplier first; if avoided, no damage.
4. Apply authored actual-region vulnerability and regional armor (damage-type protection), suppress critical when coverage specifies.
5. Apply a deterministic precision critical only if eligible, calculate final rounded damage and stagger signal, clamp to remaining HP.
6. Return structured reason codes for future HUD and AI, with no direct renderer dependency.

## Tests
`tests/encounter-damage.test.ts` exercises uncovered and helmet-protected head hits, chestplate coverage, mis-aimed arrows and explicit misses, nonhumanoid horn weak points, protected/hidden regions, damage-type differences, countered attacks, invalid armor/anatomy authoring and independent multi-hit contact regions.

## Known limits
- No raycast adapter/aiming UI yet: a future camera and rig-hit-volume adapter must supply region IDs from real aim and projectile/weapon contact.
- Stagger is an output signal, not a persistent enemy status or limb injury system.
- Protection and critical coefficients are initial game-design samples, not physical armor simulation; full material penetration/armor durability/area hit regions remain future work.
- v0.4-B/C must migrate the web controller and bind the shared combat domain to camera, animations, target-region HUD and AI.

## Next
v0.4-B — browser encounter migration, symmetric HFSM + Utility enemy behavior and reaction execution, followed by v0.4-C visual free-aim targeting and armor impact feedback.
