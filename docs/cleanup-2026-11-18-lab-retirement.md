# Retiring the C2 Character Lab: code and regression migration

**Candidate change:** `chore/retire-c2-character-lab-with-studio-parity`.
**Baseline:** `fe65033ac7766fcf3832001013ff54ebc591d173` (`main` after PR #107).
**Owner direction:** remove superseded research Lab, avoid duplicate character systems, preserve canonical skinned human, provenance and active game/Studio functionality.

## Removal scope

- Remove `apps/web/c2-lab.html` and its dedicated research-only HTML/CSS.
- Remove `apps/web/src/characters/lab/` (four legacy Lab UI/controller files), including `c2-lab.ts`, `CharacterLabControls.ts`, `BoneInspector.ts` and `LabCameraFocus.ts`. None is a supported Studio or combat runtime component.
- Retire the unused `ContinuousHumanPrototype.ts` smooth-union procedural C2 research mesh; its only runtime consumer was the removed Lab. **This is not the C1 canonical skeleton and never powered the accepted source-skinned Studio.** Remove its two feasibility-only unit tests; the remaining `character-geometry.test.ts` continues to assert real `SkinningSpike` skinned geometry and resource correctness.
- Remove the C2/C3 Lab-only E2E suites and obsolete Lab focus unit test *after* adding supported Studio rendering checks and mapping independent anatomical invariants to existing strict headless tests. Preserve actual pinned MakeHuman source and generated atlas manifests.
- Remove the obsolete `TRILOK_INCLUDE_LAB` diagnostic entrypoint switch and return Phase Acceptance to the normal Game+Studio build. CI still proves no `dist/c2-lab.html`.

## Regression migration and coverage map

| Retired Lab behavior | Supported test / renderer evidence | Limitations |
| --- | --- | --- |
| Imported CC0 surface, source geometry, weight mapping and normal rig disposal | `tests/anatomical-template.test.ts`, `tests/character-geometry.test.ts`, `tests/character-c2-5-geometry-audit.test.ts`, `tests/character-anatomical-deformation.test.ts` | Primitive implicit-surface research test intentionally retired, not a production requirement |
| FK pose library, bilateral hands, shoulder/axilla, elbow/wrist, knees/hips, deformation seams | `tests/character-c2-5-pose-matrix.test.ts`, `tests/character-c2-4-acceptance.test.ts`, `tests/character-anatomical-deformation.test.ts`; `e2e/studio-source-parity.spec.ts` captures supported Studio shoulder/knee/fist/jaw poses | Non-public advanced C2 stress poses remain validated by headless pose-matrix, not exposed as extra Studio controls |
| Legacy Bone Inspector search/filter/markers and Lab orbit UX | `tests/character-studio-inspection.test.ts`; `e2e/studio-inspection.spec.ts`; `e2e/studio-source-parity.spec.ts` exercises supported Studio joint overlays, focus, orthographic camera, front/rear/side, touch | The Lab-only bone list/search UI is intentionally retired; no equivalent player-facing feature is claimed |
| Facial source target controls, asymmetry, mouth-open/jaw composition, topology and finite output | `tests/character-c3-5-makehuman-facial.test.ts` verifies source deltas and quantitative jaw coordination; `e2e/studio-source-parity.spec.ts` captures native mouth-open/jaw and asymmetric/blink skin | Unsupported out-of-range 1.25 stress screenshot is historical evidence, not player acceptance |
| Body source targets, 846 atlas entries, camera preservation, age 0..0.1875 and skeleton refit | `tests/character-c3-6-makehuman-body.test.ts` verifies exact native deltas, source joints/IK, infancy and rollback; `e2e/studio-source-parity.spec.ts` checks the atlas, body presets and visible age states | Source-vertex count diagnostic label was Lab-specific and is no longer player-facing |
| Morph and head shape edits preserve camera, undo/reset, shell/facial independence | `e2e/studio-customization.spec.ts`, `e2e/studio-history.spec.ts`, `tests/character-studio-customization.test.ts`, new Studio screenshots | Studio exposes a different UX than old research controls; parity is functional rather than selector-identical |
| Standalone Lab navigation | `e2e/combat.spec.ts`, `e2e/studio.spec.ts` now cover Game ↔ Studio and absence of obsolete link | Lab URL is retired; no redirect added |

## Acceptance before merging

1. Confirm production build includes only **Game** and **Studio** HTML entrypoints; compile `pnpm typecheck`, `pnpm test`, `pnpm build`, verify build identity and Lab output exclusion.
2. Run **focused desktop and touch Chromium** on `e2e/studio-source-parity.spec.ts` plus `e2e/studio.spec.ts`, `e2e/studio-inspection.spec.ts`, `e2e/studio-customization.spec.ts`. Check actual rendered screenshot evidence, source-geometry deform, atlas fetch and lifecycle.
3. Record candidate SHA and browser results. Do not claim test parity or production deployment from a green TypeScript/unit CI alone.
4. Preserve existing combat and C5 equipment tests, MakeHuman source provenance and all normal `tests/character-*` except the Lab-only camera helper.
5. Record actual Vite built asset count/bundle size changes after builds, rather than guessing from removed source line counts.

**C6.2 remains paused pending this candidate's verification and issue #108 cleanup closure.** This migration neither introduces an extra rig nor changes combat authority. Formal C6 Phase Acceptance remains reserved for end-of-C6.
