# Mandatory major-phase repository cleanup gate

**Decision (2026-11-18):** The owner requires repository hygiene at the **end of each major Character Studio phase (C0, C1, …, C9)** and subsequently at each major game-engine phase. This applies to C6 as a whole, **not** every C6.x implementation PR. Retrospective C0–C5 debt is tracked in [the source-truth audit](repository-cleanup-audit-2026-11-18.md).

## Closure policy

Before any phase may be signed off:

1. Audit current exact-`main` code, source-to-runtime import/entrypoint reachability (including dynamic imports and HTML), workflow triggers, scripts, assets, licenses, docs, tests, build identities and the generated build graph. Recheck current upstream rather than trusting historical snapshots.
2. Identify **actually dead** modules, abandoned routes, superseded prototypes, redundant CI workflows and duplicate logic; substantiate each with references. Keep active compatibility code (e.g. combat actor bridge), runtime skinning and pinned source verification. A file being old or containing `C2` in its name is not proof it is unused.
3. Remove only code with verified replacement/retirement, preferably in focused PRs **before** phase acceptance. Update public UI/routes, Vite entrypoints, links, tests, dependencies, docs, scripts, CI paths and known exports in the *same* cleanup slice.
4. Do not weaken, delete or skip regression tests simply to reduce CI runtime. Migrate unique Lab/legacy visual tests to the maintained Studio (and headless geometry tests where appropriate), then retire the obsolete route. Preserve determinism, C5 equipment contact, authoritative combat, import identity, rights notices and performance baselines.
5. Keep the design minimal: SOLID responsibilities, DRY where behavior and contracts are genuinely shared, versioned schemas at stable boundaries, owned disposal, no duplicate rigs or broad new dependencies. Avoid refactors motivated only by file names or line counts.
6. Measure before/after tracked code and production bundle size (excluding generated pinned MakeHuman data), test duration, and any changed runtime CPU/memory behavior. State if measurement is unavailable.
7. Verify exact dependency locking (`pnpm-lock.yaml` and frozen CI installs) and current third-party notices; then run `pnpm typecheck`, `pnpm test`, `pnpm build`, compiled build-identity verification and targeted desktop/touch browser checks. Merge cleanup only after required Verify passes. Separately verify deployed build SHA if published.
8. Commit a **phase-specific cleanup record** under `docs/` that includes `Phase: C6` (or the exact selected phase), inspected SHA, inventory/deltas, removed and retained paths with evidence, residual debt/owners, tests and CI URLs, and an explicit review verdict. Do not claim acceptance from documentation alone.
9. During manually dispatched **Phase Acceptance**, supply the path of this committed report. The workflow validates it exists at the tested revision and contains the selected phase marker, before heavy CI. Acceptance still needs passing desktop/touch Chromium, visual inspection, issue/roadmap updates and owner signoff. A report or successful check alone does not mark a phase complete.

## Past phases and cadence

C0–C5 predate this policy. Do not retroactively erase historical evidence or rerun their entire manual Phase Acceptance just for documentation; the [retrospective audit](repository-cleanup-audit-2026-11-18.md) inventories their inherited debt, to be retired incrementally before C6 closure. C5 issue #81 remains separately tracked.

PR #107 temporarily hid Lab from production but preserved `TRILOK_INCLUDE_LAB=1` for dedicated C2/C3 regression runs. The subsequent [full Lab retirement candidate](cleanup-2026-11-18-lab-retirement.md) removes that diagnostic entrypoint and migrates source-backed checks to Studio. The retirement is not verified until focused desktop/touch browser checks and the normal CI pass.

C6.1 has already merged (PR #106). The owner requested retrospective cleanup **before C6.2**: complete and verify actual legacy Lab retirement, redundant workflow decisions and the audited hygiene debt (or explicitly record owner-approved narrow deferrals) before beginning animation ingestion work. Avoid speculative repository-wide refactoring. A **new C6 phase cleanup record** remains required before final C6 Phase Acceptance. Perform small code hygiene alongside appropriate work, with one focused change per PR.

A permanent GitHub Action for every subphase, a second repository, a new build system or a blanket tree-shaking rule is **not** required.
