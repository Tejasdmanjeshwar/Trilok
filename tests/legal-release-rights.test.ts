import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

const read=(path:string)=>readFileSync(path,"utf8");

describe("Trilok commercial rights and third-party notices",()=>{
  it("reserves Trilok-original copyright without relabeling CC0 MakeHuman assets",()=>{
    const license=read("LICENSE");
    expect(license).toMatch(/All rights reserved/i);
    expect(license).toMatch(/NOT AN OPEN-SOURCE LICENSE/);
    expect(license).toMatch(/THIRD-PARTY MATERIALS ARE EXCLUDED/);
    expect(license).toMatch(/GitHub|hosting platform/i);
    const notices=read("THIRD_PARTY_NOTICES.md");
    const manifest=JSON.parse(read("assets/makehuman-core.json")) as {
      revision:string;license:string;gitBlobSha1:string
    };
    expect(manifest.license).toBe("CC0-1.0");
    expect(notices).toContain(manifest.revision);
    expect(notices).toContain("CC0");
    expect(notices).toContain("AGPL");
    expect(notices).toContain("Three.js");
    expect(notices).toContain("MIT");
  });
  it("ships the attribution notice alongside the runtime build identity",()=>{
    const config=read("apps/web/vite.config.mjs");
    expect(config).toMatch(/THIRD_PARTY_NOTICES\.md/);
    expect(config).toMatch(/fileName:\s*"THIRD_PARTY_NOTICES\.txt"/);
    expect(config).toMatch(/fileName:\s*"build-info\.json"/);
  });
  it("keeps detailed private guidance distinct from minimal public landing",()=>{
    const template=read("docs/publication/README.public-template.md");
    expect(template).toMatch(/proprietary/i);
    expect(template).toMatch(/third-party/i);
    expect(template).not.toMatch(/https?:\/\//);
    const internal=read("docs/development/README.internal.md");
    expect(internal).toMatch(/Character Studio/);
    expect(template.length).toBeLessThan(internal.length);
    expect(read("package.json")).toContain('"private": true');
  });
});
