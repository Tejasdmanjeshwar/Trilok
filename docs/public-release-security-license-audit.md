# Trilok — security, intellectual-property, and public-repository readiness audit

**Status: NOT CLEARED FOR PUBLICATION.** This is an advisory review of the current GitHub repository, not permission to change visibility or a license grant. 
**Audit date:** 2026-11-14. **Reference main:** `9ef46d99011cff7dcfcc8d50b429f912a76b97a1`. **Open development:** draft C3.6 PR #56; keep it separate from publication decisions.

## Decision

**Owner decision: retain the existing GitHub repository and make it public after the cleanup/security gate.** For predictable low-volume CI, retain fast Verify on subphase PRs and full desktop/touch Chromium only at manually dispatched C0–C9 Phase Acceptance. When included private Actions compute is exhausted, consider a capped paid usage allowance or separately funded self-hosted runner before publishing proprietary intellectual property solely to obtain free CI minutes.

The owner explicitly accepts the risk of historical PR records and downloaded copies and chose an **in-place change of this existing repository**, not a separate public mirror. Do not change visibility until the audited current code, rights notices and root README are finalized; source code, other refs, GitHub review records and history will be accessible after the change.

## Evidence from repository inspection

| Area | Observed | Publication assessment |
| --- | --- | --- |
| Visibility and state | Private repository; unprotected `main` at the audited SHA; 58 branches currently observed after cleanup review branches | **NO-GO** on in-place visibility change before full refs/history review |
| Licensing of Trilok-owned code | No top-level `LICENSE`; workspace packages use `"private": true`; no general third-party redistribution license is granted | Owner must decide proprietary/source-available versus intentional open-source terms; do not add MIT/Apache/GPL by assumption |
| MakeHuman bundled assets | Pinned `assets/makehuman-core.json`, `assets/makehuman-facial-v1.json`; C3.6 body manifest on PR #56; CC0 provenance and immutable source blob hashes | CC0 data can be used commercially. Keep asset provenance separate from ownership of Trilok TS code |
| MakeHuman application | MakeHuman's app logic is AGPL; repository's import/build scripts describe obtaining CC0 *data*, not executing application Python | Do not copy AGPL program logic or non-CC0 third-party asset packages without a separate rights review |
| Rejected source-derived art | Branch `feature/c3-5-licensed-hanuman-face-atlas` contains `LicensedVanaraFaceAtlas.ts`, a data-derived adaptation of iRahulRajput's CC BY 4.0 GLB, with attribution | **NO-GO** for a blanket proprietary license over that historical branch; do not include its atlas in a proprietary public snapshot without maintaining its CC BY rights and attribution |
| Restricted art reference | Rejected `feature/c3-5-hanuman-face-reference-reconstruction` documents a Vedic Futura Hanuman STL under CC BY-NC-ND 4.0 | Reference-only, not cleared for commercial adaptation or redistribution; do not publish supplied original model or geometry derivatives |
| Committed binary assets | No `.glb`, `.stl`, `.ply`, `.zip` archives found in audited **main** tree or the specifically inspected rejected branch tips | This is **not** proof that earlier commits, deleted refs, artifacts, uploads or attachments never contained such files |
| Runtime and CI secrets | Targeted pattern checks of current root config, build scripts, workflows and selected browser/character modules found no obvious inline credential patterns | **Incomplete**. All-refs, all-history, workflow logs, artifacts, PR discussions, cloud settings and broad secret scanner checks are mandatory before publication |
| JavaScript packages | Workspace depends on Three.js and dev tooling including Vite, Vitest, Playwright, Wrangler, TypeScript. Three.js and Vite are MIT; Wrangler MIT/Apache-2.0; validate exact versions and full transitive dependency tree | Generate a lockfile, SBOM/license inventory and distribution notices; do not assume every transitive dependency is MIT |
| CI | `docs/ci-phase-acceptance.md` correctly reserves Chromium for manual phase acceptance; draft PR #56 removes accidental subphase Chromium workflows | Keep the phase budget policy, independently of publication choice |
| Copyright | Absence of an explicit license does not release Trilok-owned work into the public domain; copyright, authorship, and third-party exceptions still need confirmation | A license cannot undo public access or retroactively make CC0/CC BY third-party material exclusive |

