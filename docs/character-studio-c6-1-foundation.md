# C6.1 — Canonical animation contracts and reference motion

**Status:** C6.1 merged in [PR #106](https://github.com/Tejasdmanjeshwar/Trilok/pull/106), post-merge Verify [#44303429762](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44303429762) passed on `aaab465120f214337ba69db438925faf9f7bce67`. This does not imply full C6 phase acceptance or full animation playback UI.

## Source-truth audit (main `ee289934e7ad70e771665566f42d6b9f0adc720e`)

- `StudioHumanModel` owns the existing anatomical `AnatomicalHuman` with one `SkinningSpike` and a `SemanticCharacter`. `StudioPosePreview` drives the same C1 semantic joint IDs with calibrated `AnatomicalFK`, corrective morphology targets, source-skin two-hand IK, sword/shield and bow solves. Calibration of the imported MakeHuman CC0 geometry is in `OfficialHumanRig` and `AnatomicalTemplate`.
- `SkinningSpike` creates the exact semantic C1 joint graph and bones. Forearm and shoulder **skin-only** helpers are not new semantic joints and must remain separately owned by skinning. `AnatomicalPoseMatrix` resolves semantic roles into FK degrees of freedom; finger and contact constraints cannot be replaced by naïve animation tracks.
- `AnimatedWarrior` and `warrior.ts` still use simple group bones named `LeftArm`, `RightArm`, `Torso`, etc. Its `THREE.AnimationMixer` and `QuaternionKeyframeTrack` store fixed Euler-derived angles against those groups. `LegacyWarriorAdapter` maps several distinct anatomical roles onto the *same* approximate group. This is NOT an anatomical bind-pose-compatible retarget and must not become another rig.
- `packages/choreography` is elapsed-ms presentation sequencing with explicit cue ordering. Damage, defense legality, hit regions, AI, arrow origin and projectile timing remain separate authoritative combat decisions. C5 currently owns grip, arm reach, source contact, clearance and equipment orientation.
- Normal Studio pose evaluation resets and reapplies FK and correctives; applying a base animation concurrently would have conflicting owners. The C6.1 reference adapter is deliberately **opt-in and mutually exclusive** with FK/C5 Studio preview until C6.2 designs a staged blending and correction pipeline.

## Architecture introduced

The only canonical skeleton is `AnatomicalGraphV1` from `@trilok/character-core`. `canonicalSkeleton()` is a descriptor of that graph, not another rig. `canonicalRigIdentity()` incorporates ordered semantic joints, hierarchy, roles, nominal rest/bind transforms and socket frames, plus topology and coordinate identifiers. Its FNV-1a-64 ID is a **non-cryptographic compatibility fingerprint**, not a provenance or asset-integrity checksum.

`AnimationClipV1` specifies schema version, exact bind identity, license/creator/revision/origin/SHA-256 provenance fields, duration, local rest-relative tracks, root-motion policy, future layer/mask intent, retarget prerequisites and presentation-only equipment contact annotations. Validator rejects topology/rest mismatches, unknown joints or sockets, illegal translation, malformed quaternions, discontinuous signs, invalid or duplicate times/tracks and over-budget inputs. Each track requires keys at 0 and duration; samples clamp outside the clip interval.

`createAnimationSampler()` is pure deterministic TypeScript: quaternion shortest-arc spherical interpolation, translation linear interpolation, explicit timestamp input and bounded binary key lookup. It does not modify gameplay. `serializeAnimationClip()` / `parseAnimationClip()` provide a plain JSON round trip (development clip data, **not** C9 character persistence). A future migration must explicitly version this schema; unrecognized versions are rejected.

`createReferenceBreathingClip()` generates a small internal self-contained anatomical chest motion against the C1 graph with known provenance and no imported motion assets. `CanonicalAnimationPose` optionally samples and writes the *existing* `SemanticCharacter` joint objects using captured rest-local transforms and provides idempotent reset/disposal; it creates no additional skeleton, skinned mesh, renderer or `THREE.AnimationMixer`. Reference rotations return to rest and do not alter C5 grip rules; no production Studio playback UI is claimed.

**Retargeting scope:** Only an *identity-rest* validated binding is implemented. Mapping between different bind poses, body proportions or extensions requires calibrated correction in C6.2+. Explicitly reject incompatible rigs instead of pretending they can be retargeted correctly.

## Tool feasibility and licenses

The actual agent container was checked with `command -v`: Node.js v22 and TypeScript compiler are installed; `blender`, `pnpm` executable and `three` local module were **not** found. Container GitHub network DNS did not resolve, so repository operations used the connected GitHub app. This container is **not** necessarily the GitHub Actions runner. No Blender render/FBX/glTF import/bake is claimed or required by normal Verify for C6.1.

| Approach | Headless/automation | Ownership/compatibility | Current decision |
| --- | --- | --- | --- |
| Blender scripting (offline) | Python CLI and headless baking are available where Blender is installed; requires version and exported-rig calibration | Blender executable is GPL; independently generated works are not automatically GPL, but third-party rig/mocap assets need their own permissions; exporter versions and SHA-256 must be pinned | Allowed, **not installed in this agent environment**. Evaluate in dedicated CI/build-time job later |
| Three.js/TypeScript generator (offline or browser) | Pure versioned TS and Three-compatible runtime; no new download | Matches C1 coordinates, existing semantic IDs and proprietary reference data; lightweight and testable | **Chosen for C6.1 reference** |
| glTF / retargeting tools | External exporters can be automated; glTF standard supports skeletal animation | Requires axis, bind inverse, naming, clip coordinate, licensing and rights validation; different proportions need corrections | Deferred to C6.2 ingest; no unverified package added |
| Mocap packs and plugins | Variable support | Separate commercial distribution, attribution and source provenance constraints; no blanket rights assumed | Not ingested |

No external art, code or third-party dependencies were added. `THIRD_PARTY_NOTICES.md` remains unchanged, intentionally.

## Verification and rollout criteria

- `tests/character-animation-c6-1.test.ts`: exact C1 graph/socket mapping, deterministic timestamps, quaternion normalization/continuity, schema rejection, round trip, identity mismatch, actual C2 skinned semantic rig and reset/disposal, legal visual-only root translation.
- Run `pnpm typecheck`, `pnpm test`, `pnpm build`, build identity check and relevant focused browser suites in CI; record actual results on the PR. This container lacked local `pnpm` and `three`; do not claim local passes.
- Baseline costs/memory must be **measured** before requiring performance thresholds. Current reference sampler retains only per-clip joint/track indices and each adapter retains one rest transform per animated joint; it releases references on dispose. Sampling allocates result arrays; no constant-allocation performance claim is made.
- The existing production Game/Studio URL, combat actor, choreography and C5 equipment previews remain unchanged. A new clip contract is not equivalent to end-to-end canonical combat migration.
- C6.2 should introduce version-pinned import/bake pipeline, clip hashing, identity sampling against rendered Studio, seek/play controls, morphology retarget validation and visual acceptance matrix. Preserve Game/Studio monorepo and independent future deployment planning.

**Separate tracking:** C5 issue #81 and timing issue #103 are not blockers. Reserve full C6 Phase Acceptance for C6.6 completion.
