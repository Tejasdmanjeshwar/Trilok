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