## Before any public visibility change — blocking gates

1. **Owner's IP decision (blocking).** Is all of Trilok's TypeScript framework intended to be freely reusable? If not, preserve it privately, or deliberately publish selected code with a lawyer-reviewed *proprietary source-available license*. Do **not** paste an off-the-shelf MIT/Apache license on the complete repository if independent commercial reuse is not intended. A GitHub-public repository is public to read and fork under GitHub's terms even without an open-source license; visibility alone does not grant blanket redistribution rights.
2. **Review all Git objects and online metadata (blocking).** Scan every branch, tag, reachable commit, PR diff, issue/PR attachment, Actions artifact and Actions log. Specifically review the rejected atlas and reference branches. Removing a branch does not guarantee previously copied data, PR diffs, history or cached copies disappear. Strongly prefer a new publication repository with a new initial commit containing only audited files.
3. **Secrets and private data (blocking).** Run full-history secret scanning with Gitleaks/TruffleHog and GitHub's available security scanning; manually inspect all alerts and provider dashboards. Review GitHub, Cloudflare and third-party credentials, service bindings, deployment URLs and build logs. Revoke/rotate any real exposed secret *before* publishing, rather than assuming rewriting history makes it safe. Preserve `.env` and `.dev.vars` files outside Git.
4. **Third-party assets (blocking).** Create a release-specific asset rights manifest with creator, immutable original URL and revision, per-file rights, permitted uses, attribution, transformations and SHA-256. Exclude any unverified CC BY-NC-ND/NC media and licensed GLB-derived atlas from a proprietary public snapshot. Separate bundled original MakeHuman CC0 data from Trilok-owned procedural code and artwork.
5. **Ownership and dependency hygiene (blocking).** Confirm permission from every human contributor/rightsholder, audit reused code snippets and external media, generate dependency lockfile and transitive SBOM, review direct and transitive licenses for redistribution and include required `THIRD_PARTY_NOTICES`. Record brand/trademark and commercial-content policy separately from code license. Obtain qualified legal review of license wording and contributor ownership before publication.
6. **Technical publication gate.** Freeze a specific internal candidate SHA; copy only approved paths to an *independent, fresh-history* public repo. Exclude private artwork, unpublished branches, account metadata, operational notes and any secrets. Inspect the actual public tree, dependency licenses, CI logs, and `build-info.json`. Configure least-privilege GitHub Actions/Cloudflare credentials and push protection. Keep the canonical private repo and deployment authoritative until the public snapshot is specifically accepted.
7. **Owner sign-off.** Obtain explicit approval for the precise content and license of the public snapshot. Do not automatically synchronize arbitrary private commits, flip the existing repository's visibility, or merge experimental third-party licensed branches.

## License choices and their consequences

- **Preferred for a proprietary commercial Trilok:** keep the full original code privately, with an accurate copyright/rights notice and third-party provenance. No public distribution or broad third-party license is required for private development.
- **If intentionally publishing source for free CI but not open-sourcing it:** use a **new, sanitized public repository** with an explicit proprietary/source-available permission notice drafted for the actual owner and intended allowed uses. Users will still be able to view and fork public GitHub code. Restrictions are legal rights, not technical copy prevention. Do not claim the included MakeHuman CC0 data is exclusively owned by Trilok.
- **If deliberately making the reusable engine open source:** consider Apache-2.0 (express patent grant) or MIT (simple permissive licensing) *for Trilok-owned code only*, with separate CC0/CC BY third-party notices. These permanently allow independent commercial use under the license terms; later privatizing does not revoke prior rights. Proprietary campaign art and unpublished systems can remain in the private repository.

**Alternatives:** Pay for capped extra private Actions usage or use a trusted self-hosted runner. Free public GitHub Actions compute is not worth an accidental permanent source/history disclosure.

## Verification status

