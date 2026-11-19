# Trilok — Build-budget, deployment-gating and free-preview hosting policy

**Decision state:** DEVELOPMENT-ONLY policy implementation in PR #113. The owner confirms Cloudflare GitHub integration has been disconnected. We have not independently verified the Cloudflare dashboard, deployed Netlify or modified production; validate the zero-build containment gate separately. The GitHub artifact and manual Netlify development-preview workflows are being implemented/tested, not deployed before approval, environment secrets and merge to main.

**Review date:** 2026-11-19. **Scope:** Development and visual review of Game and Character Studio through C6.x and later implementation phases. **Production stays on Cloudflare**, with an optional Cloudflare Paid upgrade after game completion based on measured user traffic. This plan does NOT migrate long-term hosting to Netlify. **Priority:** Preserve deterministic correctness and visual verification while stopping repeated cloud builds on intermediate commits.

## 1. Observed source-of-truth baseline

- Default branch at review: 65270b7c6af34321c76a4236a26bf5b3da7f5e39.
- Current web app: TypeScript + Vite + Three.js; two entrypoints (root game and /studio/), static production output in apps/web/dist, Cloudflare Worker static assets at that path via wrangler.jsonc.
- Each Vite build emits /build-info.json with full commit SHA, UTC build timestamp and build ID. This identity must be inspected on the deployed origin, not inferred from the source branch or a green GitHub run.
- .github/workflows/ci.yml runs full animation verification, strict TypeScript, tests including combat determinism, Vite build and build-identity verification on PRs and main. phase-acceptance.yml retains manually dispatched full desktop/touch Chromium. Do not remove, weaken or replace those required gates.
- GitHub C6.2 history shows numerous rapid PR pushes with superseded/cancelled Verify executions; Cloudflare Workers Git integration is capable of launching another build per push. Settings in the user's Cloudflare account (branch controls, watches, duration details) have **not** been read; do not pretend the repository proves exactly which options are enabled.
- The owner reported the **3,000 Workers Builds included minutes exhausted** and a reset at **2026-12-01 05:29 IST**. The repeated failing Workers Builds checks are consistent with that account-level quota pause, rather than proof of a failing Trilok build.
- Historical compiled assets were approximately 36–43 MiB in a diagnostic; this is not a fresh bundle measurement. Re-measure file count, largest file and transfer before selecting a hosting provider.
- This repository is public, although original Trilok source is proprietary; license and distribution constraints remain applicable to every public preview.

**Root cause category:** avoidable coupling of source pushes to hosting builds, redundant source prep and inadequate release gating. Verify exact Cloudflare settings and metered minutes before attributing all 3,000 minutes to any specific workflow.

## 2. Non-negotiable operating rules

1. **Development pushes do not deploy.** No automatic Cloudflare Workers Builds for feature branches, docs, experimental assets, source audits or PR updates. A red CI check never triggers deployment.
2. **Main does not auto-publish on every push during development.** Merging is not authorization for a network release. Current Cloudflare production remains unchanged. Post-development Cloudflare production release cadence and a possible Paid tier are a separate decision.
3. **One immutable SHA, one checked artifact, one authorized deployment.** Reuse a previously verified build for that SHA; do not rebuild it in every provider. Record artifact SHA-256 and /build-info.json.
4. **Never publish an old preview as current.** An exposed preview requires a successful HTTP GET of that origin's /build-info.json whose commitSha equals the selected commit. Check both / and /studio/ routes and browser-console errors.
5. **No loss of tests.** Existing TypeScript, deterministic replays, model/skin tests, smoke checks and manually gated full desktop/touch Phase Acceptance remain. Optimize duplicate preparation, not correctness.
6. **Isolate staging and production.** No staging token or URL may deploy to the production Worker named trilok; use provider-scoped credentials and GitHub protected Environments with explicit approvals.
7. **No deployment secrets in the repository or PR-run jobs.** Read-only tests may run for PRs; only manually invoked deploy jobs with approved Environments may access deploy credentials.
8. **Do not assume any host account is connected.** The plan can be executed as code, but a provider account, token and consent must be confirmed before a publish action. Never fabricate a preview or a usage counter.
9. **Every substantial phase report must include the build-budget decision and artifact identity** along with tests, previews and remaining quality limitations. The owner receives an explicit rationale for any budget exception.

