# C6.2 workflow inventory and safe retirement — 2026-11-19

**Scope:** Workflow-only cleanup on [C6.2 PR #112](https://github.com/Tejasdmanjeshwar/Trilok/pull/112). Inspected current `main` at `c31c29b912c47e705f6372c0ed43c30510255fe0` and PR source `90f863716ec08b865a1f28cd8a0a92ea27874930` before deletion. Both contained **8 workflow YAML files**. Earlier deleted workflows may still appear in the Actions run history, which is not a list of currently active YAML definitions.

## Exact workflow census and disposition

| Workflow | Trigger / function | Decision and evidence |
| --- | --- | --- |
| `ci.yml` | Automatic PR/main Verify: frozen install, pinned source, deterministic animation hashes, TS, full tests/replay, Vite, build identity, immutable artifact | **KEEP**: required gate, exact job name `verify` |
| `netlify-development-preview.yml` | Manual, `main`-authorized verified static PR artifact to protected Netlify draft, no build/upload to Cloudflare | **KEEP**: approved development preview mechanism |
| `phase-acceptance.yml` | Manual full Chromium desktop/touch and C6+ cleanup-report gate | **KEEP**: phase closure safeguard |
| `studio-interaction-diagnostics.yml` | Manual scoped browser focus or animation regression, desktop/touch, pinned SHA, no retries | **KEEP**: required to validate PR #112; focus reliability [#103](https://github.com/Tejasdmanjeshwar/Trilok/issues/103) remains open |
| `studio-solver-benchmark.yml` | Manual single-revision `pnpm bench:studio` and measured JSON artifacts | **KEEP**: reusable performance baseline |
| `c55-controlled-solver-comparison.yml` | Manual two-SHA same-run baseline-v-candidate `pnpm bench:studio` with artifacts | **KEEP conditionally**: unique paired comparison with controlled runner; C5 [issue #81](https://github.com/Tejasdmanjeshwar/Trilok/issues/81) remains open. Reevaluate at its closeout |
| `c52-blender-reference.yml` | Manual pinned Blender 4.5.16 C5.2 reference skin/stance renders | **REMOVE**: superseded as C6.2 input; no dependency in official `scripts/bake-studio-animations.mjs`. Keep `tools/blender-c52/` research tooling and historical evidence |
| `c54-makehuman-source.yml` | Manual historical MakeHuman source BVH pose-pack fetch/audit | **REMOVE**: C6.2 uses independently pinned UAL1 glTF, inverse-bind source, 49-joint profile and deterministic official baking instead. Keep `scripts/c54-fetch-makehuman-poses.py` for research provenance |

**Result:** **8 → 6 tracked workflow definitions** in the PR, **0 new automatically triggered jobs**, with no loss of required CI, browser, preview, source validation or deterministic combat coverage. The removed workflows were manually triggered, so cost savings occur only by avoiding obsolete future manual dispatches, not by reducing ordinary PR CI. The remaining six are not necessarily all minimal forever: retire the C5 paired benchmark after documented C5 #81 closure and revisit focused browser diagnostics when #103 is resolved.

## Safety review and continuing limits

- Original C5.2 Blender authoring and C5.4 MakeHuman pose-research scripts are retained; no original attribution, rights notice, or prior Action run artifacts were deliberately deleted.
- C6.2 production clip bytes, 49-joint retarget profile, official source/asset hashes, registered playback, C5 FK/IK contact and combat authority are not changed by this slice.
- The `tests/ci-phase-gating.test.ts` regression policy now asserts these two one-shot workflow definitions stay retired while keeping all existing acceptance checks. No test deletion or relaxed checks.
- The normal `pnpm animation:verify`, `pnpm typecheck`, `pnpm test`, `pnpm build`, build identity and exact-head GitHub Verify remain mandatory. Desktop/touch browser checks remain a separate C6.2 merge gate, unaffected by workflow deletion.
- This is **workflow hygiene**, not a claim that all C0–C5 legacy scripts or all dead source code have been removed. GitHub's historical workflow/run list may still show earlier definition names.

## Verification ledger

The C6.2 prior source head `90f863716ec08b865a1f28cd8a0a92ea27874930` passed [Verify #44498433533](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44498433533), including accepted animation SHA regeneration, full replay/tests, TypeScript, build and immutable artifact. **This is evidence for the prior head, not automatic verification of the subsequent workflow-removal commit.** Record final exact-head Verify before merge; obtain separate Chromium evidence.
