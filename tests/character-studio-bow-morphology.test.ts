import {describe,it} from "vitest";
import {bowMorphologyVariants,checkBowMorphology} from
  "./helpers/studio-bow-morphology-assertions";

// Same five source-skin cases and acceptance assertions as before;
// isolated across workers to avoid Vitest's 60-second worker RPC timeout.
describe("C5.4 source-skinned bow morphology and fallback",()=>{
  it.each(bowMorphologyVariants.slice(0,2))(
    "preserves deterministic finite contact on $name source",
    checkBowMorphology,180_000);
});
