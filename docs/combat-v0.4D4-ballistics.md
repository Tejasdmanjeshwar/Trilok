# Trilok v0.4-D4 — Shared deterministic projectile motion and interception planning

Status: **playable prototype**. Source integration and deterministic tests do not substitute for real mobile/desktop visual QA.

## Explicit gameplay guarantees
- A *perfect* interception input means the core has solved a physically feasible collision of the **two launched projectiles**. It does **not** promise that the defensive projectile wins the strength comparison.
- The core computes and caches a feasible timing window from projectile speed, gravity, arrow origin, launch delay, initial attack trajectory, and distance. Before accepting a real player/AI input, it solves again at the actual integer input tick. An impossible shot is not silently snapped to the incoming arrow.
- If the interception wins and survives, the **same arrow identity, velocity, gravity, and trajectory continue unchanged** through the collision. The planner prefers a path that also passes through the opponent's *predicted* position; if no dual-target path exists it falls back to interception only.
- A counter projectile hitting its opponent remains contingent on actual collider contact. A target that moves away can be missed. Never apply counter damage at the midair clash.
- The attacker's arrow also continues unchanged if it survives. No redirected second attack or additional bow-release animation.
- Melee deflection/riposte is a separate action and is unaffected. First defensive reaction free; successive defensive uses cost Energy.

## Extensible trajectory family, no premature homing implementation
`packages/combat/src/projectile-motion.ts` owns a renderer-agnostic `ProjectileTrajectory`:
- `ballistic`: gravity and launch velocity; setting acceleration to zero creates a straight projectile.
- `piecewise`: ordered deterministic analytic segments with continuity at each guidance change. This is a future **homing/steering extension point**: a move-specific controller can emit a new velocity and acceleration segment at a fixed simulation tick. No homing controller or target-lock exploit is implemented in this slice.
- `sampleTrajectory` is the only source of position and velocity. The browser projectile renderer and combat collision query both sample this exact contract. No duplicated sine/easing/lerp arcs for authoritative projectiles.
- `aimBallisticAt` computes a launch trajectory to a point at a specified tick.
- `planInterception` solves bounded candidate collision times and release velocities, scoring future target proximity and prioritizing dual-target paths within limits.
- `findInterceptionWindow` caches feasible input intervals and verifies **every integer tick in the perfect interval** with the exact solver. Input capture still checks exact feasibility to reject invalid times.
- For now launch speed is authored as a permissible range. A move with a strict launch speed may reduce feasible windows or eliminate dual-target solutions. A later guidance controller can use the same validated path interface.

## Ownership boundaries
- Pure domain: projectile flight plans, feasible windows, exact reaction grading, collision strength, continuing trajectory identity, damage policy.
- Browser adapter: snapshots the world positions (projectile launch origin, attacker's body proxy and intended landing point) when an attack is committed; it translates Three.js vectors into serializable plain vectors.
- Visual effects: pooled meshes sample `sampleTrajectory` on each render frame; surviving meshes are **not** relaunched or redirected at clash.
- Hit volume adapter: raycasts fixed 12ms substeps along the unchanged trajectory for physical region contact.
- HUD: feasible green band and narrow gold perfect band share the same attack-local timestamp range as the solver. Text explains that the perfect interval guarantees collision, not dominance or counter hit.

## Performance / remaining validation
- Planning runs when an attack is queued and at defense input, not on every rendered frame. Finite search steps and bounded horizon prevent an unbounded optimization loop. Runtime renderer only evaluates analytic trajectories and short trails.
- The current game-authoritative inputs are **snapshot world positions**. Moving/animated target trajectories, obstacles, swept small-radius projectile collisions and collision with terrain/armor meshes are not yet fully modeled.
- Actual collision with another arrow uses the planned common intersection time, not a GPU physics solver. That preserves reproducibility but requires future spatial validation for moving targets that perturb the incoming trajectory.
- A feasible scan uses coarse samples for outer windows; the **gold perfect range is individually checked at integer ticks**. The actual reaction is always solved again before success.
- Production homing will need a deterministic, fixed-tick turn-rate/acceleration controller and separate guided-trajectory tests, not changes to the collision renderer.

## Acceptance
1. Observe curved bow and interception arrow flights; the trajectories match their authored gravity.
2. Enemy ranged attack shows a green feasible segment and a narrower gold recommended segment BEFORE impact.
3. Every input inside the gold interval produces two arrows meeting midair. Result varies with move strengths and timing grade.
4. Outside feasible input times the system rejects or fails the intercept; no snap or teleport to a fake meeting point.
5. Surviving defensive arrow continues the same ballistic path toward A; it may hit or miss A depending on that path.
6. Verify good/partial clash outcomes, arrow identities, first free reaction, melee riposte and restart.
7. Check FPS and input handling on mobile portrait/landscape and desktop; confirm BUILD version.
