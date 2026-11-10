# Trilok v0.3 — Choreography and Animation

## Delivery
- The pure TypeScript choreography package fires timestamped cues exactly once after frame skips and cancels safely on restart.
- A reaction buffer captures the first valid timestamped parry.
- Existing articulated stand-ins animate through Three.js AnimationMixer clips (not finished rigged assets).
- A reusable arrow, trail and hit ring are synchronized to authored release/hit markers.
- Enemy overhead swing uses a marked impact and late-response grace window.
- Camera transitions and audio cues follow the authored timeline.

## Sequence alignment
| Sequence | Duration | Markers |
|---|---:|---|
| Archer | 1500 ms | Release 715, hit 1150 |
| Enemy overhead | 2180 ms | Swing 1210, impact 1850, close 2130 |
| Reaction | 730 ms | Camera recovery 250 |

## Scope constraints
These motions are hand-authored code clips applied to procedural stand-ins. They are not professional motion-captured or skeletal GLB character animations. Visual quality requires licensed or original assets and subsequent art passes.

## Validation
- Type checking, deterministic choreography tests and production build in CI.
- Manual mobile and desktop visual profiling still required; CI cannot verify actual GPU frame rates.

## Next
- GLB rigged asset import with animation retargeting and weapon sockets.
- Improved combat impact, timed offensive actions, dodge and controller input.