## 3. Immediate containment: Cloudflare Workers Builds

**Account-owner action; not yet completed by this PR:**
1. Open Cloudflare Workers & Pages, select the existing **trilok** Worker, then Settings > Builds.
2. For a strict zero-push-billing posture, disconnect the native Git build integration for this Worker (Cloudflare docs: Workers Builds > Disconnecting builds). Do **not** delete the Worker or GitHub repository, and do not uninstall the account-wide GitHub app. Existing active deployment should remain hosted; verify it.
3. If temporary disconnection is not acceptable, disable preview/non-production branch builds immediately and restrict build watch paths (docs, tests, audits, assets not shipped) while a controlled deploy path is configured. **This is a partial mitigation only**: main pushes still build, and Cloudflare can bypass path filters for empty pushes or 20+ commits/3,000+ file changes. It does not satisfy the final zero-automatic-build policy.
4. Record current build configuration, quota dashboard screenshots/counters and the pre-change production /build-info.json; verify after the change that a documentation-only test push initiates **zero** Workers Builds.
5. Do not upgrade as the first fix. Upgrade only if a measured, forecast workload cannot fit with the release gating below.

Workers Build minutes and GitHub Actions runner minutes are **separate meters**. Moving compilation to GitHub Actions conserves native Workers Builds minutes but may increase GitHub Actions usage. Both budgets need monitoring.

Cloudflare official docs:
- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
- https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/
- https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/

## 4. Build and deployment pipeline to implement, in order

### G0 — Baseline, stop the leak

- Inspect exact Cloudflare native build triggers, enabled branches, build command, timeout and build history; record used minutes per build and the amount spent on cancelled/superseded commits.
- Disable native per-push builds as in section 3, without changing current production.
- Reconcile the last deployed production SHA with main; stale production must be reported as stale, not silently overwritten.
- **Gate:** a non-deployment docs push produces no Cloudflare build; production still serves its previously deployed SHA. If this fails, do not move on.

### G1 — Reuse one verified GitHub build

- Keep Verify's job name and mandatory validation unchanged. Add minimal scoped artifact packaging of apps/web/dist after all required checks pass, including a file-list/SHA-256 manifest and exact source SHA.
- Fail the archive step if /build-info.json is absent, says unknown, or differs from the explicitly checked-out source SHA. Preserve Game, Studio, third-party notices and pinned-asset integrity.
- Publish artifacts for **successful** source SHAs only. Set a short retention (e.g. 7–14 days), and do not ship secrets or development assets.
- Pin Node/pnpm versions and dependencies; preserve SHA-verified MakeHuman caches. Build once per selected commit; reuse exact bytes for staging and production if still present, otherwise rerun gated validation and record a new artifact identity.
- **Gate:** two consumers of one artifact verify identical SHA-256, and wrong-SHA/expired/missing artifacts fail closed.

### G2 — Independent, on-demand free preview host

- First pilot a **Netlify Free** branch/deploy preview for **limited reviewer traffic**: deploy static apps/web/dist at the host root so both / and /studio/ and hashed assets resolve. Do not enable automatic build-on-every-push; invoke preview only from an approved GitHub Actions workflow or equivalent manual release action.
- Keep **GitHub Pages** as provider-independent fallback for public non-commercial demos. The repo is public, but GitHub Pages project URLs use a /Trilok/ base path; implement and test a preview-only Vite base/path configuration before claiming it works.
- Evaluate **Cloudflare Pages Direct Upload** as an alternative free *Cloudflare* delivery path (not an independent provider): build in GitHub Actions, then upload static dist. Check the Pages project and account quotas separately; no automatic Git-integrated Pages builds.
- Every preview must be tied to its exact SHA, and annotated experimental when motion quality has not been approved. Publish the verified /build-info.json and expose both / and /studio/.
- **Gate:** desktop and touch open the actual deployed Game/Studio origin, assets load, SHA matches, no unauthorized secrets leak, and old URLs are not mistaken for fresh commits.

