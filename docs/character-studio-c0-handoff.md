# C0 new-session handoff — Trilok browser-native Character Studio

Copy the following prompt into a new ChatGPT session. It is intentionally scoped to **C0**, not a request to implement all of C0–C9 in one change.

---

You are continuing implementation of **Trilok**, repository **Tejasdmanjeshwar/Trilok**, default branch **main**. The connected GitHub tools are available; inspect and modify the repository directly. This is an implementation task with a scoped audit/specification deliverable, not a generic brainstorming conversation. Do not ask me to edit files manually.

## Read-first references

- **docs/character-studio-roadmap.md** — authoritative browser-native C0–C9 character-system roadmap.
- **docs/architecture.md** — existing architecture conventions.
- **docs/build-verification.md** — GitHub/Cloudflare build identity verification.
- **docs/combat-v0.4D14-boss-phases.md** — D14 behavior to preserve.
- **README.md** and **.github/workflows/ci.yml**.

The prior verified handoff was main SHA **db8348bd296a412262781d20a9f444fea474c692**, playable **0.4.0-preview.19**, combat **0.4-D14**. **Do not assume this is still HEAD**; inspect latest repository state before creating a branch. The roadmap may have been committed after this baseline.

The playable URL is https://trilok.tejasdmjr996.workers.dev/. Do **not** assume the deployed Cloudflare build matches the latest GitHub SHA; compare against /build-info.json when accessible.

## Non-negotiable product constraints

We are implementing our **own Character Studio inside the existing Trilok Three.js/TypeScript web application**, eventually accessible as a lazy-loaded **/studio** route/tab. **No Blender, Maya, outside character editor or manual sculpting by the user.** A curated/permissively licensed anatomical topology asset may be **bundled inside the app** after validating redistribution rights, file format, size and technical suitability. External services or character-creation platforms are not part of the workflow.

Target high-quality stylized RPG characters with credible anatomy, seamless/skinned deformation, proper joints, valid skinning, body/face customization, combat-ready weapon grips, IK, future procedural animation, deterministic recipes, browser-native baking/export, and mobile/desktop performance. Do not claim AAA art quality without rendered visual validation.

Archetypes must include human, Rakshasa/orc-like, Vanara, **Jatayu as an avian-headed winged humanoid (not an entirely bird-bodied creature)**, and customizable animal/head + humanoid combinations. Future characters can have multiple arms, legs or heads. Define a canonical humanoid **semantic foundation** and modular anatomy extensions rather than fixed bone counts.

Characters can sustain **persistent surface wounds, disfigurement and actual dismemberment**. Plan for topology-aware severing boundaries, segmented anatomy, exposed cut caps, detached limbs carrying marks/arrows/equipment, and missing-limb capabilities. Keep pristine recipe, baked asset and runtime injury state separate. Start with prevalidated severing zones; arbitrary cutting of animated skinned geometry is not a first-phase requirement.

**Combat D1–D14 remains authoritative and unchanged.** Damage, timing, legal defense windows, ballistic/projectile logic, adaptive AI, timed attacks, embedded arrow identity, wound history, and three Rakshasa boss phases must not regress. The Studio must eventually use exactly the same runtime representation as combat. Use SOLID/DRY and strict TypeScript; do not put big generation code in apps/web/src/main.ts.

## Assignment: execute C0 now; do not begin full C1 implementation

1. Read the actual latest repository HEAD, relevant docs, packages and tests. Inspect in particular:
   - apps/web/src/actors/warrior.ts
   - apps/web/src/actors/AnimatedWarrior.ts
   - apps/web/src/combat/CombatHitVolumes.ts
   - apps/web/src/effects/ProjectileClashEffects.ts
   - apps/web/src/effects/SurfaceMarks.ts
   - apps/web/src/main.ts
   - apps/web/src/combat/sequences.ts
   - packages/choreography/src/index.ts
   - package.json, pnpm workspace, apps/web Vite config, e2e and CI.
2. Identify concrete current coupling, contracts, coordinate systems, hit-region names, wound anchoring, resource ownership, browser routing and tests. Distinguish proven facts from proposed design.
3. On a dedicated **feat/** branch, write the **C0 technical specification / ADR** into docs with:
   - axis/units/rest pose/bind pose/pose-space rules and a canonical skeletal naming/semantic convention;
   - humanoid anatomy graph with optional extra limbs, heads, tails and Jatayu wing bones;
   - stable anatomical/hit-region mapping, unique segment IDs, socket schema and equipment capability rules;
   - topology families, parameter bounds, deformation/skin-weight strategy and corrective shape approach;
   - an **actionable, no-manual-sculpt** starting human geometry plan; investigate existing CC0/compatible base mesh data and assess licensing/provenance before adding assets;
   - library feasibility matrix: Three.js native SkinnedMesh, GLTFExporter, humanoid-kit, three-mesh-bvh, glTF Transform, Manifold WASM, glTF Validator, plus alternatives if justified. Verify license, actual abilities, cost, maintenance and fit. **Do not install everything speculatively.**
   - prevalidated severable geometry and runtime injury state contracts, surface mark/arrow reattachment and detached segment lifecycle;
   - /studio architecture, worker/cancellation strategy, immutable editor state and undo/redo;
   - browser baking pipeline, versioned recipes/GLB + sidecar metadata, deterministic regeneration and round-trip validation;
   - explicit compatibility adapter boundaries from existing AnimatedWarrior/CombatHitVolumes/effects to the new rig;
   - provisional mobile/desktop performance budgets, memory cleanup policy, visual acceptance test poses, CI and risk register.
4. Choose the smallest practical **C1 implementation slice** with exact files/interfaces/test cases and acceptance conditions, keeping C1 implementation in a *separate later PR*. If a tiny pure proof-of-feasibility module is necessary in C0, only add it with focused tests and clear rationale; avoid premature mass framework creation.
5. Run appropriate available verification: pnpm typecheck, pnpm test (including 1,000 seeded replays), pnpm build, and pnpm test:e2e with Chromium where feasible. If you cannot execute local commands, inspect GitHub Actions check results and state plainly which tests ran, where, and which remain unverified. Do not invent green CI.
6. Open a PR for C0; only merge after required CI passes. Report final PR link, changed files, checks, merge SHA or why merge was deferred. Verify deployed build identity separately when possible; do not claim Cloudflare deployed merely from a merge.

## Quality gates

- C0 architecture must be implementable without external authoring applications or manual sculpting.
- The plan explicitly supports injuries/disfigurement/severing, winged humanoids and multi-arm anatomy without requiring immediate art-quality implementation.
- All candidate dependencies/assets have a decision, risk and legal provenance plan; no unverified CC0/production claims.
- D14 unchanged; simulation and visuals remain separated.
- C1 contracts are small, testable, backward-compatible and clearly sequenced.
- No false claims of visual quality, CI, release or deployment success.

**Begin with C0 repository inspection and concrete implementation. Do not ask for permission to begin; this handoff is authorization to perform the scoped C0 work.**
