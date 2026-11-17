# Character Studio solver profiling and Cloudflare verification gates

Status: **performance instrumentation and bounded cache candidate under review**.
This document describes what is verified by source inspection and what is not.
Never treat Node test runtime as browser frame time, or a green Cloudflare check as
evidence that GitHub verification gated the exact deployment commit.

## Baseline evidence and diagnosis

Inspected on 2026-11-17: main `f60fe92fc49064143d507866c25e3463aa121d55`;
draft C5.4 arrow-rest PR #88 HEAD
`77a222ac1de6fdc64899bb967b140a84be32238d`.
This independent performance branch is based on main; it does **not** contain
the unmerged PR #88 code. Rebase and re-run the tests after PR #88 acceptance.

The user-provided 2026-11-17 build log (not re-measured here) reports:
- Cloudflare environment initialization / retry gap ~396s, **before checkout**.
- MakeHuman preparation ~47s, Vitest 504.51s (482 tests/87 suites),
  Vite compilation 3.01s, deploy ~6s.
- Prior main GitHub test duration 301.03s; PR #88 298.49s.
  The comparable archery pose tests were 13.84s vs 14.09s;
  bilateral symmetry 37.90s vs 37.72s; bow morphology 37.71s vs 37.50s;
  PR #88's new arrow-rest tests 4.93s.

**No arrow-rest-caused whole-suite slowdown is demonstrated.** Provisioning
retry causes are unknown without Cloudflare build-system telemetry. No repo
code runs before checkout; possible scheduling, retry, or capacity effects
remain hypotheses.

Source review found:
- `sourceHandSamples()` walked the entire source mesh, source IDs, skin
  influences and region bone sets on **every invocation**, including repeated
  bow grip solves, radius retries and string-hook solves. The same geometry
  and sampling budgets are repeatedly used during a single preview.
- `measureSourceCylinder()` and `measureSourceStringContact()` intentionally
  re-skin posed vertices for each numerical objective evaluation; reusing
  posed positions across changing FK calls would invalidate contact evidence.
- `fitConstrainedIK()` does one full residual evaluation per legal
  finite-difference direction, plus up to four line-search probes per
  iteration and final pose reapplication; it is correctly bounded, but each
  objective can include real skin and collision work.
- `StudioPosePreview` already memoizes the expensive partial-draw nock/aim
  endpoints per generated character, pose and hand. Rapid range input still
  triggers synchronous solves in `StudioViewport.setArcheryDraw`.
- `tests/character-studio-performance.test.ts` captures frame/edit timing
  only, not solver latency or GPU execution.

## Focused first optimization

`StudioSourceContact.ts` now caches **only deterministic region vertex
indices**, per generated `StudioHumanModel` using a WeakMap, keyed by hand
and sample budget. There is no process-global accumulated mesh or posed
vertex cache. The cache clears when reaching eight budget entries and is
replaced when geometry, position/skin attributes, attribute update versions,
skeleton, graph, or source-index identity changes. Model disposal drops the
weak key. Callers get distinct Map wrappers; stored arrays are frozen.

This is valid for immutable topology / source vertex IDs during an object's
lifetime. If a future editor mutates source IDs or a typed attribute buffer
**in place**, it must replace the source array/geometry or mark the associated
BufferAttribute as updated (bump `version`). Source vertex positions and
morphology can still be measured fresh by all contact validators; none of
the hard acceptance gates or anatomical joint bounds changed.

The shared constrained IK returns a deterministic `evaluations` count,
including the final pose reapplication. This measures objective **work
count**, not wall time, collision count or frame time. Tests cover repeated
cache hits, source-equivalent regions, mirrored samples, and invalidation.

## Benchmark procedure

**Ordinary PR CI:** full `pnpm test` correctness and deterministic replay
checks; deterministic cache read-count and IK evaluation-count regression
assertions. No wall-clock pass/fail threshold.

**Controlled Node benchmark:** Actions -> *Character Studio Solver Benchmark*
-> Run workflow against the exact candidate ref. Or locally:
`pnpm bench:studio` on Node 22 / pnpm 10.20.0 with verified MakeHuman assets.
Output `test-results/studio-solver-benchmark.json` includes individual
measurements, mean, median, p95, maximum, Node version and architecture. It
measures neutral and seeded asymmetric source preparation, cold and warm
region classification, sword/staff/shield/bow equipment, nock, partial at
0/25/50/75/100%, aim, release, left/right bow hands and rapid slider
changes. Run the **same command and machine** on the unmodified main SHA
and the optimized SHA, with the same asset cache and runner preparation,
before making any performance improvement claim.