### G3 — Protected staging and production (POST-DEVELOPMENT / DEFERRED)

- At production-readiness, separately approve and implement a **workflow_dispatch-only** Cloudflare release job (a narrow CI adapter, not a second build system). Inputs: exact 40-character SHA, destination (staging/production), existing artifact ID and a documented reason. **Do not create or run the production deployment workflow during the development Netlify pilot.**
- Require existing Verify success on that exact SHA and an immutable artifact manifest. Production additionally requires SHA equals current protected main HEAD and explicit reviewer approval via a protected GitHub Environment.
- Deploy with least-privilege provider credentials stored as GitHub Environment secrets. A staging Worker (if used) has a different name/configuration, token scope and URL than production. Never mutate the production Worker while testing staging.
- Prefer uploading already verified static output via an external CI/CD route (e.g. Wrangler from GitHub Actions with account ID and token), not building a second time in Workers Builds. Cloudflare officially supports external CI; verify account permissions before enabling.
- After deploy, fetch live /build-info.json, reject missing/mismatched SHA, check /studio/, and save URL, deployed SHA, artifact hash and verification timestamp to the release ledger. Failure means no acceptance claim or automatic rollback guess.
- **Gate:** wrong SHA, failed Verify, absent approval, wrong environment, and missing credentials all block deployment; no production release can be triggered by a PR.

### G4 — Enforce policy in code and review

- Amend tests/ci-phase-gating.test.ts with targeted assertions protecting manual deployment only, no push-triggered deploy jobs and protected environment/explicit SHA inputs; never weaken existing coverage.
- Add a deployment/release checklist to docs/ci-phase-acceptance.md and link this policy from the C6 phase-closeout documentation.
- Restrict Cloudflare-related deployment workflows to the approved gate; retire temporary one-off audit workflows after their evidence is archived, without deleting unique regression tests.
- Record build usage, bytes, source SHA and deployed identities in a concise release ledger. Revisit the budget during each major-phase cleanup.
- **Gate:** PR CI verifies the new policy guardrails and the owner signs off the workflow behaviour.

### G5 — Monthly measurement and adjustments

- Compare native Cloudflare build minutes, GitHub Actions spend/minutes, preview-host traffic, number of attempted vs authorized deployments, average build duration and stale-preview incidents.
- Assess whether any platform now exceeds its free quota. Prefer fewer builds and artifact reuse over paid upgrades. Never claim measured savings until both before and after counters have been collected.
- **Gate:** no unapproved deployment, zero native Cloudflare builds per intermediate commit, every public preview identifiable to a SHA, and no regression in test coverage.

## 5. Conservative monthly release budget

**Operating budget proposal (not a claim of current usage):**
- **Cloudflare native Workers Builds:** aim for **zero** when external CI uploads are active. Contingency ceiling **12 intentional builds/month** (up to 8 staging and 4 production). At Cloudflare's 20-minute maximum per build, this caps native usage attributable to those launches at **240 minutes**, well under 3,000; do not treat this arithmetic as a measured forecast.
- **Alert checkpoints:** notify at 120, 180 and 240 native minutes; stop nonessential deployments before breaching the contingency ceiling. If no Cloudflare usage API credentials exist, the release owner reads the dashboard and records values manually. No fictitious automated quota monitor.
- **Development work:** unlimited source edits subject to GitHub's own usage limits; never use production deployment as proof that ordinary TypeScript tests passed. Group related edits into focused reviewable commits and avoid deliberately starting multiple redundant full test jobs.
- **Netlify Free pilot:** set a review-only traffic budget of **10 GB/month**, equivalent to about 200 of 300 monthly credits at 20 credits/GB before other requests/usage. Deploy previews/branches have zero deploy credits; the site can still pause if the account's total credits are exhausted. This is not intended for a public high-volume game release.
- **Budget exceptions:** the owner must explicitly approve the reason, estimated additional build minutes or provider credits, identity of candidate SHA and impact on the remaining allowance. Record exception before the build.

