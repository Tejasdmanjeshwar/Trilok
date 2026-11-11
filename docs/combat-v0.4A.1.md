# Trilok v0.4-A.1 — Per-move reaction timing and multi-hit attacks

## Scope

Implemented **inside pure TypeScript @trilok/combat**, not yet wired to the v0.3.2 browser demonstration.

- `encounter-timing.ts` owns bounded, integer-tick timing modifiers and delivery/move/defense/hit-specific timing resolution.
- Default melee contact windows: parry 130 ms early / 70 ms late; dodge 280 ms early / 120 ms late.
- Default ranged windows: parry/intercept 90 ms early / 50 ms late; dodge 170 ms early / 90 ms late.
- Reaction grades (`perfect`, `good`, `partial`, `miss`) have independent thresholds.
- A move can replace a technique's default profile; an individual hit can override again; a defense move can override its own timing. Final profile selection is deterministic.
- Accessibility/difficulty can scale valid input windows and apply bounded signed early/late bonuses. The effective profile is snapshotted into each pending hit at attack start; later data edits don't affect an already queued reaction.
- Attacks optionally author an ordered list of unique hit IDs and offsets; legacy single-hit attacks remain accepted without a `hits` array.
- Damage and reaction costs are applied once per hit, while the attack cost is charged once per move. Turns advance after the final hit, not on the first.
- A stale `hitId` is rejected; frame skips can be processed in authored hit order.

## Contracts

- `packages/combat/src/encounter-types.ts`: authored hit specs, snapshots and reaction options.
- `packages/combat/src/encounter-catalog.ts`: validation, delivery defaults and move overrides.
- `packages/combat/src/encounter-timing.ts`: pure timing resolver, grading and validation.
- `packages/combat/src/encounter.ts`: pending hit cursor, authoritative per-hit damage.
- `tests/encounter-timing.test.ts`: timing boundaries, precedence, modifier scale, stale hits and frame skips.

## Limitations

- The domain still has one action per turn; Energy/multiple sequential attacks follow in v0.4-A.2.
- Contact range is supplied to the domain; live projectile/target raycast, body armor and weak point resolution are later phases.
- Browser presentation is still on the v0.3.2 adapter and cannot yet display the new multi-hit/timing system.
- Timing values are provisional and have not been evaluated on real mobile devices.

## Next

v0.4-A.2: one Energy economy, bounded action count and explicit turn continuation.
