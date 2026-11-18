# CI verification and phase acceptance

Trilok distinguishes **intermediate implementation slices** from **phase closure**.
This policy is for Character Studio C0–C9 and can be extended to later gameplay
milestones without changing deterministic combat authority.

## Automatic fast checks

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`.
Its required job name remains `verify` (avoid breaking required-check rules).
It runs the existing dependency installation, `pnpm typecheck`, the **whole**
`pnpm test` suite (including the 1,000-seed deterministic combat replay),
`pnpm build`, and `node scripts/verify-build-identity.mjs`.

It does **not** install browsers, run Playwright, or upload pose screenshots.
It also does not replace independent Cloudflare deployment identity checking.
Intermediate C2.4/C2.5 PRs may merge after the fast checks and their relevant
code-level reviews pass, but they must not be called a completed C2 phase.

Repeated pushes to the same PR cancel superseded fast runs; after merging,
the `main` verification still runs. Feature-branch push and pull-request events
are no longer both scheduled for the same changes.

## Mandatory major-phase cleanup before acceptance

Starting with C6, `Phase Acceptance` requires a committed, phase-specific
`docs/*.md` cleanup report path in the `cleanup_report` workflow input.
The report must contain a standalone `Phase: C6` line (or the selected
later phase), and must be present in the exact checkout being tested.
The workflow validates this before expensive TypeScript/build/browser work.
Retrospective C0–C5 acceptance remains valid under the policy in
[phase closeout cleanup](phase-closeout-cleanup-policy.md) and the
[November 2026 cleanup audit](repository-cleanup-audit-2026-11-18.md).
**Passing this check is not sufficient for acceptance:** all existing
deterministic, desktop/touch visual and owner review gates remain.

Normal production builds omit the historical `c2-lab.html` Vite entrypoint.
The **manual Phase Acceptance** browser matrix temporarily opts in with
`TRILOK_INCLUDE_LAB=1` to retain unique C2/C3 anatomical E2E tests while
their assertions migrate to maintained Studio/headless coverage. The
normal `Verify` workflow checks that the retired entrypoint is absent
from default production output. This does not weaken the browser matrix.

## Manual browser acceptance

Use **Actions → Phase Acceptance → Run workflow** and choose:
1. The branch/ref that contains the **complete candidate phase**, usually
   `main` after all slices have merged.
2. The phase selector (C0–C9).
3. Optional notes identifying the tracking issue/acceptance scope.

`.github/workflows/phase-acceptance.yml` first runs the same strict TypeScript,
full deterministic unit and replay suite, production build and compiled
build-identity check. Only after those checks pass, **two independent browser
jobs** rebuild the same checkout and execute the **entire** Playwright suite
once each for desktop Chromium and touch Chromium. Each job keeps one worker,
preserving the existing serial WebGL tests within a viewport, but the two
viewports execute concurrently, with `fail-fast: false` so both report their
results even if one fails.

Each browser job uploads its own `phase-<phase>-<viewport>-evidence` artifact
containing `test-results/**/*.png` screenshots and JSON observations, and
records the selected phase, viewport, ref and **actual checked-out commit SHA**
in the Actions run summary. A green *overall* workflow requires deterministic
checks **and both** browser projects to pass; no desktop/touch tests are
removed, filtered by phase or moved into automatic PR checks.

The phase input is a label, **not** a filter that weakens the test matrix.
It does not publish, merge, or mark an issue as completed automatically.
GitHub's `workflow_dispatch` button becomes available after this workflow
file exists on the default branch.

**Acceptance requirements:**
- Full manual run succeeded on the intended candidate SHA.
- Actual rendered desktop/touch screenshots and relevant behavior were inspected;
  tests passing does not imply acceptable anatomy or deformation.
- Tracking issue and roadmap record the run URL, SHA, visual verdict, limitations
  and any unmet acceptance criteria.
- If code changes after that run, rerun acceptance on the new SHA; an older
  passing run does not certify newer revisions.
- Production Cloudflare build identity is checked **separately** when deployment
  verification is relevant. A successful CI build does not prove deployment.

Do not defer all visual inspection blindly: during intermediate slices, perform
focused browser/manual or exploratory checks when changes are graphics-heavy or
a visual defect is suspected. Those focused checks do not require triggering
the full, expensive automated browser matrix.

## Policy for C2

C2.3 is already complete (PRs #20 and #21); **C2.4** focuses on targeted skinning,
twist-influence and deformation improvements without extending into C3.
C2.5 is the stress-pose/integrity validation and readiness gate.
Run the manual **C2** browser acceptance when C2.4 and C2.5 are fully integrated,
and only then record C2 as accepted for transition to C3.

Keep the `e2e/` suite in the repository. Do not remove or skip assertions
merely to make acceptance faster. Future browser-test speedups (e.g., splitting
desktop/touch jobs or reducing redundant screenshot work) need separate review.

## Pinned MakeHuman acquisition reliability

Both full deterministic checks and browser acceptance require a reproducible
pinned MakeHuman CC0 mesh, official rig, facial atlas and original body targets.
The acquisition transport retries bounded transient connection resets, timeouts,
HTTP throttling and server failures with backoff. Missing/unlicensed/mismatched
content is never silently accepted: the original pinned Git blob, SHA-256,
byte-size, corpus-digest and license validations remain mandatory.

Automatic Verify and manually dispatched Phase Acceptance use a GitHub Actions
cache keyed by the source manifests and acquisition-script hashes. Its contents
are **untrusted until validated** by the normal build/test scripts, so a cache
hit never bypasses pinned-source verification. The acceptance deterministic
job saves the validated source cache before independent desktop/touch browser
jobs restore it; this avoids repeating hundreds of upstream downloads across
runner jobs. Only the normal manually dispatched phase workflow installs
Chromium or runs the entire browser matrix.