## 6. Free hosting alternatives (official terms reviewed November 2026)

| Provider | Free offering relevant to Trilok | Advantages | Limits / decision |
| --- | --- | --- | --- |
| **Netlify Free** | 300 credits/month hard limit; deploy previews and branch deploys consume 0 **deployment** credits; bandwidth uses 20 credits/GB; production deploy 15 credits | Easiest root-hosted Game + Studio preview with Git integration or manual artifact upload; independent of Cloudflare Workers Builds | Shared credits cover traffic and requests and the entire site pauses when exhausted. **Preferred short-lived low-traffic reviewer preview**, not production at scale. |
| **GitHub Pages** | Free for public repos; <=1 GB site and ~100 GB/month soft bandwidth limit | No extra hosting account and straightforward GitHub Actions build artifact deployment | Project-subpath base needs adapting; intended for sites, not a free commercial business/SaaS host. **Fallback for public developer demo** with rights checked. |
| **Cloudflare Pages Direct Upload** | Pages Free allows up to 500 monthly Builds, 20,000 files, individual files <=25 MiB; free preview deployments | Existing Cloudflare ecosystem; direct-uploaded static output can avoid native Workers Builds compilation | Still Cloudflare, separate Pages limits and account controls; must confirm full per-file sizes and exact metering before use. **Optional same-provider fallback**. |
| **Vercel Hobby** | Free personal usage, included bandwidth and build resources | Root-hosted Vite site and convenient previews | Explicitly personal/non-commercial; Trilok may evolve into a commercial game, so do **not** make it the default production host. |
| **Firebase Hosting Spark** | 10 GB stored and 360 MB/day hosting transfer | Solid static content hosting with SSL/custom domain | Daily data-transfer cap is restrictive for large 3D assets; less suitable for repeated reviewer sessions. |

Other specialist game portals (such as itch.io HTML5 uploads) can host a playable public demo, but are not a substitute for exact-SHA preview and controlled Game/Studio CI deployment.

Primary vendor references:
- https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/
- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- https://developers.cloudflare.com/pages/platform/limits/
- https://developers.cloudflare.com/pages/get-started/direct-upload/
- https://vercel.com/docs/plans/hobby
- https://firebase.google.com/pricing

## 7. Hosted preview acceptance checklist

For every hosted feature preview:

- [ ] Candidate source SHA has successful exact-SHA Verify.
- [ ] Pinned MakeHuman source and third-party license validation completed.
- [ ] Build artifact is independently hashed and matches the selected SHA.
- [ ] Provider selected with remaining free quota and no automatic build triggers.
- [ ] Deployed hostname is not the production hostname and does not route to the production Worker.
- [ ] Live GET /build-info.json returns HTTP 200 and the exact requested 40-character commit SHA.
- [ ] Both root Game and /studio/ load from that same origin (correct base paths, cache and MIME types).
- [ ] Appropriate desktop/touch smoke and visual review passed; gameplay authority/skin pose state does not regress.
- [ ] PR comment includes tested SHA, URL, artifact hash, renderer evidence and known limitations.
- [ ] Preview is not merged or described as quality-accepted unless the owner has reviewed the actual movement.

## 8. Responsibility and evidence

- **Engineering partner (GitHub-connected):** make focused implementation PRs for G1–G4, add tests, validate exact SHAs, capture browser evidence and record every cost-related decision in this document/release ledger.
- **Cloudflare account owner:** GitHub build integration disconnection is reported complete. Verify that documentation/test pushes produce zero Cloudflare builds and active production still serves; Cloudflare remains the planned post-development production provider, potentially Paid.
- **Alternate provider owner:** explicitly connect/provision Netlify/Pages/GitHub Pages as selected. No credentials are inferred from a URL.
- **Review owner:** accept actual animation quality and any production promotion. CI success is not visual approval.
- **Release ledger:** one row per intentional deployment: purpose, branch, exact SHA, artifact SHA-256, provider/destination, live URL, observed deploy identity, test run URL, approval and usage counter/delta.

