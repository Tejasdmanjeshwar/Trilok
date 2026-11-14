# Trilok branch retirement, dead-code, and publication cleanup — audit

**Date:** 2026-11-14. **Repository remains private.** Audited default `main`: `9ef46d99011cff7dcfcc8d50b429f912a76b97a1`.
**Owner directive:** Commercial proprietary RPG; eliminate unused branches and superseded Vanara reference workflows; run Chromium at full C0–C9 phase acceptance only. **This report does not delete branches or grant source licenses.**

## Verified branch facts

- **58 total branches (2026-11-14):** 47 merged PR head branches, 6 closed/unmerged PR branches (including newly closed #13), 3 open PR branches (#56/#57/#58), 1 unreviewed unlinked branch, and 1 default branch.
- The 47 merged-PR head branch SHAs match the recorded `head.sha` on their merged PRs (no post-merge commits detected at current tips). GitHub often uses squash merges, so ordinary `git merge-base --is-ancestor` alone is insufficient: PR merged status + tip matching + file-review is required.
- Currently open: #56 (C3.6; fast Verify blocked by private Actions budget), #57 (rights and retirement workflow), and #58 (legacy species code cleanup based on #56). PR #13 has now been **closed as superseded**, preserving its PR/commit record. Do **not** delete active PR branch refs.
- `feat/c2-4-distributed-forearm-twist` has no linked PR, diverges by one old commit; source diff touches `SkinningSpike.ts`. The already merged PR #24 is named distributed-forearm-**skin**-twist and uses a different accepted implementation; confirm no unique needed behavior before retiring.
- Five rejected C3.5 branches: `feature/c3-5-continuous-private-reference-morph` (#51), `feature/c3-5-facial-topology-controls` (#53), `feature/c3-5-hanuman-face-reference-reconstruction` (#50), `feature/c3-5-licensed-hanuman-face-atlas` (#52) and `feature/c3-5-scan-backed-head-replacement` (#48). Their experimental work is **not approved** for production/public release.
- The previous C2 PR #13 includes `apps/web/public/characters/hm08/base.obj` (1,749,303 bytes), not in current main, as well as old `/c2-preview.html`/rig experiment files. This branch must not be treated as identical to main merely because later C2 development superseded its goal.

## Full branch-tip inventory

| Branch | Current tip | Status | Cleanup disposition |
| --- | --- | --- | --- |
| `chore/c2-4-targeted-acceptance-closure` | `7c2fb16511` | Merged PR #32 | Delete after merge-tip check |
| `docs/c9-defer-character-save-load` | `eb82b82f04` | Merged PR #55 | Delete after merge-tip check |
| `docs/pre-publication-license-security-audit` | `0cea215053` | Open PR #57 | Preserve pending review |
| `feat/adaptive-combat-rapid-melee` | `61e7561625` | Merged PR #2 | Delete after merge-tip check |
| `feat/arena-character-lab-nav` | `614690ef2f` | Merged PR #18 | Delete after merge-tip check |
| `feat/c2-2-official-rig-weights` | `8834713602` | Merged PR #17 | Delete after merge-tip check |
| `feat/c2-3-anatomical-fk` | `dc521e5a5c` | Merged PR #19 | Delete after merge-tip check |
| `feat/c2-4-distributed-forearm-skin-twist` | `c3e5ec32b5` | Merged PR #24 | Delete after merge-tip check |
| `feat/c2-4-distributed-forearm-twist` | `f4fe766030` | Unreviewed | Compare against accepted C2.4, then retire if redundant |
| `feat/c2-4-elbow-wrist-skin-blends` | `f04b2a7393` | Merged PR #26 | Delete after merge-tip check |
| `feat/c2-4-shoulder-girdle-skin-distribution` | `302d249188` | Merged PR #25 | Delete after merge-tip check |
| `feat/c2-vetted-human-template` | `00bb26e41d` | Merged PR #16 | Delete after merge-tip check |
| `feat/c3-1-bounded-human-morphology` | `d41093f54a` | Merged PR #40 | Delete after merge-tip check |
| `feat/c3-2-local-anatomical-proportions` | `435f81fb44` | Merged PR #42 | Delete after merge-tip check |
| `feat/c3-3-pose-correctives-calibration` | `1c00a49240` | Merged PR #43 | Delete after merge-tip check |
| `feat/c3-4-complete-human-head-morphology` | `87b50cf05f` | Merged PR #44 | Delete after merge-tip check |
| `feat/c3-5-primate-bear-head-families` | `dfb172e841` | Merged PR #46 | Delete after merge-tip check |
| `feat/character-studio-browser-native-roadmap` | `c5fdf3cc6b` | Merged PR #10 | Delete after merge-tip check |
| `feat/character-studio-c0-architecture` | `4d3d362923` | Merged PR #11 | Delete after merge-tip check |
| `feat/character-studio-c1-contracts` | `6fbccea057` | Merged PR #12 | Delete after merge-tip check |
| `feat/character-studio-c2-skinned-human` | `4f0adab5bb` | Closed/superseded PR #13 | SHA-verified retirement, owner-approved |
| `feat/character-studio-c2-skinning-spike` | `630d60b6c9` | Merged PR #14 | Delete after merge-tip check |
| `feat/ci-phase-gated-browser-acceptance` | `e4e2a88c75` | Merged PR #22 | Delete after merge-tip check |
| `feat/d9-persistent-arrow-wounds` | `125bf26cba` | Merged PR #4 | Delete after merge-tip check |
| `feat/d10-combat-reliability-foundation` | `218315faee` | Merged PR #5 | Delete after merge-tip check |
| `feat/d11-cinematic-melee-feel` | `6a6d8320cd` | Merged PR #6 | Delete after merge-tip check |
| `feat/d12-rhythmic-offense` | `94b712b819` | Merged PR #7 | Delete after merge-tip check |
| `feat/d13-adaptive-enemy-patterns` | `0fb524b95b` | Merged PR #8 | Delete after merge-tip check |
| `feat/d14-multiphase-miniboss` | `5f73752686` | Merged PR #9 | Delete after merge-tip check |
| `feat/initial-foundation` | `46040d6cc5` | Merged PR #1 | Delete after merge-tip check |
| `feature/c3-5-continuous-private-reference-morph` | `e848376459` | Rejected PR #51 | Archive evidence privately; delete branch ref |
| `feature/c3-5-facial-topology-controls` | `7bcaf77b4b` | Rejected PR #53 | Archive evidence privately; delete branch ref |
| `feature/c3-5-hanuman-face-reference-reconstruction` | `ee077be868` | Rejected PR #50 | Archive evidence privately; delete branch ref |
| `feature/c3-5-licensed-hanuman-face-atlas` | `da33516333` | Rejected PR #52 | Archive evidence privately; delete branch ref |
| `feature/c3-5-makehuman-facial-controls` | `3e30f0f5a2` | Merged PR #54 | Delete after merge-tip check |
| `feature/c3-5-scan-backed-head-replacement` | `d8100866aa` | Rejected PR #48 | Archive evidence privately; delete branch ref |
| `feature/c3-6-native-makehuman-body` | `a07140d9f4` | Open PR #56 | Preserve pending review |
| `feature/character-c2-5-geometric-audit` | `8ac069cbc2` | Merged PR #35 | Delete after merge-tip check |
| `feature/character-c2-5-performance-lifecycle` | `236b12098f` | Merged PR #34 | Delete after merge-tip check |
| `feature/character-c2-5-pose-acceptance` | `3e4375625c` | Merged PR #33 | Delete after merge-tip check |
| `feature/character-lab-viewer-first-ux` | `14460aec69` | Merged PR #36 | Delete after merge-tip check |
| `fix/c2-3-anatomical-jaw-opening` | `c649aff0a6` | Merged PR #21 | Delete after merge-tip check |
| `fix/c2-3-palmar-frames-direction` | `300cf03be0` | Merged PR #20 | Delete after merge-tip check |
| `fix/c2-4-body-deformation-integrity` | `b8ebc59ff9` | Merged PR #31 | Delete after merge-tip check |
| `fix/c2-4-hand-transition-deformation` | `58a2a6c9eb` | Merged PR #29 | Delete after merge-tip check |
| `fix/c2-4-shoulder-axilla-skin-geometry` | `e099b2e5c2` | Merged PR #30 | Delete after merge-tip check |
| `fix/c2-4-source-weight-segment-ownership` | `c292ca5579` | Merged PR #23 | Delete after merge-tip check |
| `fix/c2-4-wrist-skin-regression-headless-geometry` | `e0102d39cd` | Merged PR #27 | Delete after merge-tip check |
| `fix/c2-4-wrist-transition-bone-inspector` | `e2d8caf25c` | Merged PR #28 | Delete after merge-tip check |
| `fix/c2-5-e2e-metrics-panel-visibility` | `7e306b6466` | Merged PR #39 | Delete after merge-tip check |
| `fix/c2-5-real-asset-pose-matrix-timeout` | `2dfc75dc0a` | Merged PR #38 | Delete after merge-tip check |
| `fix/c3-4-keep-camera-on-morphology-change` | `38d598609b` | Merged PR #45 | Delete after merge-tip check |
| `fix/c3-5-anatomical-macaque-bear-faces` | `8e204d9e9c` | Merged PR #47 | Delete after merge-tip check |
| `fix/character-lab-focus-without-vanara` | `4dc5e2356d` | Merged PR #49 | Delete after merge-tip check |
| `fix/character-lab-sidebar-pose-controls` | `8f3f193a4c` | Merged PR #37 | Delete after merge-tip check |
| `fix/d8-enemy-melee-freeze` | `eb0b26428e` | Merged PR #3 | Delete after merge-tip check |
| `main` | `9ef46d9901` | Default | Preserve and protect |

| `chore/retire-legacy-mammal-preview` | `6ce383e07c` | Draft PR #58 | Preserve until fast Verify, review and merge |

## Real source-code cleanup targets — deliberate distinction

### 1. Rejected third-party reference experiments (not active runtime)

Do not incorporate code from branch #52's `LicensedVanaraFaceAtlas.ts` or bundled GLB-derived depth field. Its source model was CC BY 4.0, meaning adapted data may carry attribution obligations. Also do not resurrect third-party STL-model shape transfers from #50/#51: the Vedic Futura reference is documented as CC BY-NC-ND 4.0, not cleared for commercial reconstruction. Preserve a minimal **private** provenance/takedown audit for rights enforcement; do not republish the original model URLs or code-derived data in a new public snapshot. Deleting branch refs **does not** erase PR patches, commit objects, activity logs or copies.

### 2. Active but superseded Primate/Bear prototype in `main` (not dead yet)

A targeted import and UI audit identifies these **currently wired** files:

- `apps/web/c2-lab.html`: `#head-family` options 'Primate / Vanara' and 'Bear', mammal preset and slider panel; experimental banner.
- `apps/web/src/characters/lab/c2-lab.ts`: imports mammalian recipes and landmarks, `selectedFamily()`, conditionally loads animal-head family and invokes old `createMammalianHeadRecipe`.
- `apps/web/src/characters/geometry/HumanMorphology.ts`: branches into mammalian head transform/color/landmark generation; removing imports alone breaks build.
- `apps/web/src/characters/geometry/MammalianHeadDeformation.ts` and `MammalianFaceAnatomy.ts`: old procedural, source-surface mammal approximations, **not** the rejected licensed GLB model. Need deliberate C7-deferral retirement and test updates.
- `packages/character-core/src/morphology-mammalian.ts` and its export from `packages/character-core/src/index.ts`: C3.5 species-specific recipe generator; retire or explicitly mark unsupported after checking runtime consumers.
- `tests/character-c3-5-mammalian-heads.test.ts` and references within `e2e/c2-lab.spec.ts`: update to validate removal/absence of obsolete species preview without weakening human C3 acceptance tests.
- `docs/character-studio-c3-5-mammalian-heads.md` contains external museum/3D-scan reference links. Move any genuinely necessary research citations into a **private internal** rights/provenance inventory; remove obsolete model URLs and source-derived speculation from public-facing docs.
- `README.md` describes C3.5 animal family as a preview and incorrectly says C3.6 is avian; the roadmap also carries superseded C3.5 wording. Align with accepted C3.5 human facial PR #54, draft C3.6 human body PR #56 and planned C3.7 integration.

**Preserve:** `packages/character-core/src/presets.ts` C1 archetype IDs and generic extensible skeleton/segment contracts for future C7 Vanara, bear and unusual anatomies. Those are not third-party scan dependencies. Keep accepted human C3.1–C3.6 topology, camera controls, face/body morphology, source IDs, UVs, rig/FK, tests, C1/C2 adapters and D14 combat intact.

### 3. Additional hygiene

- `apps/web/src/characters/geometry/ContinuousHumanPrototype.ts` is still the implicit comparison/fallback and has active lab consumers; do not label it dead without a supported replacement decision.
- `main` is currently **unprotected**. Enforce required fast `verify` and non-forced PR merges when plan permissions allow.
- The GitHub repository API shows **`delete_branch_on_merge=false`**. Enable GitHub's built-in **Automatically delete head branches** setting. No new Actions workflow for post-merge deletion: that wastes CI and introduces write-token attack surface. Retrospective cleanup of historical refs is a separate audited action.
- No committed `pnpm-lock.yaml` is present; dependency license/security scanning is not reproducible until locking dependency versions, recording license notices and generating an SBOM.
- Eliminate outdated documents/labels only with a reference map; do not delete source history as a substitute for rights clearance.

## Cleanup implementation order

1. **Governance and backup:** capture complete private archival mirror/ref inventory and issue/PR provenance snapshots; identify any legal hold and confirm `main`/PR #56/#57 must be preserved. Validate exact HEADs and ensure merged PR tips are unchanged.
2. **Historical refs:** delete 47 verified merged head refs after confirming no open PR depends on them; PR #13 is already closed; SHA-verify before retiring its branch; retire five rejected C3.5 refs and the unreviewed forearm ref only after owner confirms discard. Note: deleting refs does not sanitize existing repo history.
3. **Focused application cleanup PR:** retire experimental Primate/Bear UI, recipe, runtime morph, tests and old 3D reference URLs **as one reviewable change**. Preserve C1 generic archetypes for C7 and accepted human features. Use TypeScript, full Vitest + combat replay, build and browser/manual inspection (full automated Chromium only for phase C3 acceptance).
4. **Documentation and licensing PR:** correct roadmap/README, create proprietor-approved copyright / **All Rights Reserved** notice for original Trilok source, `THIRD_PARTY_NOTICES`, pinned CC0 MakeHuman manifest and lockfile/SBOM. Explicitly separate code rights from the CC0 assets. Avoid MIT/Apache/GPL if the intended policy is **no third-party commercial reuse of engine code**. Obtain contributor rights confirmation.
5. **Security publication gate:** full-history/ref secret scan, credential rotation where needed, license inventory, third-party artwork provenance, security check of workflow logs/PR attachments and Cloudflare configuration; enforce branch protection and least-privilege Actions. These have **not** been fully scanned in this connected-GitHub audit.
6. **Publication decision:** the owner chose to **retain the existing repository and make it public after cleanup**, accepting that historical objects and current source may be copied. Do not create a separate public repo or reroute Cloudflare without approval. Complete a current-tree secret/licensing audit, remove obsolete refs, place minimal root README, review licensing PR #57, and verify the exact public commit's tests after GitHub-hosted CI becomes available.
7. **Future merge policy:** one PR per focused change; fast Verify green before merge; owner visual approval when applicable; GitHub auto-delete merged head; C0–C9 Chromium only on manually initiated Phase Acceptance; scheduled monthly stale/ref/dependency audit if desired.

## Commercial licensing stance

**Proprietary / All Rights Reserved for Trilok-original TypeScript and creative content, with distinct notices for third-party assets.** No-license/All-Rights-Reserved is consistent with retaining copyright and not granting general reuse rights. However, GitHub Terms still allow viewing and forking public repositories; anyone can clone or leak source once published. Neither deletion nor a proprietary notice restores trade-secret confidentiality. Do not grant MIT/Apache-2.0 rights if third-party commercial competition is disallowed. Counsel should review the final precise wording and ownership before publication. MakeHuman's pinned CC0 graphical assets can be redistributed and used in closed-source character tools, independently of Trilok-owned engine code; importing actual AGPL MakeHuman program logic requires separate license analysis.

## Evidence limits

Complete branch-tip/PR classification and targeted active-source call-path audit performed; this is **not** full secret scanning of every historical Git object, issue upload, workflow artifact or complete transitive dependency graph, nor proof that every unused code path has been found. The claim of dead-code removal requires TypeScript/import-graph analysis and full tests on the resulting cleanup branch.


## Owner-approved low-profile public-facing presentation (2026-11-14)

The owner is comfortable with the fact that public disclosure cannot be reversed and wants a **plain, non-promotional** public repository for free standard GitHub Actions, while retaining exclusive commercial control over the Trilok code.

- The full engineering README is retained at `docs/development/README.internal.md` and the root `README.md` is deliberately minimal in PR #57. **Both files become public if this existing repository is made public.** Do not store credentials, restricted third-party source or genuinely confidential documentation in the repo. The owner accepts the visibility risk; 'internal' describes its engineering role, not access control.
- The public root `README.md` should be a short factual statement with no screenshots, badges, elaborate gameplay descriptions, roadmap, community invitations, marketing language, external contact links, or unnecessary promotional visuals. An approved **template** is in `docs/publication/README.public-template.md`; it is not yet a live root README.
- Accurate public identity and rights information must remain: proprietary source code, no open-source permission, attribution to CC0/other third-party licensors in dedicated notices, and a statement that contributions/support are not solicited. Do not use misleading claims of abandonment, nonfunctionality, or false security through obscurity.
- Avoid search discoverability aids such as unnecessary topics, marketing description, social links and showcase pages; do not claim this makes Git objects undiscoverable or prevents cloning, indexing, automated harvesting or forks.
- No secret/private architecture belongs in public Git objects, including previous commits, branch references, PR patches, Actions logs or downloadable artifacts. **A new public repo created with only approved files and fresh history** avoids copying old rejected refs; merely simplifying `README.md` in the existing repo does not.
- **CI correctness caveat:** If the separate public repository is only a sanitized subset, its green checks do not certify all private canonical source code. To use public Actions to certify Trilok, the public CI source snapshot must include the actual testable source/dependencies at a matching content identity and report exact SHA/content manifest; private-only dependencies cannot silently be left out. The Cloudflare release SHA is verified independently.
- Changing the existing private repository's `README.md` to a public template should happen only in an explicit publication branch after private documents are separated; the canonical private README stays useful to development.

**No changes to GitHub repository visibility, name, public README, public topics, or license permissions have been made.**

## Executed cleanup handoff (2026-11-14)

- Obsolete C2 PR #13 has been closed as superseded; no branches have been deleted directly by this connection.
- Draft [PR #58](https://github.com/Tejasdmanjeshwar/Trilok/pull/58) removes the old C3.5 Primate/Bear runtime shape generators, HTML controls, unit/E2E tests and stale documentation, while retaining human MakeHuman face/body, C1 generic archetype support and C7 plans. The branch is based on C3.6 PR #56 and must not merge before #56 is accepted. Cloudflare reports build success; fast Verify had zero executed steps because of private Actions limits.
- `scripts/cleanup-merged-branches.mjs` and the manually dispatched `.github/workflows/retire-verified-branches.yml` implement **dry-run-by-default**, SHA-verified candidate pruning: 47 merged PR branch tips plus six specifically superseded/rejected PR branches and one SHA-pinned standalone C2.4 branch (if rejected/superseded flag selected). The task cannot run before this workflow merges into `main` and GitHub Actions runner capacity is available. Set repository Settings → General → Automatically delete head branches for ongoing maintenance after the one-time prune.
- PR #57's root README is a minimal factual rights notice; detailed README is archived as an engineering reference under `docs/development/` (not private when public).
