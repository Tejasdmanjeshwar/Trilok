import type { AttackSpec } from "@trilok/combat";
import type { Sequence } from "@trilok/choreography";
import type { CombatCue } from "./sequences";

/** Build all true contacts from domain authored hits; feints cannot deal damage. */
export function buildPatternSequence(move: AttackSpec):Sequence<CombatCue> {
  const pattern=move.pattern;
  if(!pattern||move.delivery!=="melee_contact")
    throw new Error("Pattern sequence requires an authored melee pattern.");
  const hits=move.hits??[{id:"impact",offsetTicks:move.impactOffsetTicks}];
  const lead=pattern.swingLeadTicks??180;
  const cues:Array<{id:string;atMs:number;type:CombatCue}>=[
    {id:"pattern-approach",atMs:0,type:"camera_defense"},
  ];
  for(const hit of hits){
    cues.push({id:"swing-"+hit.id,atMs:hit.offsetTicks-lead,type:"enemy_swing"});
    cues.push({id:"impact-"+hit.id,atMs:hit.offsetTicks,type:"enemy_impact"});
  }
  for(let i=0;i<(pattern.feintAtTicks?.length??0);i++){
    cues.push({id:"feint-"+i,atMs:pattern.feintAtTicks![i]!,type:"feint_flash"});
  }
  const end=hits[hits.length-1]!.offsetTicks;
  cues.push({id:"pattern-recover",atMs:end+300,type:"reaction_close"});
  cues.sort((a,b)=>a.atMs-b.atMs||a.id.localeCompare(b.id));
  return {id:"pattern_"+move.id,durationMs:end+420,cues};
}
