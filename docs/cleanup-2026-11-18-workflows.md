# Retrospective cleanup slice 2 — workflow retirement (2026-11-18)

**Baseline:** `main` `fe65033ac7766fcf3832001013ff54ebc591d173`; previous audit identified nine workflows. This slice removes two workflows and one unneeded branch-pruning helper. **Result:** seven workflow definitions, when merged; GitHub Actions run history remains intact.

## Removal justification

1. `.github/workflows/retire-verified-branches.yml` and `scripts/cleanup-merged-branches.mjs`: the manually dispatched legacy branch pruning mechanism was created for the 2026-11-14 inventory of 58 refs. GitHub API currently lists **four refs total**: `main`, `feat/c5-3-independent-sword-shield`, `fix/c3-7-early-age-source-rig-integration`, and `perf/c55-source-contact-batching-profile`. The non-main refs must **not** be erased without present-tense PR/ref provenance checks. Normal GitHub branch deletion and repository's automatic merged-branch deletion (if configured) supersede the one-off broad write-token Action; retaining a workflow capable of pruning by stale allowlist increases maintenance and accidental deletion risk. No branch is deleted in this PR.
2. `.github/workflows/studio-source-classification-compare.yml`: a historical path-filtered PR job that duplicated expensive pinned-source preparation and attempted baseline/candidate worktree sampling on every source-contact edit. The underlying `benchmarks/character-studio-source-hand.bench.test.ts` remains intact and callable through `pnpm bench:studio`. Manual `studio-solver-benchmark.yml` continues reporting serial source contact performance. **Tradeoff explicitly recorded:** automatic paired PR baseline-versus-candidate classification timings are retired. If comparative experiments become necessary, run the preserved benchmark at separately pinned SHAs and report runner/test/config equivalence; don't call a single-sha observation a controlled comparison.

## Explicitly retained

- `ci.yml`: required PR and main typecheck, deterministic combat replay, build, production Lab-exclusion and build-identity verification.
- `phase-acceptance.yml`: manually dispatched full desktop/touch browser checks and phase-closeout cleanup gate.
- `studio-interaction-diagnostics.yml`: manual zero-retry browser focus diagnostics until issue #103 has an evidence-based closure.
- `studio-solver-benchmark.yml`: explicit manual solver performance profiling with artifact preservation.
- `c55-controlled-solver-comparison.yml`: targeted C5-controlled *paired* benchmark retains baseline-v-candidate evidence for open C5 #81; reconsider once C5 #81 is closed.
- `c52-blender-reference.yml`: pinned Blender tooling/reference workflow potentially useful to C6.2; no runtime Blender requirement.
- `c54-makehuman-source.yml`: source BVH evidence still relevant to animation provenance. Revisit after C6.2 ingest settles.

## Verification and outstanding work

Normal Verify must confirm test graph/typecheck/build and no stale workflow dependencies. `tests/ci-phase-gating.test.ts` now explicitly protects the removals and preserves manual source benchmark access. No desktop/touch browser rerun is needed solely for deleting these GitHub Actions definitions; this does **not** close issue #108. The larger Lab source migration and unique C2/C3 test parity remain open and mandatory before C6.2, per owner requirement.

No bundle-size improvement is claimed from deleting CI-only scripts. GitHub Actions run evidence remains discoverable by run IDs even though definitions were removed.