The benchmark is explicitly **Node/Vitest main-thread** evidence. It does
not measure Three.js GPU rendering, true browser input-to-paint latency,
texture or geometry allocation deltas, or WebGL frame times. The Studio
performance snapshot reports render-submission intervals, not GPU timing.
Browser/Playwright profiling and visual acceptance remain required.
The instrumented IK `evaluations` count can separately detect changes in
numerical work even if a noisy runner produces inconsistent wall-clock
timings.

**Before/after solver data:** pending controlled benchmark execution. A cache
hit avoids all repeated `sourceHandSamples` source-mesh classification work
by construction, but actual end-to-end speedup is **not yet measured**.
Additional solver, collision, or slider optimizations must be justified by
profiles, not by intuition.

## Cloudflare build/deploy design and blockers

Current `.github/workflows/ci.yml` on PR and main runs installation,
TypeScript, full tests including deterministic replay, production Vite build
and build identity. The heavier Playwright matrix runs via manual
`phase-acceptance.yml` (not on each PR). Cloudflare Git integration also
runs the user-reported `pnpm install --no-frozen-lockfile && pnpm typecheck &&
pnpm test && pnpm build`, independently. Because the deployment can run
**before** CI completes, removing its tests in this configuration would
remove a verification gate; do **not** change the dashboard command yet.

Repository-side preparatory command: `pnpm build:deployment` builds
the pinned source assets and checks the embedded build identity. **It is
not a security gate or an attestation**; never deploy solely because this
command passed.

Safest migration (requires Cloudflare dashboard and credential configuration
not available through the connected GitHub tool):
1. Configure a protected GitHub environment and appropriate Cloudflare
   scoped credentials, separating production and PR preview permissions.
2. Move Wrangler deployments to a GitHub Actions job with `needs: verify`
   in the **same workflow run**; deploy the checked-out SHA / exactly the
   verified build output. Reject SHA mismatch, and verify the served
   `build-info.json` SHA after deployment. Ensure untrusted fork PRs
   cannot obtain deployment credentials.
3. Keep PR previews using a gated, isolated environment and branch-safe
   preview naming. Verify this feature before disabling Git integration.
4. Require verified CI checks on main via branch protection/rulesets and
   keep protected production environment reviewers/approval as appropriate.
5. Once the new preview and production path is verified, disable or adjust
   Cloudflare Git automatic builds so a second, unverified deployment cannot
   race the Actions deploy. **Only then** replace repeated full testing with
   the build-only command.
6. Pin installation with a reviewed and committed `pnpm-lock.yaml` and
   `pnpm install --frozen-lockfile` in both workflows, then enable validated
   pnpm caching. No lockfile currently exists, so the CI install explicitly
   uses `--no-frozen-lockfile`; do not invent a lockfile without a real pnpm
   resolution. Preserve CC0 pinned asset checksum/size and third-party notices.

The GitHub integration can read the public rulesets list (empty on inspection),
but branch-protection API returns 403 to this installation. **Production
branch protection is unverified**, not assumed absent. Cloudflare dashboard
configuration, automatic build command and deployment environment credentials
have not been changed. Existing Cloudflare preview Git integration remains
active for PR #88. Thus the deployment runtime optimization is
**prepared/documented, not applied** until deployment gate control is
confirmed.

## Verification and follow-up

- Run TypeScript, full tests, deterministic replay and production build on
  this PR and recheck the GitHub status and SHA.
- Execute controlled benchmark on main and this branch, then report actual
  per-scenario before/after times and objective evaluation counts.
- Inspect browser input-to-paint / long tasks using Playwright or Chrome
  profiling before adding coalescing or workers.
- Rebase this branch after PR #88 merges (only after owner visual acceptance),
  rerun arrow-rest/finger clearance tests and preview multi-angle contact.
- Confirm exact Cloudflare preview SHA and protected deployment configuration
  before claiming faster safe deployments.
