import type { CombatCatalog } from "@trilok/combat";

/** UI-only metadata; data-driven combat legality and Energy remain in the core. */
export interface CombatMoveView {
  readonly label: string;
  readonly glyph: string;
  readonly description: string;
  readonly category: "projectile" | "blade" | "heavy" | "recovery";
}
const moveViews: Readonly<Record<string, CombatMoveView>> = {
  arrow: {label:"Precision Arrow",glyph:"➶",description:"Free aim",category:"projectile"},
  recover_shot: {label:"Steady Shot",glyph:"✧",description:"Recover Energy",category:"recovery"},
  rapid_slash: {label:"Rapid Slash",glyph:"✦",description:"Free first action · once/turn",category:"blade"},
  slash: {label:"Quick Slash",glyph:"⚔",description:"Flowing strike",category:"blade"},
  heavy_crush: {label:"Heavy Crush",glyph:"◆",description:"Committed blow",category:"heavy"},
};

/** Pure view metadata; authored actions remain the authoritative rules. */
export function describeCombatMove(
  id: string, catalog: CombatCatalog,
): CombatMoveView | null {
  const spec = catalog.attacks[id];
  if (!spec) return null;
  return moveViews[id] ?? {
    label: id.replaceAll("_"," ").toUpperCase(),
    glyph: "✦",
    description: spec.delivery.replaceAll("_"," "),
    category: "blade",
  };
}

export interface CombatDeckSnapshot {
  readonly catalog: CombatCatalog;
  readonly equippedId: string;
  readonly equipmentIds: readonly string[];
  readonly legalMoveIds: readonly string[];
  readonly legalSwitchIds: readonly string[];
  readonly canDecide: boolean;
}
export interface DeckCallbacks {
  onMoveSelected(): void;
  onEquip(equipmentId: string): void;
}
function span(text: string, cls: string): HTMLSpanElement {
  const node=document.createElement("span");
  node.className=cls;
  node.textContent=text;
  return node;
}

/**
 * A small standalone DOM view for the combat command deck.
 * It owns selection, focus and visual controls only; all affordability and
 * legal actions are supplied by the domain-backed adapter.
 */
export class CombatCommandDeck {
  private current = "";
  private snapshot: CombatDeckSnapshot | null = null;
  constructor(
    private readonly moveRoot: HTMLElement,
    private readonly equipmentRoot: HTMLElement,
    private readonly callbacks: DeckCallbacks,
  ) {
    moveRoot.addEventListener("click", this.onMoveClick);
    equipmentRoot.addEventListener("click", this.onEquipClick);
  }
  get selectedMoveId(): string { return this.current; }
  get selectedView(): CombatMoveView | undefined { return moveViews[this.current]; }

  private readonly onMoveClick=(event: MouseEvent): void=>{
    const element=(event.target as Element).closest<HTMLButtonElement>("[data-combat-move]");
    if (!element || element.disabled || !this.moveRoot.contains(element)) return;
    const id=element.dataset.combatMove;
    if(!id || !this.snapshot?.legalMoveIds.includes(id)) return;
    this.current=id;
    this.render();
    this.callbacks.onMoveSelected();
  };
  private readonly onEquipClick=(event: MouseEvent): void=>{
    const element=(event.target as Element).closest<HTMLButtonElement>("[data-combat-equip]");
    if (!element || element.disabled || !this.equipmentRoot.contains(element)) return;
    const id=element.dataset.combatEquip;
    if(id && this.snapshot?.legalSwitchIds.includes(id)) this.callbacks.onEquip(id);
  };
  cycle(direction: -1 | 1): boolean {
    if (!this.snapshot?.canDecide) return false;
    const options=this.snapshot.legalMoveIds;
    if(options.length < 2) return false;
    const index=options.indexOf(this.current);
    this.current=options[(index+direction+options.length)%options.length]!;
    this.render();
    this.callbacks.onMoveSelected();
    return true;
  }
  update(snapshot: CombatDeckSnapshot): void {
    this.snapshot=snapshot;
    const ids=snapshot.catalog.equipment[snapshot.equippedId]?.attackMoveIds ?? [];
    const legal=snapshot.legalMoveIds;
    if(!legal.includes(this.current)) this.current=legal[0] ?? ids[0] ?? "";
    this.render();
  }
  private render(): void {
    const v=this.snapshot;
    if(!v)return;
    const equipment=v.catalog.equipment[v.equippedId];
    const fragment=document.createDocumentFragment();
    for(const [i,id] of (equipment?.attackMoveIds ?? []).entries()){
      const spec=v.catalog.attacks[id];
      if(!spec)continue;
      const meta=describeCombatMove(id,v.catalog)!;
      const legal=v.canDecide && v.legalMoveIds.includes(id);
      const chosen=id===this.current;
      const button=document.createElement("button");
      button.type="button";
      button.className="move-card move-"+meta.category+(chosen?" is-selected":"");
      button.dataset.combatMove=id;
      button.disabled=!legal;
      button.setAttribute("aria-pressed",String(chosen));
      button.setAttribute("aria-label",meta.label+", "+spec.resourceCost+" Energy"+
        (spec.turnPolicy?.continuation==="continue"?", continues":"; ends turn"));
      button.append(
        span(meta.glyph,"move-glyph"),
        span(meta.label,"move-title"),
        span(meta.description,"move-subtitle"),
        span(spec.resourceCost===0?"FREE":spec.resourceCost+" EN","move-cost"),
        span(String(i+1),"move-index"),
      );
      fragment.append(button);
    }
    this.moveRoot.replaceChildren(fragment);
    const weapons=document.createDocumentFragment();
    for(const id of v.equipmentIds){
      const weapon=v.catalog.equipment[id];
      if(!weapon)continue;
      const current=id===v.equippedId;
      const button=document.createElement("button");
      button.type="button";
      button.className="weapon-tile"+(current?" is-equipped":"");
      button.dataset.combatEquip=id;
      button.disabled=!current && (!v.canDecide || !v.legalSwitchIds.includes(id));
      button.setAttribute("aria-pressed",String(current));
      button.append(
        span(/bow/i.test(id)?"➶":"⚔","weapon-glyph"),
        span(weapon.label,"weapon-name"),
        span(current?"EQUIPPED":"FREE · 1/TURN","weapon-cost"),
      );
      weapons.append(button);
    }
    this.equipmentRoot.replaceChildren(weapons);
  }
  dispose(): void {
    this.moveRoot.removeEventListener("click",this.onMoveClick);
    this.equipmentRoot.removeEventListener("click",this.onEquipClick);
    this.moveRoot.replaceChildren();
    this.equipmentRoot.replaceChildren();
  }
}
