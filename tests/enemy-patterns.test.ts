import {describe,expect,it} from "vitest";
import {validateCombatCatalog,type CombatCatalog} from "../packages/combat/src/index";
import {EncounterSession} from "../apps/web/src/combat/EncounterSession";
import {PREVIEW_CATALOG} from "../apps/web/src/combat/preview-encounter";
import {presentationForAttack} from "../apps/web/src/combat/attack-presentation";
import {SequencePlayer} from "../packages/choreography/src/index";
import type {CombatCue} from "../apps/web/src/combat/sequences";

const contact={actualRegionId:"head" as const,contact:true};
describe("D13 independently defendable enemy attack patterns",()=>{
  it("generates exactly the authored contact markers, no extra phantom attacks",()=>{
    for(const id of ["rakshasa_crosscut","rakshasa_deceiver","rakshasa_delayed_heavy"]){
      const move=PREVIEW_CATALOG.attacks[id]!;
      const cues=presentationForAttack(move).sequence.cues;
      const expected=move.hits?.map(h=>h.offsetTicks)??[move.impactOffsetTicks];
      expect(cues.filter(c=>c.type==="enemy_impact").map(c=>c.atMs)).toEqual(expected);
      expect(cues.at(-1)?.atMs).toBeGreaterThan(expected.at(-1)!);
    }
  });
  it("feint is visual-only and cannot cause early damage",()=>{
    const move=PREVIEW_CATALOG.attacks.rakshasa_deceiver!;
    const player=new SequencePlayer<CombatCue>();
    player.start(presentationForAttack(move).sequence,1000);
    const sample=player.advance(1920)!;
    expect(sample.cues.some(c=>c.type==="feint_flash")).toBe(true);
    expect(sample.cues.some(c=>c.type==="enemy_impact")).toBe(false);
    const session=new EncounterSession();
    session.end("hero");
    session.attack("enemy","hero",move.id,1.7,1000,"head");
    const originalHp=session.state.actors.hero!.hp;
    expect(session.resolveIfReady(1920,1.7,undefined,contact)).toBeNull();
    expect(session.state.actors.hero!.hp).toBe(originalHp);
    expect(session.state.pending).toMatchObject({impactTick:3240,hitIndex:0});
  });
  it("crosscut preserves second reaction, independent defense and single move cost",()=>{
    const session=new EncounterSession();
    session.end("hero");
    const energy=session.state.actors.enemy!.resource;
    session.attack("enemy","hero","rakshasa_crosscut",1.7,1000,"head");
    expect(session.state.turnBudget.actionsUsed).toBe(1);
    expect(session.state.actors.enemy!.resource).toBe(energy-2);
    expect(session.state.pending?.hits.map(h=>h.id)).toEqual(["crosscut_left","crosscut_right"]);
    expect(session.captureDefense("dodge",2080).accepted).toBe(true);
    const first=session.resolveIfReady(2080,1.7,undefined,contact)!;
    expect(first.outcome).toMatchObject({hitIndex:0,finalHit:false,damage:0});
    expect(session.state.phase).toBe("reaction");
    expect(session.state.pending).toMatchObject({hitIndex:1,impactTick:2740});
    expect(session.activeDefense).toBeNull();
    expect(session.resolveIfReady(2739,1.7,undefined,contact)).toBeNull();
    const second=session.resolveIfReady(2880,1.7,undefined,contact)!;
    expect(second.outcome).toMatchObject({hitIndex:1,finalHit:true});
    expect(second.outcome.damage).toBeGreaterThan(0);
    expect(session.state.pending).toBeNull();
    expect(session.state.actors.enemy!.resource).toBe(energy-2);
    expect(session.resolveIfReady(3500,1.7)).toBeNull();
  });
  it("rejects invalid feint offsets and impossible flurry authoring",()=>{
    const broken=(id:string,pattern:NonNullable<CombatCatalog["attacks"][string]["pattern"]>)=>{
      const move=PREVIEW_CATALOG.attacks[id]!;
      expect(()=>validateCombatCatalog({...PREVIEW_CATALOG,attacks:{
        ...PREVIEW_CATALOG.attacks,[id]:{...move,pattern},
      }})).toThrow();
    };
    broken("rakshasa_deceiver",{kind:"feint",feintAtTicks:[2090]});
    broken("rakshasa_crosscut",{kind:"flurry",swingLeadTicks:500});
    broken("rakshasa_crosscut",{kind:"feint",feintAtTicks:[300]});
  });
});
