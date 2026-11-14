import {describe, expect, it} from "vitest";
import {existsSync, readFileSync} from "node:fs";
import {createAnatomyPreset} from "../packages/character-core/src/presets";
import {createHumanHeadRecipe, validateHumanHeadRecipe} from "../packages/character-core/src/morphology-head";

const read=(file:string)=>readFileSync(file,"utf8");

describe("C3 legacy species retirement while retaining C7 extensibility",()=>{
  it("retains generic C1 archetype descriptor support for later C7",()=>{
    const human=createAnatomyPreset({archetype:"human"});
    const vanara=createAnatomyPreset({archetype:"vanara"});
    const bear=createAnatomyPreset({archetype:"animal_head",animalHeadKind:"bear"});
    expect(human.topologyFamilyId).toBe("humanoid_biped_v1");
    expect(vanara.topologyFamilyId).toBe(human.topologyFamilyId);
    expect(bear.headTopologyFamilyId).toBe("head_bear_v1");
    expect(validateHumanHeadRecipe(createHumanHeadRecipe())).toBeDefined();
  });
  it("does not ship rejected species morphing or externally derived geometry",()=>{
    for(const path of [
      "apps/web/src/characters/geometry/MammalianHeadDeformation.ts",
      "apps/web/src/characters/geometry/MammalianFaceAnatomy.ts",
      "packages/character-core/src/morphology-mammalian.ts",
      "apps/web/src/characters/geometry/LicensedVanaraFaceAtlas.ts",
      "apps/web/src/characters/geometry/VanaraHeadReplacement.ts",
      "apps/web/src/characters/geometry/VanaraScanRegistration.ts",
    ]) expect(existsSync(path),path).toBe(false);
    expect(read("apps/web/c2-lab.html")).not.toMatch(/Primate \/ Vanara|C3\.5 mammalian heads/);
    expect(read("apps/web/src/characters/lab/c2-lab.ts")).not.toMatch(
      /createMammalianHeadRecipe|MammalianHeadDeformation|head-family/);
    expect(read("apps/web/src/characters/geometry/HumanMorphology.ts")).not.toMatch(
      /MAMMAL_HEAD_GENERATORS|MammalianHeadDeformation/);
  });
  it("keeps MakeHuman human face and body source integration",()=>{
    expect(read("apps/web/src/characters/lab/c2-lab.ts")).toMatch(/MakeHumanBodyController/);
    expect(read("apps/web/src/characters/lab/c2-lab.ts")).toMatch(/MakeHumanFacialController/);
    expect(read("apps/web/c2-lab.html")).toMatch(/c36-body-controls/);
    expect(read("apps/web/c2-lab.html")).toMatch(/c35-facial-controls/);
  });
});
