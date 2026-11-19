import {describe,expect,it} from "vitest";
import {readdirSync,readFileSync} from "node:fs";
import {join} from "node:path";

/**
 * Full desktop/touch Chromium belongs to manually dispatched C0-C9 phase acceptance.
 * An accidental PR-triggered browser workflow consumes the owner's limited
 * GitHub-hosted runner allowance on every C3 subphase commit.
 */
describe("Trilok CI budget and phase acceptance policy",()=>{
  const dir=".github/workflows";
  const paths=readdirSync(dir).filter(name=>/\.ya?ml$/.test(name));
  it("keeps the retired C2 Lab out of production while preserving full diagnostic E2E",()=>{
    const vite=readFileSync("apps/web/vite.config.mjs","utf8");
    const acceptance=readFileSync(join(dir,"phase-acceptance.yml"),"utf8");
    const verify=readFileSync(join(dir,"ci.yml"),"utf8");
    expect(vite).not.toContain("c2Lab:");
    expect(vite).not.toContain("TRILOK_INCLUDE_LAB");
    expect(acceptance).not.toContain("TRILOK_INCLUDE_LAB");
    expect(verify).toContain("test ! -e apps/web/dist/c2-lab.html");
    expect(verify).not.toContain("TRILOK_INCLUDE_LAB");
  });
  it("requires a committed cleanup report for C6+ acceptance without invalidating historical phases",()=>{
    const acceptance=readFileSync(join(dir,"phase-acceptance.yml"),"utf8");
    const policy=readFileSync("docs/phase-closeout-cleanup-policy.md","utf8");
    expect(acceptance).toContain("cleanup_report:");
    expect(acceptance).toContain('if [[ "$PHASE" =~ ^C[6-9]$ ]]');
    expect(acceptance).toContain('grep -Fxq "Phase: $PHASE" "$REPORT"');
    expect(acceptance).toContain('[[ ! -f "$REPORT" ]]');
    expect(policy).toContain("end of each major Character Studio phase");
    expect(policy).toContain("Do not weaken, delete or skip regression tests");
  });
  it("reserves Chromium and Playwright to explicitly manual scoped workflows",()=>{
    expect(paths).toContain("phase-acceptance.yml");
    for(const path of paths){
      const source=readFileSync(join(dir,path),"utf8");
      if(path==="phase-acceptance.yml"){
        expect(source).toMatch(/workflow_dispatch:/);
        expect(source).not.toMatch(/^  pull_request:/m);
        expect(source).not.toMatch(/^  push:/m);
        expect(source).toMatch(/pnpm test:e2e/);
        expect(source).toMatch(/playwright install/);
        // Phase-only browser coverage is split by viewport, never skipped.
        expect(source).toMatch(/needs:\s*acceptance/);
        expect(source).toMatch(/fail-fast:\s*false/);
        expect(source).toMatch(/project:\s*\[desktop-chromium,\s*touch-chromium\]/);
        expect(source).toMatch(/pnpm test:e2e --project="\$PROJECT"/);
        expect(source).toMatch(/phase-\$\{\{ inputs.phase \}\}-\$\{\{ matrix.project \}\}-evidence/);
        continue;
      }
      if(path==="studio-interaction-diagnostics.yml"){
        expect(source).toMatch(/workflow_dispatch:/);
        expect(source).not.toMatch(/^  pull_request:/m);
        expect(source).not.toMatch(/^  push:/m);
        expect(source).toMatch(/e2e\/studio-inspection\.spec\.ts/);
        expect(source).toMatch(/--retries=0 --workers=1/);
        expect(source).toMatch(/--repeat-each/);
        expect(source).toMatch(/project:\s*\[desktop-chromium,\s*touch-chromium\]/);
        expect(source).not.toMatch(/pnpm test:e2e/);
        continue;
      }
      expect(source, `${path} must not install or execute browsers during subphases`)
        .not.toMatch(/playwright\s+(install|test)|pnpm\s+(test:e2e|exec\s+playwright)|chromium/i);
    }
  });
  it("reuses only pinned MakeHuman assets across gated acceptance jobs",()=>{
    const verify=readFileSync(join(dir,"ci.yml"),"utf8");
    const acceptance=readFileSync(join(dir,"phase-acceptance.yml"),"utf8");
    expect(verify.split("uses: actions/cache@v4")).toHaveLength(2);
    expect(acceptance.split("uses: actions/cache@v4")).toHaveLength(3);
    for(const source of [verify,acceptance]){
      expect(source).toContain("assets/cache/makehuman-body-v1.json");
      expect(source).toContain("scripts/fetch-pinned-source.mjs");
      expect(source).toMatch(/pnpm test/);
      expect(source).toMatch(/pnpm build/);
    }
  });
  it("does not schedule retired historical branch pruning or redundant source benchmarks",()=>{
    expect(paths).not.toContain("retire-verified-branches.yml");
    expect(paths).not.toContain("studio-source-classification-compare.yml");
    // Source contact benchmarks are preserved and can run via the existing
    // bench:studio script without duplicate PR-triggered baseline checkouts.
    const manifest=readFileSync("package.json","utf8");
    expect(manifest).toContain("bench:studio");
    expect(readFileSync(join(dir,"studio-solver-benchmark.yml"),"utf8"))
      .toMatch(/workflow_dispatch:/);
  });
  it("runs expensive C5 paired solver comparisons only by explicit SHA-pinned request",()=>{
    const workflow=readFileSync(join(dir,"c55-controlled-solver-comparison.yml"),"utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("  pull_request:");
    expect(workflow).toContain("baseline_sha:");
    expect(workflow).toContain("candidate_sha:");
    expect(workflow).toContain('[[ "$BASELINE_SHA" =~ ^[0-9a-f]{40}$ ]]');
    expect(workflow).toContain('[[ "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]]');
  });
  it("uses committed and frozen pnpm dependency resolutions in all workflows",()=>{
    const manifest=readFileSync("package.json","utf8");
    const lock=readFileSync("pnpm-lock.yaml","utf8");
    expect(manifest).toContain('"packageManager": "pnpm@10.20.0"');
    expect(lock).toMatch(/^lockfileVersion: '9\.0'/);
    expect(lock).toContain("importers:");
    expect(lock).toContain("packages:");
    for(const path of paths){
      const source=readFileSync(join(dir,path),"utf8");
      if(source.includes("pnpm install")){
        expect(source,`${path} must use committed resolutions`).toContain("pnpm install --frozen-lockfile");
        expect(source).not.toContain("pnpm install --no-frozen-lockfile");
      }
    }
  });
  it("only manually deploys a verified SHA to the development-only Netlify preview",()=>{
    const ci=readFileSync(join(dir,"ci.yml"),"utf8");
    const preview=readFileSync(join(dir,"netlify-development-preview.yml"),"utf8");
    expect(ci).toContain("pnpm build");
    expect(ci).toContain("node scripts/verify-build-identity.mjs");
    expect(ci).toContain("verify-static-release.mjs");
    expect(ci).toContain("trilok-static-");
    expect(ci).toContain("actions/upload-artifact@v4");
    expect(preview).toMatch(/^  workflow_dispatch:/m);
    expect(preview).not.toMatch(/^  push:/m);
    expect(preview).not.toMatch(/^  pull_request:/m);
    expect(preview).toContain("if: github.ref == 'refs/heads/main'");
    expect(preview).toContain("environment: trilok-netlify-preview");
    expect(preview).toContain("PREVIEW_PR_NUMBER: ${{ inputs.pull_request }}");
    expect(preview).toContain("scripts/resolve-netlify-preview.mjs");
    expect(preview).toContain("actions/workflows/ci.yml/runs?event=pull_request");
    expect(preview).toContain("APPROVED_PR_NUMBER");
    expect(preview).toContain('latest" != "$APPROVED_SOURCE_SHA"');
    expect(preview).not.toContain("inputs.source_sha");
    expect(preview).not.toContain("inputs.verify_run_id");
    expect(preview).toContain("trilok-static-$APPROVED_CHECKOUT_SHA");
    expect(preview).toContain("APPROVED_SOURCE_SHA");
    expect(preview).toContain("APPROVED_CHECKOUT_SHA");
    expect(preview).toContain("--no-build");
    expect(preview).toContain("netlify-cli@27.10.1");
    expect(preview).toContain('--filter "@trilok/web"');
    expect(preview).toContain("verify-static-release.mjs");
    expect(preview).toContain('build.commitSha!==process.env.APPROVED_CHECKOUT_SHA');
    expect(preview).not.toMatch(/--prod(?:\\s|$)/m);
    expect(preview).not.toContain("wrangler deploy");
    expect(preview).not.toContain("pnpm build");
  });
  it("keeps fast Verify on PRs and main without browser setup",()=>{
    const ci=readFileSync(join(dir,"ci.yml"),"utf8");
    expect(ci).toMatch(/pull_request:/);
    expect(ci).toMatch(/branches:\s*\[main\]/);
    expect(ci).toMatch(/pnpm typecheck/);
    expect(ci).toMatch(/pnpm test/);
    expect(ci).toMatch(/pnpm build/);
    expect(ci).not.toMatch(/playwright|chromium/i);
  });
});