**Implementation order:** G0 → G1 → G2 → G3 → G4 → G5. If a prerequisite is blocked, continue independently verifiable engineering but do **not** claim a deployed preview. Preserve the existing production site and PR #112 draft/visual hold throughout.

**Sign-off required before changing provider or production behaviour.**

## 9. Implemented development-only GitHub workflow and Netlify account setup

**Implementation scope:** `ci.yml` creates a signed-by-SHA static artifact **only after existing required checks pass**. `scripts/verify-static-release.mjs` validates both Game and Studio, notices and `/build-info.json`, then creates a deterministic file-hash ledger. A separate `netlify-development-preview.yml` can be **manually** dispatched from `main`, validates the successful Verify run and exact checkout SHA, downloads the existing artifact, verifies every file, and uploads a **draft only** with a pinned Netlify CLI (`--no-build`, no `--prod`). It fetches live `/build-info.json`, `/` and `/studio/` before reporting the URL. It never deploys to Cloudflare.

**Important GitHub detail:** `pull_request` Verify normally checks out a synthetic PR merge ref, so its `github.sha` and generated artifact commit SHA may differ from the PR head SHA. The manual deploy **must use the exact Verify job's checked-out SHA and run ID**, not blindly paste the feature branch head. Its URL is marked as a *tested merge candidate*, not an assertion that feature HEAD was deployed. For exact feature-HEAD identity, first test that exact checkout in an approved workflow that captures its own artifact; do not change `build-info.json` without building the corresponding bytes.

**Netlify one-time owner setup (not connected here):**

1. Create a **Netlify Free** account at https://app.netlify.com/ and confirm the **credit-based Free** plan, 300 credits/month, hard zero-spend limit. Netlify may require identity/anti-abuse verification; it is an external account action.
2. Create a **development-only Netlify site** without enabling automatic Git builds. Use Netlify's **Add new project → Deploy manually** UI (a one-time minimal HTML folder upload may be needed to initialize the site) or create an empty site with the CLI. Name it clearly, e.g. `trilok-development-preview`. Do not connect the main Cloudflare production domain.
3. Open the Netlify site configuration and copy its **Site ID**. Generate a short-scoped **personal access token** from Netlify user settings; protect it as a secret, never paste it into a chat, PR, issue or file.
4. In GitHub repository Settings → Environments, create the `trilok-netlify-preview` environment. Where plan/permission settings allow, require an approver before deployment; restrict the environment to `main`. Add environment secrets `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN`. Protect against forked PR secret access.
5. Once the plan implementation is verified and merged to `main`, find a successful `Verify` run that uploaded artifact `trilok-static-<40-hex-checkout-SHA>`. Choose **Actions → Manual Netlify development preview → Run workflow**, select `main`, fill its `source_sha` with that **exact Verify checkout SHA**, its `verify_run_id` and a short `reason`.
6. Review the run summary and click its draft Netlify URL ending in `/studio/`. The workflow must report that the HTTP-served `build-info.json` SHA matches the selected Verify SHA and both entrypoints are served. Approval of final animation visual quality is a separate review.
7. **Budget discipline:** use short-lived preview reviews, stop sharing public previews beyond intended testers, check Netlify Usage after each session. The free credits are shared by bandwidth (20 credits per GB), requests (2 per 10,000), and any production deploys (15 each). Draft deploy creation consumes no deploy credits, **not** zero bandwidth/request credits. If paused, wait for renewal; do not silently upgrade or auto-recharge.

**Not required:** installing Blender, cloning Trilok locally, changing Cloudflare DNS, running any Netlify Functions, attaching a credit card beyond a provider's own account requirements, or upgrading Cloudflare during development.

**Production policy:** continue to host existing production on Cloudflare. After development and owner acceptance, decide separately whether to use Cloudflare Paid (and a scalable production release pipeline); the Netlify development preview may be retired without changing app architecture.