This is an **initial connected-GitHub metadata audit and targeted current-file inspection**; it is not an exhaustive scan of all history or hosted secrets, not a full dependency SBOM, and not legal certification. No API keys are printed here. The current public-release decision is **NO-GO** until the blocking gates above are demonstrably complete.

References: [GitHub visibility consequences](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility), [GitHub licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository), [MakeHuman license](https://www.makehumancommunity.org/about/license.html), [CI policy](ci-phase-acceptance.md).


## Owner-approved low-profile public-facing presentation (2026-11-14)

The owner is comfortable with the fact that public disclosure cannot be reversed and wants a **plain, non-promotional** public repository for free standard GitHub Actions, while retaining exclusive commercial control over the Trilok code.

- Detailed engineering README is retained at `docs/development/README.internal.md`; public root `README.md` is deliberately minimal. **Engineering docs within a public repo remain public**, even with 'internal' in the file path. Never put secret or truly restricted documentation in this repository. The owner accepts that public disclosure may be permanent.
- The public root `README.md` should be a short factual statement with no screenshots, badges, elaborate gameplay descriptions, roadmap, community invitations, marketing language, external contact links, or unnecessary promotional visuals. An approved **template** is in `docs/publication/README.public-template.md`; it is not yet a live root README.
- Accurate public identity and rights information must remain: proprietary source code, no open-source permission, attribution to CC0/other third-party licensors in dedicated notices, and a statement that contributions/support are not solicited. Do not use misleading claims of abandonment, nonfunctionality, or false security through obscurity.
- Avoid search discoverability aids such as unnecessary topics, marketing description, social links and showcase pages; do not claim this makes Git objects undiscoverable or prevents cloning, indexing, automated harvesting or forks.
- No secret/private architecture belongs in public Git objects, including previous commits, branch references, PR patches, Actions logs or downloadable artifacts. **A new public repo created with only approved files and fresh history** avoids copying old rejected refs; merely simplifying `README.md` in the existing repo does not.
- **CI correctness caveat:** If the separate public repository is only a sanitized subset, its green checks do not certify all private canonical source code. To use public Actions to certify Trilok, the public CI source snapshot must include the actual testable source/dependencies at a matching content identity and report exact SHA/content manifest; private-only dependencies cannot silently be left out. The Cloudflare release SHA is verified independently.
- Changing the existing private repository's `README.md` to a public template should happen only in an explicit publication branch after private documents are separated; the canonical private README stays useful to development.

**No changes to GitHub repository visibility, name, public README, public topics, or license permissions have been made.**


## Implementation update — commercial rights and attribution (2026-11-14)

This branch now includes a reviewable, **proprietary rights reservation** in root `LICENSE`, with explicit third-party exclusion and no open-source license grant. `THIRD_PARTY_NOTICES.md` records upstream MakeHuman CC0 source data, a separate AGPL application-code boundary, Three.js MIT and directly declared build/development dependency license sources. Vite now emits `/THIRD_PARTY_NOTICES.txt` in its browser distribution, and `tests/legal-release-rights.test.ts` asserts the important contract. The minimal public landing template is preserved separately from the current full internal `README.md`.

**Limits:** © legal ownership and contributor grants need confirmation; exact lockfile-based third-party notices and complete transitive SBOM are not yet available; not every notice or source-map/bundled dependency is verified. These rights files do not change repository visibility, reverse existing public disclosures, certify MakeHuman AGPL independence at the code-expression level, or replace counsel review. No public snapshot or Cloudflare deploy was created.

## Owner public-repository decision and current preparations

The owner chose **existing repo → clean up → public**; do not create a separate public mirror. Draft PR #57 stages proprietary rights and third-party notices, minimal root README, engineering README archive and manually gated SHA-verifying branch retirement. Draft PR #58 stages rejected species preview retirement on top of C3.6 PR #56. Old PR #13 is closed. A successful Cloudflare build of #58 is not full typecheck/unit/replay certification; private Actions fast Verify still fails to get a runner. Full-history secret/artifact scanning and transitive dependency SBOM remain publication blockers. No visibility change has been made.
