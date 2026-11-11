export type CombatPresentation =
  | "intro" | "choice" | "attack" | "windup" | "reaction"
  | "enemy_pause" | "counter" | "projectile" | "victory" | "defeat";
export interface RuntimeSnapshot {
  readonly nowMs:number;
  readonly phaseAtMs:number;
  readonly presentation:CombatPresentation;
  readonly domainPhase:"decision"|"reaction"|"complete";
  readonly turn:number;
  readonly actorId:string;
  readonly pendingImpactTick:number|null;
  readonly counterImpactTick:number|null;
  readonly projectileImpactTick:number|null;
  readonly sequenceId:string|null;
}
interface Event {
  readonly atMs:number;
  readonly kind:string;
  readonly detail:string;
}
/**
 * Bounded local diagnostics and a phase deadline guard. A renderer failure
 * must become a visible recoverable error, never an unhandled RAF exception
 * that leaves players facing an unresponsive combat screen.
 * Reports are kept in memory, and are only copied when the user requests it.
 */
export class CombatRuntimeGuard {
  private readonly history:Event[]=[];
  private lastFrame:number|null=null;
  private graceUntil=0;
  private frames=0;
  private slowFrames=0;
  private worstFrameMs=0;
  private faultMessage:string|null=null;
  constructor(private readonly capacity=96) {
    if(!Number.isSafeInteger(capacity)||capacity<1||capacity>4096)
      throw new Error("Invalid combat diagnostic capacity.");
  }
  get fault():string|null { return this.faultMessage; }
  record(atMs:number,kind:string,detail=""):void {
    this.history.push({atMs,kind,detail:detail.slice(0,200)});
    if(this.history.length>this.capacity)this.history.shift();
  }
  reset():void {
    this.history.length=0;
    this.lastFrame=null;
    this.graceUntil=0;
    this.frames=0;
    this.slowFrames=0;
    this.worstFrameMs=0;
    this.faultMessage=null;
  }
  inspect(snapshot:RuntimeSnapshot):string|null {
    if(this.faultMessage)return this.faultMessage;
    if(!Number.isFinite(snapshot.nowMs)||!Number.isFinite(snapshot.phaseAtMs))
      return "Invalid combat clock.";
    if(this.lastFrame!==null){
      const delta=snapshot.nowMs-this.lastFrame;
      if(delta < -1)return "Combat clock moved backwards.";
      // The browser may suspend a hidden page; do not misreport tab resumes.
      if(delta>3000)this.graceUntil=snapshot.nowMs+5000;
      if(delta>50)this.slowFrames++;
      this.worstFrameMs=Math.max(this.worstFrameMs,delta);
    }
    this.lastFrame=snapshot.nowMs;
    this.frames++;
    if(snapshot.presentation==="choice" || snapshot.presentation==="victory" ||
       snapshot.presentation==="defeat")return null;
    if(snapshot.nowMs < this.graceUntil)return null;
    const entered=snapshot.phaseAtMs;
    let deadline=entered+6000;
    if(snapshot.presentation==="attack"||snapshot.presentation==="windup")
      deadline=Math.max(entered+6500,(snapshot.pendingImpactTick??entered)+3500);
    else if(snapshot.presentation==="projectile")
      deadline=Math.max(entered+5000,(snapshot.projectileImpactTick??entered)+3500);
    else if(snapshot.presentation==="counter")
      deadline=Math.max(entered+4200,(snapshot.counterImpactTick??entered)+3000);
    else if(snapshot.presentation==="reaction")deadline=entered+5000;
    else if(snapshot.presentation==="enemy_pause")deadline=entered+5000;
    if(snapshot.nowMs>deadline)
      return "Combat stalled in "+snapshot.presentation+" beyond its recovery deadline.";
    return null;
  }
  fail(error:unknown,snapshot:RuntimeSnapshot):string {
    const message=error instanceof Error?error.message:String(error);
    this.faultMessage=message.slice(0,300);
    this.record(snapshot.nowMs,"fatal",this.faultMessage);
    return this.faultMessage;
  }
  report(build:string,snapshot:RuntimeSnapshot):string {
    return JSON.stringify({
      build, fault:this.faultMessage, snapshot, metrics:{
        frames:this.frames,slowFrames:this.slowFrames,
        longestFrameMs:Math.round(this.worstFrameMs),
      }, events:this.history,
    },null,2);
  }
}
