# D12 — Rhythmic Offensive Combat
## Design
A timing input is an optional skill-expression layer for the attack already purchased with Energy/actions. Its authored tick sits before the first impact (bow release or sword swing). This is not a second attack. Missing or skipping the beat retains base damage; good and perfect execution add modest deterministic multipliers, and connected timed actions chain up to the move's cap.

## Domain authority
- `OffensiveTimingSpec` belongs to the combat catalog. Validator enforces single target, bounded grading windows, max bonuses and capped chain.
- `captureOffensiveTiming` is the only mutation path. It rejects wrong actor, early and stale ticks, duplicates and missing attacks. The snapshot tracks the one committed input.
- `resolveReaction` computes the bonus before region, armor and crit calculations; it still honors contact, reach and defensive reaction multipliers. Parried hits do zero damage regardless of timing input.
- Chain belongs to `TurnBudget`, advances only on a connected action with a successful graded input, and resets for misses, ungraded attacks or real actor-turn transitions. Multi-hit actions count once, even if multiple hits connect.
- No extra Energy or action is awarded. All existing first-action opener, weapon-switch, AI and projectile rules remain authoritative.

## Presentation
The attack-only timing bar shows good and perfect windows, current progress, explicit F/tap prompt and grade feedback. The UI uses the pending action's snapshotted target; it never computes damage. Desktop and touchscreen share the same domain capture method.

## Test and quality gate
Unit tests cover exact boundary ticks, grades, invalid policies, duplicate/cross-actor inputs, baseline/damage modifiers and combo reset. Existing 1,000 seeded encounter tests and Chromium desktop/touch checks are preserved. Manual rhythm feel on physical hardware remains a future calibration item.
