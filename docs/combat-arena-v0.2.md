# Trilok v0.2: Cinematic Combat Arena

## Scope

Build a visually cohesive, mobile-aware combat presentation with a full-screen arena, procedural forest shrine, dynamic shot director and a responsive overlay HUD. This milestone is **not** the final art, navigation world, boss AI or production-ready animation pipeline.

## Systems

- **Terrain**: Pure, deterministic seed/noise/height functions. A flat central engagement area is surrounded by smoothed procedural relief.
- **Arena**: Real 3D ground, concentric stone rings, handcrafted-style modular columns, instanced trees, boulders and shrubs, distant mountains. Expensive erosion/world streaming are deferred.
- **Camera**: Presentation-only state-based camera with intro, decision, attack, windup, defense, reaction and victory shots. State transitions use damped interpolation, independent of turn resolution.
- **Lighting**: Warm key light, fill, shadows on high quality profile, filmic tone mapping, scene fog. Mobile reduces geometry, shadows and resolution.
- **Characters**: Procedural stand-ins with articulated arms, silhouettes and weapons. Replace with rigged GLB characters and authored clips in v0.3.
- **Combat**: Existing pure TypeScript deterministic domain remains authoritative.

## Acceptance tests

1. Full-screen 3D loads without external art assets.
2. Attack starts a visual windup before changing enemy HP.
3. Defense camera provides readable enemy telegraph and timing meter.
4. Parry near impact resolves at the attack's gameplay marker.
5. Same seed yields repeatable terrain and deterministic prop placement.
6. Keyboard and touch are supported; reduced-motion preference is respected.
7. Static compilation, domain tests and production build pass CI.
8. PC/mobile quality profiles use different render/geometry budgets.

## Next milestone (v0.3)

Authorable combat sequence timelines, asynchronous asset loading, animation-driven hit events, multi-attack reaction windows, gamepad input, and stronger automated presentation tests. Final models, authored animations, sound and effects are substantial art-pipeline dependencies.
