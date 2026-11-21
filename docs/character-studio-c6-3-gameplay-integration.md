# C6.3 Gameplay authoritative presentation integration

**Status (2026-11-21): in progress.** This document records a focused
implementation change in C6.3, not a separate subphase or phase acceptance.

**Gameplay locomotion bridge (2026-11-21, engineering PR):** A pure `LocomotionMovementSnapshot` converts observed world displacement and actor facing to canonical local `LocomotionIntent`. `CombatMovementController.locomotionIntent` exposes this after presentation movement, and `AnimatedWarrior` consumes it without altering root movement, reach, damage or defense timelines. The game now lazily instantiates the **existing CanonicalLocomotionMixer** with the 27 approved Kevin clips and projects the authored bilateral hip rotations onto the legacy combat proxy through `LegacyCanonicalLegProjection`; there is no alternate pose mixer and no source root displacement. The explicit backward sprint cap is retained. If that lazy source bundle cannot load, the original procedural proxy gait remains as a documented visual fallback. The opt-in `?c63-gameplay-metrics` probe distinguishes source and fallback. This is an **incremental canonical-animation integration**, **NOT full canonical skinned Gameplay Lab integration**: the combat proxy is not the C5 MakeHuman skinned rig, has no ankles/toes or deformable sole, and cannot claim grounded skinned feet or pelvis support. The gameplay renderer still needs the shared canonical skeleton, FK/skin and grounding correction for complete C6.3 parity. No production deployment, merge or phase acceptance is asserted by this note.



## Runtime ownership contract

The gameplay simulation retains authority over legal positions, facing,
collision, movement, action timing, damage and defense windows. The
`LocomotionMovementSnapshot` adapter consumes already committed translation
and creates canonical 2D intents. The source-backed
`CanonicalLocomotionMixer` evaluates the approved Kevin library entirely as a
render-only sampler. The temporary `LegacyCanonicalLegProjection` passes
authored bilateral leg swing to the *existing* legacy combat renderer while
preserving weapon sockets, hit geometry and combat timelines.

## Unresolved C6.3 work

Gameplay Lab still renders a historical non-skinned proxy. Full common
C5 MakeHuman rig, skinned sole contacts, pelvis correction and consistent
weapon sockets in the gameplay character are not yet verified. Browser checks
must demonstrate source-backed playback without regression, and C6.3 cannot
be declared complete until its final criteria are satisfied.
