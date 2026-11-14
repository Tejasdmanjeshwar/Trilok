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
  it("reserves Chromium and Playwright to manually dispatched phase acceptance",()=>{
    expect(paths).toContain("phase-acceptance.yml");
    for(const path of paths){
      const source=readFileSync(join(dir,path),"utf8");
      if(path==="phase-acceptance.yml"){
        expect(source).toMatch(/workflow_dispatch:/);
        expect(source).not.toMatch(/^  pull_request:/m);
        expect(source).not.toMatch(/^  push:/m);
        expect(source).toMatch(/pnpm test:e2e/);
        expect(source).toMatch(/playwright install/);
        continue;
      }
      expect(source, `${path} must not install or execute browsers during subphases`)
        .not.toMatch(/playwright\s+(install|test)|pnpm\s+(test:e2e|exec\s+playwright)|chromium/i);
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
