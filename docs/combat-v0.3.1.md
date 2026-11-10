# Trilok v0.3.1 — Combat reach, approach, weapon-aware defense

## Combat rules
- Equipped weapons are data-driven (weapon class, effective reach, damage, and parry capability).
- Initial hero weapon is a longbow; a melee sword can be selected during the player's decision phase only.
- Longbow: ranged attack and dodge response. Sword: short-range attack, dodge and parry responses.
- Dodge and parry share a timestamped reaction buffer but produce different damage outcomes.
- The gameplay domain rejects a melee attack unless it is at or inside weapon reach, even if visuals misbehave.
- The enemy has a melee sword and physically approaches the hero before its impact marker.

## Presentation
- CombatMovementController owns reversible movement tracks and initial positions; movement is independent of render frame count.
- Melee attacks: approach, swing, contact, retreat.
- Enemy attack: approach, overhead swing, defend (dodge or parry), retreat.
- Camera director tracks actor roots dynamically.
- Reset returns actors home and cancels pending movement and choreography.
- Animations and props remain stand-in geometry; the architecture can later accept GLB actors with separate weapon/equipment slots.

## Limits and next steps
- This is a single-target authored duel. Collision avoidance, full navigation, multi-character positioning, attack interruption and combos will be needed for multi-actor encounters.
- Mobile control layout has been extended for equipment selection and defensive input.
- Automated tests cover equipment, melee range and deterministically sampled movement. A passed build does not constitute an automated browser visual test.
