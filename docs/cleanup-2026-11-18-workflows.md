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

## Subsequent C6.2 provenance-based retirement (2026-11-19)

The earlier retention list above is a **historical decision at the 2026-11-18 baseline**, not an assertion that the files must exist forever. After the accepted four-motion C6.2 calibration/source pipeline was promoted, two manually triggered source-research workflows had no remaining required role:

- `.github/workflows/c52-blender-reference.yml` was a one-off C5.2 Blender anatomical grip/stance reference renderer, not used by the official C6.2 UAL1 retargeter or normal build. Its `tools/blender-c52/` exporter and scripts stay as source-study evidence; no mandatory runtime/CI path imports them.
- `.github/workflows/c54-makehuman-source.yml` downloaded historical MakeHuman BVH pose packs. Official C6.2 input is instead the pinned, SHA-verified Quaternius UAL1 glTF source with actual inverse-bind matrices. Keep `scripts/c54-fetch-makehuman-poses.py` for historical research and provenance, without a permanent Actions entry.

**Result:** workflows go from **8 to 6** on the C6.2 branch (before merging PR #112); the old run URLs and reports remain in GitHub history. `ci.yml`, `netlify-development-preview.yml`, `phase-acceptance.yml`, `studio-interaction-diagnostics.yml`, `studio-solver-benchmark.yml`, and `c55-controlled-solver-comparison.yml` stay. The last is a **manual paired two-SHA performance comparison**, not the same as a single-revision benchmark, and C5 tracking issue #81 remains open. Re-evaluate it only when the paired measurement is no longer needed. The Studio interaction diagnostic is still required while #103 remains open.

Details and test evidence: [current workflow inventory](cleanup-2026-11-19-legacy-workflows.md).