**Implementation note:** The development-only workflow is deliberately restricted to the trusted \`main\` ref and GitHub Environment; this is a configuration safeguard, not an automatic Netlify deployment. The owner has confirmed disconnection of Cloudflare GitHub builds; no Cloudflare dashboard readback is available in the connected tools.

**Current unresolved actions:** netlify site + credentials + protected GitHub environment are not provisioned with the available connector; the draft workflow cannot deploy until those owner actions and a successful post-merge Verify are complete. The Cloudflare disconnect was reported by the owner but has not been independently checked through the Cloudflare dashboard.

### C6.2 first preview troubleshooting: Netlify CLI monorepo selection

The first manual Netlify preview run [#44474743713](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44474743713) downloaded and cryptographically verified the intended C6.2 artifact (source PR head `2f01c3c9fc8bcacbde554ed6e00572d8790b8c55`, build merge checkout `a9c307b9a81b11c7c457efee2d5a3817782ba599`) but failed at Netlify CLI before any confirmed upload with `Projects detected` for several pnpm workspaces. Netlify's supported solution is selecting the project with `--filter "@trilok/web"`. This does not trigger a build or replace the main Netlify landing page. A fresh manual run must pass the upload and live-identity checks before claiming a preview exists.

Reference: https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/#work-with-monorepos

### One-field on-demand PR previews (November 2026)

The first C6.2 preview attempt revealed a second usability problem: the owner should not copy a full `source_sha` and GitHub `verify_run_id` after every PR commit. The manual action now accepts only a **pull request number** (default `112` for the current C6.2 phase) and an optional reason. The workflow reads the PR's **current** source SHA and branch, looks up a successful `Verify` run for the same PR/current SHA, selects its immutable SHA-named build artifact, and checks the full artifact hash. It also rechecks the PR head before uploading. If the commit moved, verification is still running, failed, or its artifact expired, it refuses the preview and does **not** deploy an older build. It never merges a PR, builds on Netlify, replaces the Netlify site's primary URL, or changes Cloudflare production. The input PR number is the only intended future choice when another feature needs review.

**Owner workflow:** Actions → Manual Netlify development preview → Run workflow on `main` → optionally change the pull request number → Run. GitHub then handles the exact SHA, Verify run ID, artifact hash and output URL automatically. Latest *verified* means latest **successful exact-head PR check**; it must not silently downgrade to a preceding commit when CI is pending.

### C6.2 Netlify CLI stall mitigation (2026-11-19)

[Manual draft run #44478478482](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/44478478482) successfully resolved PR #112, found Verify run #44473153341, downloaded and SHA-256-verified the exact 45,511,441-byte artifact, and confirmed the PR head had not moved. The deployment subprocess then produced no successful result until the 12-minute GitHub Actions timeout cancelled it. There is **no confirmed deployed build identity**, and cancellation must not be reported as a successful Netlify preview. This log alone cannot distinguish Netlify API/upload hang from a CLI workspace-prompt or CLI network issue.

The deployment step now invokes `scripts/deploy-netlify-static.sh` from the trusted `main` checkout. The script requires an absolute SHA-verified artifact path, moves to a fresh `$RUNNER_TEMP` working directory *outside* the pnpm monorepo before invoking the pinned `netlify-cli@27.10.1`, disables CLI telemetry, uses the explicit Netlify site ID and `--no-build --dir`, and does **not** use `--prod`, `--remote` or a project `--filter`. The CLI startup is bounded at 120 seconds and the draft upload at 300 seconds, with the Netlify deploy completion timeout at 180 seconds. Exit codes and high-level progress are logged without printing the private Netlify token, CLI JSON, request headers or environment. A timeout fails closed; do not infer that the CDN received all files. The existing workflow still validates Netlify's returned **unique draft URL**, the live `/build-info.json` build SHA, and both root/Studio entrypoints before reporting success.

Verification gates: focused uploader tests stub the CLI without network access and verify isolated working directory, exact `--dir`, `--site`, `--no-build`, timeouts, missing-credential fail-closed behavior and propagation of a failed upload. The CI policy test prevents bypassing the checked artifact or replacing draft-only deploys with production releases. This fix should be merged only after full Verify passes. **It does not itself deploy or replace any Netlify files.** A new manually triggered PR #112 preview run is required to obtain a verified URL. See [Netlify CLI deploy reference](https://cli.netlify.com/commands/deploy/).
