import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {STUDIO_VIEWS,STUDIO_LIGHTS} from "../apps/web/src/studio/StudioPresentation";

describe("Character Studio foundation",()=>{
  it("uses finite camera positions with independent targets",()=>{
    for(const item of Object.values(STUDIO_VIEWS)){
      expect(item.label.length).toBeGreaterThan(0);
      expect([...item.position,...item.target].every(Number.isFinite)).toBe(true);
      expect(Math.hypot(...item.position.map((v,i)=>v-item.target[i]!))).toBeGreaterThan(.3);
    }
    expect(new Set(Object.values(STUDIO_VIEWS).map(v=>v.label)).size).toBe(4);
  });
  it("exposes purposeful, finite light profiles",()=>{
    expect(Object.keys(STUDIO_LIGHTS)).toEqual(["daylight","warm","dusk"]);
    for(const preset of Object.values(STUDIO_LIGHTS)){
      expect(preset.hemisphere).toBeGreaterThan(0);
      expect(preset.key).toBeGreaterThan(0);
      expect(preset.fill).toBeGreaterThan(0);
      expect(preset.rim).toBeGreaterThan(0);
    }
  });
  it("keeps player-visible copy free from internal milestones and debug labels",()=>{
    const html=readFileSync("apps/web/studio/index.html","utf8");
    const ui=readFileSync("apps/web/src/studio/main.ts","utf8");
    const copy=html+ui.slice(ui.indexOf("host.innerHTML="),ui.indexOf("const element="));
    expect(copy).not.toMatch(/\bC[0-9](?:\.[0-9]+)?\b|\b(?:debug|laboratory|commit|phase|issue|rig|skinning)\b/i);
    expect(copy).toContain("Character Studio");
    expect(copy).not.toMatch(/Save|Load character|Bake character/i);
  });
  it("keeps separate bundler entries for Studio, Lab and game",()=>{
    const config=readFileSync("apps/web/vite.config.mjs","utf8");
    expect(config).toContain('"./studio/index.html"');
    expect(config).toContain('"./c2-lab.html"');
    expect(config).toContain('"./index.html"');
    expect(readFileSync("apps/web/src/main.ts","utf8")).toContain('href="/studio/"');
    const source=readFileSync("apps/web/src/studio/StudioViewport.ts","utf8");
    const assembly=readFileSync("apps/web/src/studio/StudioHumanModel.ts","utf8");
    expect(assembly).toContain("loadAnatomicalHuman");
    expect(assembly).toContain("MakeHumanBodyController");
    expect(assembly).toContain("MakeHumanFacialController");
    expect(source).not.toContain("createContinuousHumanPrototype");
    expect(source).not.toContain("createAnimatedWarrior");
  });
});
