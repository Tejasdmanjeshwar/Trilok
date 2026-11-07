# Architecture decisions (v0.1)

## Goals

- PC-first browser prototype with mobile-compatible controls and scalable rendering.
- One renderer-agnostic RPG simulation supporting multiple authored campaigns.
- Stable deterministic tests for combat, quests, and progression.
- Procedural terrain generation must be seeded, cacheable, and authored-mask aware.

## Boundaries

**Simulation** lives in pure TypeScript packages and accepts values, not scene objects. **Presentation** owns Three.js objects, animation, UI, audio and the browser clock. **Campaign content** will provide data validated by shared schemas. **World tools** will precompute erosion, hydrology and compressed terrain assets; streaming loads them at runtime.

## Engineering conventions

- Favor composition and narrow interfaces over deep inheritance.
- Validate all loaded content; avoid hardcoding a campaign in generic engine code.
- Keep performance budgets per platform, profile GPU/CPU time and memory on real devices.
- Use versioned save formats and explicit migrations once persistence is introduced.
- Treat headless combat tests as required acceptance criteria for combat changes.
- Add abstractions as interfaces stabilize; avoid speculative framework complexity.

## Important constraints

WebGL2 is the initial stable rendering baseline. WebGPU can be evaluated when feature support and fallbacks are profiled. Console platforms need a dedicated technical feasibility study and port, not a packaging switch.

## v0.1 prototype limitations

The current playable scene uses placeholder shapes, a one-on-one battle and simplistic real-time input windows. It does not include party management, combat animation synchronization, accessible reaction modes, terrain, vegetation, save state, narrative content or a complete input abstraction.
