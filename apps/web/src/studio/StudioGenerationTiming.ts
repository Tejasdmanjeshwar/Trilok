/** Browser-only, opt-in generation timing history. No automatic upload or
 * storage. The first attempt is retained even after later warm runs. */
export type GenerationTimingPhase="start"|"end";
export type GenerationTimingStatus="running"|"success"|"failed";
export interface GenerationTimingStage {
  readonly name:string;
  readonly startedAtMs:number;
  readonly elapsedMs:number;
  readonly finished:boolean;
}
export interface GenerationTimingAttempt {
  readonly attempt:number;
  readonly seed:number;
  readonly startedAt:string;
  readonly status:GenerationTimingStatus;
  readonly elapsedMs:number;
  readonly currentStage:string|null;
  readonly stages:readonly GenerationTimingStage[];
}
interface PendingStage {name:string;startedAtMs:number;endedAtMs?:number}
interface PendingAttempt {
  attempt:number;seed:number;startedAt:string;startedAtMs:number;
  status:GenerationTimingStatus;endedAtMs?:number;stages:PendingStage[];
}
const rounded=(value:number)=>Math.round(Math.max(0,value)*10)/10;
export class StudioGenerationTiming {
  private readonly history:PendingAttempt[]=[];
  private nextAttempt=1;

  begin(seed:number,now:number,startedAt:string):void {
    if(this.history.at(-1)?.status==="running")
      throw new Error("Overlapping character generation traces");
    if(!Number.isSafeInteger(seed)||seed<1||seed>0xffffffff||
      !Number.isFinite(now)||now<0)throw new Error("Invalid generation trace start");
    this.history.push({attempt:this.nextAttempt++,seed,startedAt,
      startedAtMs:now,status:"running",stages:[]});
    // Preserve cold attempt 1 and the four newest warm attempts.
    if(this.history.length>5)this.history.splice(1,1);
  }

  stage(name:string,phase:GenerationTimingPhase,now:number,durationMs?:number):void {
    const active=this.history.at(-1);
    if(!active||active.status!=="running")return;
    if(!/^[a-z][a-z0-9:-]*$/.test(name)||!Number.isFinite(now)||
      now<active.startedAtMs)return;
    const elapsed=now-active.startedAtMs;
    if(phase==="start"){
      active.stages.push({name,startedAtMs:elapsed});
      return;
    }
    if(phase!=="end"||durationMs!==undefined&&
      (!Number.isFinite(durationMs)||durationMs<0))return;
    const stage=[...active.stages].reverse().find(s=>
      s.name===name&&s.endedAtMs===undefined);
    if(stage)stage.endedAtMs=elapsed;
    else active.stages.push({name,startedAtMs:Math.max(0,elapsed-(durationMs??0)),
      endedAtMs:elapsed});
  }

  finish(status:Exclude<GenerationTimingStatus,"running">,now:number):void {
    const active=this.history.at(-1);
    if(!active||active.status!=="running"||!Number.isFinite(now))return;
    active.status=status;
    active.endedAtMs=Math.max(active.startedAtMs,now);
  }

  snapshot(now:number):readonly GenerationTimingAttempt[] {
    return this.history.map(a=>{
      const elapsed=Math.max(0,(a.endedAtMs??now)-a.startedAtMs);
      const pending=a.stages.filter(s=>s.endedAtMs===undefined);
      return {attempt:a.attempt,seed:a.seed,startedAt:a.startedAt,
        status:a.status,elapsedMs:rounded(elapsed),
        currentStage:a.status==="running"?pending.at(-1)?.name??"applying-recipe":null,
        stages:a.stages.map(s=>({
          name:s.name,startedAtMs:rounded(s.startedAtMs),
          elapsedMs:rounded((s.endedAtMs??elapsed)-s.startedAtMs),
          finished:s.endedAtMs!==undefined,
        })),
      };
    });
  }
}
