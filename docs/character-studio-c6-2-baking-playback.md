# C6.2 — Official calibrated animation baking and Character Studio playback

**Status:** Owner-approved recalibrated UAL1 visual set promoted on [PR #112](https://github.com/Tejasdmanjeshwar/Trilok/pull/112). Engineering closure remains conditional on final-SHA automated and browser checks, merge, and post-merge CI. Production Cloudflare deployment is not authorized.

## Approved Studio library

| Studio option | Runtime selection ID | Source clip | Immutable baked asset |
| --- | --- | --- | --- |
| Static pose | empty selection | C5 FK/IK preview, no clip | none |
| Idle | `human-idle` | `Idle_Loop` | `studio-v1/human-idle.clip.json` |
| Walk | `human-walk` | `Walk_Loop` | `studio-v1/human-walk.clip.json` |
| Jog | `human-jog` | `Jog_Fwd_Loop` | `studio-v1/human-run.clip.json` |
| Sprint | `human-sprint` | `Sprint_Loop` | `studio-v1/human-sprint.clip.json` |

The jog artifact retains its historical baked `human-run` ID for **byte-exact motion preservation**. `StudioAnimationLibrary` exposes the semantic `human-jog` runtime ID without modifying source curves, track contents or committed artifact hashes. Older selections `human-*-calibrated` and `human-run` are accepted as **input-only migration aliases**; they are never extra options in the UI. No user-selectable inferior reference set remains.

All official runtime clip bytes and `profile.json` are unchanged from the previously reviewed `candidate-c62-v1` artifacts; only their directory, registry, and manifest status changed. Source provenance and manifest SHA-256 identities are retained.

## Retargeting architecture and reproduction

`scripts/extract-quaternius-ual1.mjs` samples the pinned UAL1 Standard glTF skeleton, animation keys and inverse bind matrices into `assets/animations/sources/ual1-standard-locomotion-v1.json`. `scripts/bake-studio-animations.mjs` validates source bind data, loads pinned MakeHuman mesh/skeleton assets, creates a **49-joint** one-to-one, side-qualified UAL1–canonical mapping and reusable `source-anatomical` signed frame calibration. It transfers full source world-quaternion pose through the canonical FK and MakeHuman skinned mesh, including axial twist and the documented presentation-only root policy. `profile.json` and `manifest.json` under `assets/animations/studio-v1/` pin profile, source, target and per-artifact hashes.

For another clip on this **same UAL1 skeleton**, import the source channel keys using the existing extractor, retain source joint identifiers, and run the existing baker. No clip-dependent Euler fixes or new runtime player are required. For a new skeleton family, implement/validate a source-to-C1 exact joint map, measured rest/bind and signed secondary-axis cues, generate a distinct versioned profile, and verify neutral/T-A and sampled trajectory checks before adding any clip to the data-driven Studio registry. Unmapped or anomalous joints must fail explicitly or follow a documented extension policy.

From a checkout with pnpm 10.20.0, Node 22, and pinned MakeHuman assets obtainable:

```sh
pnpm install --frozen-lockfile
pnpm animation:verify
pnpm animation:bake
pnpm animation:verify
pnpm typecheck
pnpm test
pnpm build
node scripts/verify-build-identity.mjs
```

`animation:verify` regenerates every output in memory and compares exact bytes; `animation:bake` writes **only the approved official library**. To prove byte-for-byte unchanged motion across the promotion, compare the four approved file Git blob identities with those in the historical candidate commit, or compare their `artifactSha256` values against the approved candidate manifest.

## C6.2 cleanup and compatibility

Removed from ordinary build: the three inferior `reference-v1` clip files and manifest, `scripts/bake-reference-animations.mjs`, candidate-only registry imports/labels and the comparison-only Playwright spec. Removed one-off branch diagnostic workflows after preserving their evidence in GitHub Actions. Replaced `StudioReferenceLibrary.ts` with one data-driven approved library and renamed the production baker without touching retarget math. Source extraction evidence, the four-clip imported source JSON, calibration metadata, reusable mapping/retarget modules, C5 pose/IK and native mesh fixture tests remain intact.

The Character Studio viewport continues to dispose its current playback on regeneration, then re-enters the requested animation on the new rig; exiting playback restores C5 static pose and equipment. Presentation never writes combat authority (hit legality, damage, projectile physics, utility AI, timeline gates).

## Evidence, acceptance boundaries, and limitations

Owner viewed a **real deployed private Netlify preview** and accepted the calibrated four-clip appearance across different proportions on November 19, 2026. This supersedes earlier research-stage statements of unapproved visual quality. Previously retained evidence: [deterministic retarget proof #44396449061](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44396449061), [corrected multi-angle Chromium screenshots #44396639705](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44396639705), and the [source/MakeHuman direction-parity Verify #44398119439](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44398119439). The prior proof reported under 1° deviation across key sampled upper/lower limb directions on idle/walk/jog. The owner-reviewed preview is not evidence that *this final promotion commit* was separately deployed. The final workflow result and visual evidence must be recorded against the final SHA before merging.

C6.3+ owns foot planting/grounding, contact preservation, foot sliding, motion transitions/blending, weapon-aware layers, advanced grip contact and broader archetype rigs. Nonhuman retargeting, persistent dismemberment deformation, source-vs-target contact guarantees and AAA polish are **not** certified by C6.2. The owner-approved visual result must not be conflated with these future systems.

## Historical rejected approaches

The earlier 3-clip shaft-only Quaternius retarget in `reference-v1`, and the still earlier procedural Euler/sine gait prototype, failed owner quality review. Historical analysis remains in [retargeting research](character-studio-c6-2-retargeting-research.md). Neither is retained as a runtime fallback or selectable option.

