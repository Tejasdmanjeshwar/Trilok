# Trilok

A reusable, TypeScript-based adventure RPG framework. **Ramayana** is the first planned campaign; shared gameplay will later power **Mahabharata**.

**Status:** Initial combat laboratory. This repository does not yet contain production terrain, authored campaign content or console builds.

## Getting started (phone or desktop)

1. Open this repository in GitHub Codespaces (Code → Codespaces → Create codespace).
2. Run `corepack enable` and `pnpm install` in the Codespaces terminal.
3. Run `pnpm dev` and open the forwarded Vite port (5173).
4. Press **Attack** or Space to start an enemy windup. Press **Parry** or P near the impact for a reaction. Press **Restart** or R to reset.

Run `pnpm typecheck`, `pnpm test`, and `pnpm build` before submitting a pull request.

## Architecture

- `packages/combat`: pure TypeScript turn rules, reaction grading and resolution; no dependency on Three.js or DOM.
- `packages/core`: common interfaces and contracts.
- `apps/web`: Three.js rendering, browser UI, controls and presentation adapter.
- `docs`: architectural direction and development milestones.

Strict TypeScript is enabled. The core has no global mutable state and combat updates return a new state. CI validates types, tests and builds.

## Next milestones

1. Replace placeholder characters with animation-driven combat actors and event-driven presentation.
2. Add input buffering, accessibility options, telemetry and multi-character encounter models.
3. Build a standalone authored-mask + erosion terrain baker, then stream compressed tiles with LOD.
4. Prototype a Ramayana story region with scalable vegetation and rivers.

Future console releases will need a separate porting strategy: Three.js web builds are not direct console exports.

## How to verify the live build

Every Vite build exposes a unique **BUILD <commit> · <UTC time>** badge below the Trilok title. Tap it to see the full Git SHA, build timestamp, playable version and combat engine version, or copy the report. The same data is published at `/build-info.json`.

The **playable version** remains at v0.3.2 until the new combat system is actually connected to the browser. The **combat engine version** is v0.4-A.3. Both are managed in `apps/web/build-version.json`; the build ID is automatic and changes on each deployment.

See [Build verification](docs/build-verification.md) for deployment checks and mobile smoke tests.
