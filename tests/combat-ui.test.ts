import { describe, expect, it } from "vitest";
import { DEFAULT_COMBAT_CATALOG } from "../packages/combat/src/index";
import { describeCombatMove } from "../apps/web/src/ui/CombatCommandDeck";
import { PREVIEW_CATALOG } from "../apps/web/src/combat/preview-encounter";

describe("medieval combat command deck view data",()=>{
  it("reuses authored catalog moves instead of inventing action rules",()=>{
    for(const id of PREVIEW_CATALOG.equipment.bow!.attackMoveIds){
      const view=describeCombatMove(id,PREVIEW_CATALOG);
      expect(view?.label.length).toBeGreaterThan(3);
      expect(view?.glyph.length).toBeGreaterThan(0);
      expect(PREVIEW_CATALOG.attacks[id]?.resourceCost).toBeGreaterThanOrEqual(0);
    }
  });
  it("labels different action families without embedding combat cost formulas",()=>{
    expect(describeCombatMove("arrow",PREVIEW_CATALOG)).toMatchObject({
      label:"Precision Arrow",category:"projectile",
    });
    expect(describeCombatMove("heavy_crush",PREVIEW_CATALOG)?.category).toBe("heavy");
    expect(describeCombatMove("recover_shot",PREVIEW_CATALOG)?.category).toBe("recovery");
    expect(describeCombatMove("slash",PREVIEW_CATALOG)?.category).toBe("blade");
  });
  it("falls back to a generic move card for authored future expansions",()=>{
    const data=describeCombatMove("rakshasa_arrow",PREVIEW_CATALOG);
    expect(data).toMatchObject({label:"RAKSHASA ARROW",glyph:"✦"});
    expect(describeCombatMove("unknown_move",DEFAULT_COMBAT_CATALOG)).toBeNull();
  });
});
