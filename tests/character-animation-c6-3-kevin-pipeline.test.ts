import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import catalog from "../assets/animations/sources/kevin-basic-motions-v1.json";
describe("C6.3 Kevin build-time integration",()=>{
  it("pins the original source family and first three canonical selections",()=>{
    expect(catalog.archiveSha256).toBe(
      "063d5e1822f85549d14035ef342b1feae45bac37962499a8b478c7eb997200cd");
    expect(catalog.expectedMaleClipCount).toBe(58);
    expect(catalog.clips.map(c=>c.id)).toEqual([
      "human-kevin-idle","human-kevin-walk","human-kevin-run",
    ]);
  });
  it("removes player ZIP inputs, experimental query switches and runtime FBX loaders",()=>{
    const viewport=readFileSync("apps/web/src/studio/StudioViewport.ts","utf8");
    const main=readFileSync("apps/web/src/studio/main.ts","utf8");
    const library=readFileSync("apps/web/src/studio/StudioAnimationLibrary.ts","utf8");
    expect(viewport).not.toMatch(/importKevinArchive|KevinLocalRetarget|localKevinFile/);
    expect(main).not.toMatch(/studio-kevin-file|c63-kevin-local-review|\.zip/);
    expect(library).toContain("kevinCatalog.clips");
    expect(library).toContain("import.meta.glob");
    expect(library).not.toMatch(/FBXLoader|DecompressionStream|importOwnedKevinZip/);
  });
});
