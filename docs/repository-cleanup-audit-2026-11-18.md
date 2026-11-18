# Retrospective C0–C5 and pre-C6.2 repository hygiene audit

**Audit date:** 2026-11-18. **Inspected branch:** `main` at `aaab465120f214337ba69db438925faf9f7bce67`. **Scope:** 347 tracked blobs in an untruncated 395-entry recursive Git tree, the nine Actions workflow definitions, active Vite entrypoints, C2 Lab and known Studio/Combat integrations. This is an evidence-backed **triage**, not proof of whole-program dead-code analysis or a complete dependency graph. This audit follows the historical [2026-11-14 rights/ref cleanup audit](repository-cleanup-and-commercial-license-plan.md).

## Architecture and retained boundaries

- **Game:** `apps/web/index.html` → `src/main.ts` → `AnimatedWarrior.ts` and `warrior.ts`. This remains the live D14 combat presentation and gameplay consumer. Removing these or replacing them with Studio rig would be a separate migration and could break damage, arrow and reaction synchronization.
- **Studio:** `apps/web/studio/index.html` → `src/studio/main.ts` → `StudioViewport.ts` → `StudioHumanModel.ts`, `StudioPosePreview.ts`, `AnatomicalTemplate.ts`, `AnatomicalFK.ts`, `SkinningSpike.ts`, `HumanPoseCorrectives.ts`. Core C5 sword, shield and bow contacts remain active. `SkinningSpike.ts` has a research-era filename but is in the **active human runtime**; KEEP. C6.1 `SemanticCharacter`, `CanonicalAnimationPose` and `@trilok/character-core` contract extensions are active.
- **Compatibility:** `characters/combat/LegacyWarriorAdapter.ts` is currently test-backed by `tests/character-runtime.test.ts`. It preserves the old combat API while the canonical runtime migration is deferred. KEEP until C6.5 migration has actual parity tests.
- **Character Lab:** `apps/web/c2-lab.html` → `src/characters/lab/c2-lab.ts` (38k chars), `CharacterLabControls.ts`, `BoneInspector.ts`, `LabCameraFocus.ts`. It is a **third shipped Vite HTML entrypoint** (game, Studio, Lab). Its primary UI is superseded by Studio but many checks still target it; it is legacy/public-facing bloat, not yet safe to hard-delete wholesale.
- **ContinuousHumanPrototype:** `characters/geometry/ContinuousHumanPrototype.ts` is a C2 implicit-surface research comparison. It is referenced in Lab and two unique `tests/character-geometry.test.ts` cases checking geometry/topology determinism, rig movement and disposal. Not a production anatomical mesh; retire the *runtime prototype* only after preserving any unique headless regression evidence or explicitly verifying a true replacement.
- **C2 and C3 evidence:** `e2e/c2-lab.spec.ts` is 523 lines; `e2e/c35-makehuman-face.spec.ts` and `e2e/c36-makehuman-body.spec.ts` verify source-face/body behavior by loading `/c2-lab.html`. They include specific skin/source and geometry checks not automatically satisfied by existing Studio suites. `tests/character-lab-camera-focus.test.ts` exercises a Lab-only helper. Do not simply delete these suites or pretend `StudioInspection.ts` has identical selectors.

## Actioned in the hygiene PR

1. Remove the **experimental Character Lab navigation** from the playable Combat header and update its navigation check to use supported Character Studio instead. Exclude `c2-lab.html` and its dependency tree from default production Vite build output using an explicit `TRILOK_INCLUDE_LAB=1` opt-in. Full manual Phase Acceptance opts in to retain unique C2/C3 Lab E2E coverage until migrated; normal `verify` asserts the Lab entrypoint is not emitted. The Lab source remains tracked and isolated; no claim is made that all source bloat is gone.
2. Record and enforce [mandatory phase-end cleanup policy](phase-closeout-cleanup-policy.md), with an explicit report gate for newly closing C6–C9 phases. C0–C5 historical acceptance is not retroactively invalidated.
3. Leave gameplay, combat timings, source anatomy, normal Verify, C5 equipment, and the existing Lab test matrix untouched. This is a staged deprecation and audit PR, **not** a claim of complete repository bloat elimination.

## Workflow inventory and decisions

