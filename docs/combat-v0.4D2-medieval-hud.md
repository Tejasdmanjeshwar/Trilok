# Trilok v0.4-D2 — Original cinematic medieval combat HUD

## Intent
Inspired by the readable **combat information hierarchy** of premium cinematic turn-based RPGs such as Clair Obscur: Expedition 33, not by copying their assets, exact layout, game terminology or artwork. Trilok adopts an original dark wrought-iron, carved-stone, aged-brass and parchment visual language.

## Implemented UX
- Remove browser dropdowns for attack selection and weapons; replace with a two-column action-card deck and equipment tiles. Replace HIGH/MOBILE select with a settings toggle.
- Each action includes an emblem, authored title, brief role text, Energy cost and selection state. Illegal/unaffordable moves are visually disabled, with native semantic button states and focus outlines.
- Keep player vitals and equipment lower-left, actionable move cards lower-right, enemy vitals upper-right, and the 3D scene unobstructed in the center.
- Move selection remains touch, keyboard and mouse accessible; Q cycles authored legal attacks; 1/2 changes equipment. Existing cross-platform free aim remains operational.
- Aim mode changes the attack caption to FIRE; otherwise STRIKE. Aimed projectile hit results still go through the pure combat engine.
- Decision-phase camera pans *subtly* (±0.19m horizontal and ±0.055m vertical). No orbit across the player–enemy axis. Aiming and reaction views stay stable; reduced-motion preference disables the movement.
- Responsive mobile and low-height landscape layouts, button focus and disabled states.

## SOLID / DRY boundary
- `@trilok/combat` owns legal moves, costs, timing, counters, Energy, damage and turn flow.
- `CombatCommandDeck` is a standalone view component. It accepts a typed snapshot of domain-authorized move and equipment IDs and sends user intent callbacks to the encounter adapter.
- Presentation metadata (move titles, symbols, role) is separate from the authoritative move catalog and has a fallback for newly authored moves.
- Browser entrypoint wires inputs and camera; future radial UI / console-native UI can consume the same encounter legality and intents.
- No new UI framework, runtime asset downloads or gameplay logic in CSS.

## QA and remaining gaps
Automated checks cover the UI metadata contract, decision pan bounds and camera viewpoint; GitHub CI validates all combat packages. Browser/mobile visual QA is still necessary for small-screen ergonomics, touch focus, text wrapping and scene visibility. The current Three.js actors and shaders remain procedural stand-ins; future 3D assets and cinematic polish are separate.

The two changes are intentionally in independent slices:
- **v0.4-D1:** move-authored perfect intercept / automatic counters and animations, pure domain + browser choreography.
- **v0.4-D2:** modern cinematic medieval HUD, responsive command deck and subtle decision camera pan.
