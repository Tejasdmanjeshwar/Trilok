# Pinned workspace dependency resolution (cleanup slice 4)

**Baseline:** `main` `b1341451f89c090e81c25ec7c6ec6dc5733ecbf4` following PRs #107 and #109. Prior workspace omitted `pnpm-lock.yaml` and used `pnpm install --no-frozen-lockfile` in every install-bearing workflow.

## Generated lockfile provenance

- Repository `packageManager` pins **pnpm 10.20.0**.
- Clean GitHub Actions Node **22** installation produced the canonical `pnpm-lock.yaml` via `pnpm install --no-frozen-lockfile`; see successful isolated [temporary generation workflow run #44319764704](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44319764704).
- Output was transmitted as a bounded base64 log payload with explicit start/end markers, decoded byte-exactly and committed. The generated file contains 63,202 bytes, lockfile schema `9.0`, eight workspace importers and 419 indented dependency entries (not necessarily 419 unique third-party packages).
- No dependency ranges were manually rewritten. The root `rollup: 4.68.3` override remains in the generated lockfile. **This locks the dependency graph obtained on the documented runner**, but a historical pre-lock installation may have resolved other versions: do not assert binary equivalence to prior deployed assets.
- The temporary helper workflow and CI log emission must be removed before merge; they are **not permanent actions**.

## Verification gate

Remaining Github workflows with installs switch to `pnpm install --frozen-lockfile`. The normal Verify, complete manual Phase Acceptance, manual solver performance runs, C5 paired solver comparison and Blender C5.2 reference use the same locked graph. The historically expensive C5 paired comparison is **manual workflow_dispatch only** with independently validated baseline/candidate SHAs; it requires both commits to include a compatible committed lockfile, avoiding uncontrolled PR-triggered 65-minute CI runs. `tests/ci-phase-gating.test.ts` checks pinned package-manager declaration, lock schema and that none of the current workflow definitions bypasses frozen installation.

Required before merge: clean Verify with `pnpm typecheck`, full deterministic tests, `pnpm build`, compiled build identity. Should it fail due lockfile incompatibility, investigate the actual generated file or package manifest; do **not** fall back to non-frozen installs.

## Licensing and security residuals

A lockfile is **not** a CycloneDX/SPDX SBOM, code audit, security scan or commercial redistribution clearance. `THIRD_PARTY_NOTICES.md` retains its present limited scope. A separate SBOM/third-party license review must enumerate all transitive packages at the pinned versions and follow current security guidance before any public/commercial redistribution assertions. MakeHuman CC0 source provenance and external Blender tool licensing remain separately documented. Do not conflate `pnpm-lock.yaml` with attribution/license rights.