| Workflow | Trigger / reason | Disposition |
| --- | --- | --- |
| `.github/workflows/ci.yml` | PR and `main`; TypeScript, Vitest/replay, build and build identity | **KEEP**, required `verify` gate |
| `.github/workflows/phase-acceptance.yml` | Manual; complete desktop/touch Chromium at phase closure | **KEEP**; add C6+ cleanup-report requirement before expensive checks |
| `studio-interaction-diagnostics.yml` | Manual targeted, zero-retry browser input timing investigation (#103) | **KEEP temporarily**, retire when #103 closed and equivalent focused checks exist |
| `studio-solver-benchmark.yml` | Manual, repeatable source contact / IK performance measurement | **KEEP**, still relevant to C5/C6 motion performance |
| `c52-blender-reference.yml` | Manual pinned Blender 4.5.16 reference baking and rendered source inspection | **KEEP temporarily**, potentially reuse pinned offline authoring tooling in C6.2; retire if superseded |
| `c54-makehuman-source.yml` | Manual original MakeHuman BVH provenance/source audit | **REVIEW FOR RETIREMENT** after C6.2 source provenance uses finalized; no automatic CI cost |
| `c55-controlled-solver-comparison.yml` | PR path-triggered, heavy same-run baseline-v-candidate 65-min benchmark | **REVIEW FOR MANUAL-ONLY or RETIREMENT** once C5 #81 metrics closed; high duplication with benchmark workflow |
| `studio-source-classification-compare.yml` | PR path-triggered before/after source contact classification | **REVIEW FOR MANUAL-ONLY or RETIREMENT**, potentially redundant with solver benchmark; do not delete before confirming baseline capability |
| `retire-verified-branches.yml` | Manual, write-scoped branch cleanup with guarded ref deletion | **KEEP until historical branch retirement is finished**, then prefer GitHub auto-delete setting and retire this workflow |
 
**Workflow risks:** Heavy automated *path-filtered* benchmarking can consume CI minutes on unrelated source edits; the ordinary `verify` check already runs the complete deterministic test suite. Before changing benchmark triggers or deleting workflows, confirm owners and preserve the measurement procedure and reproducible artifacts. Manual source audits are not inherently dead code.

## Additional maintainability and bloat observations

- The root `README.md` intentionally contains a minimal proprietary rights notice. Detailed engineering material lives under `docs/development/README.internal.md`; do **not** replace the short public root README with promotional/technical material.
- `docs/development/README.internal.md` has historical, no-longer-current claims (including Lab prominence and early C2/C3 progress); update its current-status landing section without erasing past phase evidence. Historical `docs/character-studio-c*-*.md` remain design/acceptance traceability, not runtime bloat.
- 98 tracked test/helper files and 16 E2E files are not automatically bloat. Tests associated with pinned MakeHuman source geometry, bodies/faces, D14 replay and C5 equipment prevent regressions. Long runtime-test duration is a separate optimization problem; don't delete coverage to save minutes.
- `apps/web/src/main.ts` is large (~1580 lines) and `apps/web/src/studio/StudioViewport.ts` ~918 lines. These are maintainability hotspots warranting bounded extraction when changing related functionality, **not** authorization for an unrelated full rewrite or guessed performance improvement.
- `apps/web/src/style.css` includes historical version-named sections and highly specific selectors. Audit dead selectors against actual runtime-generated DOM before removing declarations, using browser checks for desktop/touch; Phase Cleanup may progressively extract coherent styles rather than invent a new styling framework.
- The workspace has **no committed `pnpm-lock.yaml`**, per `THIRD_PARTY_NOTICES.md`. This obstructs exact transitive dependency reproducibility and commercial SBOM audit; tackle as a dedicated dependency-lock PR with actual tool output and license report, not a fabricated hand-written lockfile.
- The old 2026-11-14 branch/ref inventory is historical. **Do not delete branches** based on its stale SHAs; recheck current open PRs and immutable references first. Avoid touching GitHub settings, publication policy and branch protection without separate review.
- The historical C6.1 implementation docs retain a pre-merge status header despite successful merge. Correct status during C6 documentation maintenance, without confusing merge with overall C6 acceptance.
- Dependency/tool versions for new C6.2 animation ingestion must be pinned with rights evidence. Do not introduce a new renderer, another character rig, a second Studio editor or C9 serialization as a shortcut.

## Safe retirement plan (not claimed complete)

**Stage 1, this audit PR:** Remove player-visible obsolete Lab link and production Lab entrypoint, preserve isolated laboratory tooling behind diagnostic-build opt-in, add policy and tested documentation gate; run Verify.

**Stage 2, dedicated Lab migration PR before C6 phase closeout:** For each of three Lab-focused E2E suites, identify unique assertions and migrate them to maintained Studio surface/inspection or to pure real-source headless tests. Replace `tests/character-lab-camera-focus.test.ts` only if equivalent maintained focus coverage exists. Maintain camera/skin/source geometry diagnostics and screenshot evidence. Once replacement suites pass on desktop and touch, remove `apps/web/c2-lab.html` and `characters/lab/`, Vite `c2Lab` input, legacy-only imports, obsolete routes/links, and update documentation. Remove `ContinuousHumanPrototype.ts` only if no unique test or runtime dependency remains. Report production chunk/size changes.

**Stage 3, CI/workflow rationalization:** Benchmark the cost and uniqueness of C5 comparison workflows. Keep `verify`, source pinning, core acceptance and an accessible focused browser diagnostic. Remove or convert redundant PR-triggered benchmarks to manual when performance baselines are retained. Review post-branch-cleanup workflow and GitHub auto-delete settings.

**Stage 4, end-of-C6 closeout:** Audit import graph and actual built chunks, test counts, paths/workflows/assets, ownership/disposal, source rights and exact SHA; produce `docs/character-studio-c6-cleanup.md` with literal `Phase: C6`. Run normal Verify and dedicated desktop/touch acceptance, then collect owner signoff. **Hold C6.2 until the retrospective Lab retirement and workflow cleanup are completed and verified, or the owner explicitly accepts a documented narrowly scoped deferral.** Full C6 phase acceptance remains gated on a signed cleanup record.

## Verification ledger

Starting baseline: `main` `aaab465120f214337ba69db438925faf9f7bce67`, which passed [post-C6.1 main Verify](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44303429762).

This audit and scoped changes were performed through connected GitHub actions; local `pnpm` and full repo checkout were unavailable in the agent container. Accordingly no complete import graph, actual production bundle measurements, Chromium render captures or local dependency-license scans are asserted at audit time. Record resulting PR SHA, Verify URL, exact tests, and bundle deltas after GitHub CI runs; keep this ledger truthful.
