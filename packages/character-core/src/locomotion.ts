import {
  createAnimationSampler, type AnimationClipV1, type AnimationSampler,
  type SampledJointV1,
} from "./animation";
import type {AnatomicalGraphV1} from "./schema";

/** Presentation request only. The actor simulation owns displacement and heading. */
export interface LocomotionIntent {
  readonly forward: number;
  readonly lateral: number;
  readonly turn: number;
  readonly grounded: boolean;
}
export type TravelDirection =
  "forward" | "forward-right" | "right" | "backward-right" |
  "backward" | "backward-left" | "left" | "forward-left";
export type LocomotionDirection = TravelDirection | "turn-left" | "turn-right";
export type LocomotionGait = "walk" | "jog" | "sprint";

/** Offline-measured contact markers in each loop's own normalized timeline.
 * Missing markers are permitted for legacy clips but are NOT verified phase alignment. */
export interface LocomotionGaitContactsV1 {
  readonly schemaVersion: 1;
  readonly leftPlantPhase: number;
  readonly rightPlantPhase: number;
}
export interface LocomotionMotionV1 {
  readonly gait: LocomotionGait;
  readonly direction: TravelDirection;
  readonly clip: AnimationClipV1;
  readonly contacts?: LocomotionGaitContactsV1;
}
export interface LocomotionTurnV1 {
  readonly direction: "left" | "right";
  readonly clip: AnimationClipV1;
}
export interface LocomotionLibrary {
  readonly idle: AnimationClipV1;
  readonly walk: AnimationClipV1;
  readonly jog: AnimationClipV1;
  readonly sprint: AnimationClipV1;
  /** Backward-compatible C6.3 diagnostic clips. No gait family is inferred. */
  readonly directional?: Partial<Record<LocomotionDirection, AnimationClipV1>>;
  /** Validated, source-backed direction and speed metadata. */
  readonly motions?: readonly LocomotionMotionV1[];
  /** Explicit one-shot turning clips; never included in periodic gait phase. */
  readonly turns?: readonly LocomotionTurnV1[];
}
export interface LocomotionTuning {
  readonly speedBands: readonly [number, number, number];
  readonly blendSeconds: number;
}
export const DEFAULT_LOCOMOTION_TUNING: LocomotionTuning = Object.freeze({
  speedBands: [.32, .65, 1] as const,
  blendSeconds: .18,
});
const clamp = (value: number, a: number, b: number) => Math.max(a, Math.min(b, value));
const finite = (n: number) => Number.isFinite(n);
const neutral: readonly [number,number,number,number] = [0,0,0,1];
const DIRECTIONS: readonly TravelDirection[] = [
  "forward","forward-right","right","backward-right",
  "backward","backward-left","left","forward-left",
];
const TAU = Math.PI * 2;
type TurnPlayback = {key:string;seconds:number;running:boolean};

/**
 * C6.3 canonical presentation mixer. The C1 graph is shared with Studio and
 * runtime actors. Clips supply poses, not movement or collision decisions.
 * Direction weights are computed from the actual 2D vector (rather than
 * prioritizing the backward axis); gait family is independently selected
 * from source metadata. One-shot turns have their own nonlooping clock.
 */
export class CanonicalLocomotionMixer {
  private readonly samplers: ReadonlyMap<string, AnimationSampler>;
  private readonly durations: ReadonlyMap<string, number>;
  private readonly ids: readonly string[];
  private readonly indices: ReadonlyMap<string,number>;
  private readonly output: SampledJointV1[];
  private readonly rotations: ([number,number,number,number] | undefined)[];
  private readonly translations: ([number,number,number] | undefined)[];
  private readonly bands: readonly [number,number,number];
  private readonly blendSeconds: number;
  private readonly directionIds = new Map<LocomotionDirection,string>();
  private readonly motionIds = new Map<string,string>();
  private readonly contactPhases = new Map<string,number>();
  private readonly turnIds = new Map<"left"|"right",string>();
  private readonly weights = new Map<string,number>();
  private target: LocomotionIntent = {forward:0,lateral:0,turn:0,grounded:true};
  private phase = 0;
  private idleTime = 0;
  private playback:TurnPlayback|undefined;
  private turnArmed=true;
  private lastTurnSide:"left"|"right"|undefined;
  private disposed = false;

  constructor(graph: AnatomicalGraphV1, library: LocomotionLibrary,
    tuning: LocomotionTuning = DEFAULT_LOCOMOTION_TUNING) {
    const b=tuning.speedBands;
    if(!b.every(finite) || b[0]<=0 || b[0]>=b[1] || b[1]>=b[2] ||
      b[2]!==1 || !finite(tuning.blendSeconds) || tuning.blendSeconds<=0 ||
      tuning.blendSeconds>2) throw new Error("Invalid locomotion tuning");
    this.bands=b;
    this.blendSeconds=tuning.blendSeconds;
    const entries: [string,AnimationClipV1][]=[
      ["idle",library.idle],["walk",library.walk],["jog",library.jog],["sprint",library.sprint],
    ];
    for(const [direction,clip] of Object.entries(library.directional??{}) as
        [LocomotionDirection,AnimationClipV1][]) {
      if(!clip)continue;
      if(!(["forward","backward","left","right","turn-left","turn-right"] as
        readonly string[]).includes(direction))throw new Error("Unknown legacy direction");
      const key="direction:"+direction;
      entries.push([key,clip]);
      this.directionIds.set(direction,key);
    }
    for(const motion of library.motions??[]){
      if(!DIRECTIONS.includes(motion.direction) ||
        !(["walk","jog","sprint"] as readonly string[]).includes(motion.gait))
        throw new Error("Invalid authored movement category");
      const key="motion:"+motion.gait+":"+motion.direction;
      if(this.motionIds.has(key))throw new Error("Duplicate authored movement category: "+key);
      if(motion.clip.rootTrajectory && motion.clip.rootTrajectory.behavior!=="loop")
        throw new Error("Only authored loop clips may be registered as gait");
      if(motion.contacts){
        const c=motion.contacts;
        if(c.schemaVersion!==1 || !finite(c.leftPlantPhase) || !finite(c.rightPlantPhase) ||
          c.leftPlantPhase<0 || c.leftPlantPhase>=1 ||
          c.rightPlantPhase<0 || c.rightPlantPhase>=1)
          throw new Error("Invalid measured gait contacts for "+key);
        this.contactPhases.set(key,c.leftPlantPhase);
      }
      entries.push([key,motion.clip]);this.motionIds.set(key,key);
    }
    for(const turn of library.turns??[]){
      if(turn.direction!=="left"&&turn.direction!=="right")
        throw new Error("Invalid authored turn direction");
      if(this.turnIds.has(turn.direction))throw new Error("Duplicate turn direction");
      if(turn.clip.rootTrajectory?.behavior!=="one_shot")
        throw new Error("Stationary turns must be one-shot source clips");
      const key="turn:"+turn.direction;
      entries.push([key,turn.clip]);this.turnIds.set(turn.direction,key);
    }
    const samplers=new Map<string,AnimationSampler>();
    const durations=new Map<string,number>();
    const ids=new Set<string>();
    for(const [key,clip] of entries){
      if(clip.rootMotion!=="locked" && clip.rootMotion!=="visual_only")
        throw new Error("Invalid root motion policy");
      const sampler=createAnimationSampler(clip,graph);
      samplers.set(key,sampler);durations.set(key,clip.durationSeconds);
      for(const id of sampler.jointIds)ids.add(id);
      this.weights.set(key,key==="idle"?1:0);
    }
    this.samplers=samplers;this.durations=durations;
    this.ids=[...ids];
    this.indices=new Map(this.ids.map((id,j)=>[id,j]));
    this.rotations=this.ids.map(()=>undefined);
    this.translations=this.ids.map(()=>undefined);
    this.output=this.ids.map(jointId=>({jointId}));
  }
  get availableDirections(): readonly LocomotionDirection[] {
    const available=new Set<LocomotionDirection>(this.directionIds.keys());
    for(const motion of this.motionIds.keys())
      available.add(motion.split(":")[2] as TravelDirection);
    for(const side of this.turnIds.keys())available.add(side==="left"?"turn-left":"turn-right");
    return [...available];
  }
  get gaitPhase():number {return this.phase;}
  get blendWeights():Readonly<Record<string,number>> {return Object.fromEntries(this.weights);}
  get intent():LocomotionIntent {return {...this.target};}
  get turnStatus():Readonly<{direction:"left"|"right";seconds:number;running:boolean}>|undefined {
    const turn=this.playback;
    if(!turn)return undefined;
    return {direction:turn.key==="turn:left"?"left":"right",
      seconds:turn.seconds,running:turn.running};
  }
  reset():void {
    this.live();
    this.target={forward:0,lateral:0,turn:0,grounded:true};
    this.phase=0;this.idleTime=0;this.playback=undefined;this.turnArmed=true;
    this.lastTurnSide=undefined;
    for(const key of this.weights.keys())this.weights.set(key,key==="idle"?1:0);
  }
  setIntent(intent:LocomotionIntent):void {
    this.live();
    if(![intent.forward,intent.lateral,intent.turn].every(finite) ||
      Math.max(Math.abs(intent.forward),Math.abs(intent.lateral),Math.abs(intent.turn))>1 ||
      typeof intent.grounded!=="boolean")throw new Error("Invalid locomotion intent");
    const movement=Math.min(1,Math.hypot(intent.forward,intent.lateral));
    if(intent.grounded && movement>1e-3)this.movementTargets(intent);
    if(intent.grounded && movement<=1e-3 && Math.abs(intent.turn)>1e-3){
      const side=intent.turn<0?"left":"right";
      if(!this.turnIds.has(side)&&!this.directionIds.has(side==="left"?"turn-left":"turn-right"))
        throw new Error("No verified authored clip for turn-"+side);
    }
    this.target={...intent};
  }
  private live():void {if(this.disposed)throw new Error("Locomotion mixer disposed");}

  /** Angularly interpolate neighboring authored directions, no pose reversal. */
  private movementTargets(i:LocomotionIntent):Map<string,number>{
    const targets=new Map<string,number>();
    const magnitude=Math.min(1,Math.hypot(i.forward,i.lateral));
    if(magnitude<=1e-3){targets.set("idle",1);return targets;}
    const angle=(Math.atan2(i.lateral,i.forward)+TAU)%TAU;
    const sector=angle/(Math.PI/4);
    const lo=Math.floor(sector)%8;
    const hi=(lo+1)%8;
    const fraction=sector-Math.floor(sector);
    const choices:[[TravelDirection,number],[TravelDirection,number]]=[
      [DIRECTIONS[lo]!,1-fraction],[DIRECTIONS[hi]!,fraction],
    ];
    const gaitWeights:[LocomotionGait,number][]=[];
    const [walkBand,jogBand]=this.bands;
    if(magnitude<=walkBand){
      targets.set("idle",1-magnitude/walkBand);
      gaitWeights.push(["walk",magnitude/walkBand]);
    }else if(magnitude<=jogBand){
      const t=(magnitude-walkBand)/(jogBand-walkBand);
      gaitWeights.push(["walk",1-t],["jog",t]);
    }else{
      const t=(magnitude-jogBand)/(1-jogBand);
      gaitWeights.push(["jog",1-t],["sprint",t]);
    }
    for(const [gait,gaitWeight] of gaitWeights){
      if(gaitWeight<=1e-8)continue;
      const options=choices.map(([direction,weight])=>{
        let key=this.motionIds.get("motion:"+gait+":"+direction);
        if(!key && direction==="forward")key=gait;
        // Legacy opt-in KayKit review: never relabel as an authored walk.
        if(!key && this.motionIds.size===0)
          key=this.directionIds.get(direction);
        return {key,weight};
      });
      const coverage=options.reduce((sum,item)=>sum+(item.key?item.weight:0),0);
      if(coverage<1e-7)throw new Error("No verified authored clip for "+
        gait+" "+DIRECTIONS[Math.round(sector)%8]);
      for(const item of options){
        if(!item.key || item.weight<=0)continue;
        targets.set(item.key,(targets.get(item.key)??0)+gaitWeight*item.weight/coverage);
      }
    }
    return targets;
  }
  /** Exact exponential weight integration and phase integral for variable dt. */
  advance(deltaSeconds:number):readonly SampledJointV1[] {
    this.live();
    if(!finite(deltaSeconds)||deltaSeconds<0||deltaSeconds>1)
      throw new Error("Invalid locomotion sample delta");
    const i=this.target;
    const movement=Math.min(1,Math.hypot(i.forward,i.lateral));
    if(Math.abs(i.turn)<=1e-3 || movement>1e-3 || !i.grounded){
      this.turnArmed=true;
      this.lastTurnSide=undefined;
    }
    if(this.playback?.running && (movement>1e-3 || Math.abs(i.turn)<=1e-3))
      this.playback.running=false;
    if(i.grounded && movement<=1e-3 && Math.abs(i.turn)>1e-3){
      const side=i.turn<0?"left":"right";
      // Opposite turn intent interrupts the current one-shot. Holding the same
      // direction through clip completion must not loop or restart it.
      if(this.turnArmed || (this.lastTurnSide!==undefined&&this.lastTurnSide!==side)){
        const key=this.turnIds.get(side)??this.directionIds.get(side==="left"?"turn-left":"turn-right");
        if(key){
          this.playback={key,seconds:0,running:true};
          this.turnArmed=false;this.lastTurnSide=side;
        }
      }
    }
    if(this.playback?.running){
      this.playback.seconds=Math.min(this.durations.get(this.playback.key)!,
        this.playback.seconds+deltaSeconds);
      if(this.playback.seconds>=this.durations.get(this.playback.key)!)
        this.playback.running=false;
    }
    const desired=new Map<string,number>();
    if(!i.grounded){
      for(const [key,value] of this.weights)desired.set(key,value);
    }else if(this.playback?.running && movement<=1e-3){
      // Last 15% of the one-shot cross-fades back to idle without looping.
      const turn=this.playback;
      const duration=this.durations.get(turn.key)!;
      const remaining=(duration-turn.seconds)/Math.min(.15,duration*.15);
      const fade=clamp(remaining,0,1)*Math.abs(i.turn);
      desired.set("idle",1-fade);desired.set(turn.key,fade);
    }else{
      for(const [key,value] of this.movementTargets(i))desired.set(key,value);
    }
    const decay=Math.exp(-deltaSeconds/this.blendSeconds);
    const average=deltaSeconds===0?1:(1-decay)/(deltaSeconds/this.blendSeconds);
    let cyclesPerSecond=0;
    let sum=0;
    for(const [key,current] of this.weights){
      const target=desired.get(key)??0;
      const next=target+(current-target)*decay;
      const mean=target+(current-target)*average;
      if(key!=="idle"&&!key.startsWith("turn:")&&
        !key.startsWith("direction:turn")&&mean>1e-7)
        cyclesPerSecond+=mean/this.durations.get(key)!;
      this.weights.set(key,next);
      sum+=next;
    }
    if(sum>0)for(const [key,current] of this.weights)
      this.weights.set(key,current/sum);
    this.phase=(this.phase+deltaSeconds*cyclesPerSecond)%1;
    this.idleTime+=deltaSeconds;
    if(this.playback && !this.playback.running &&
      (this.weights.get(this.playback.key)??0)<1e-5)this.playback=undefined;
    return this.evaluate();
  }
  /** Seeking affects periodic gait; an active one-shot keeps its own clock. */
  seek(phase:number):readonly SampledJointV1[] {
    this.live();
    if(!finite(phase)||phase<0||phase>1)throw new Error("Invalid gait phase");
    this.phase=phase===1?0:phase;
    return this.evaluate();
  }
  private evaluate():readonly SampledJointV1[]{
    const n=this.ids.length;
    const sums=new Array<number[]>(n);
    const positions=new Array<number[]>(n);
    const hasRotation=new Array<boolean>(n).fill(false);
    const hasTranslation=new Array<boolean>(n).fill(false);
    for(const [key,weight] of this.weights){
      if(weight<=1e-7)continue;
      const sampler=this.samplers.get(key)!;
      const duration=this.durations.get(key)!;
      const seconds=key==="idle"?this.idleTime%duration:
        (key.startsWith("turn:")||key.startsWith("direction:turn"))?
          Math.min(this.playback?.seconds??0,duration):
          ((this.phase+(this.contactPhases.get(key)??0))%1)*duration;
      for(const joint of sampler.sample(seconds)){
        const index=this.indices.get(joint.jointId)!;
        if(joint.rotation){
          const q=joint.rotation;
          let accum=sums[index];
          if(!accum){accum=[0,0,0,0];sums[index]=accum;}
          const sign=hasRotation[index] &&
            (accum[0]!*q[0]+accum[1]!*q[1]+accum[2]!*q[2]+accum[3]!*q[3])<0?-1:1;
          for(let k=0;k<4;k++)accum[k]=accum[k]!+sign*weight*q[k]!;
          hasRotation[index]=true;
        }
        if(joint.translation){
          let p=positions[index];
          if(!p){p=[0,0,0];positions[index]=p;}
          for(let k=0;k<3;k++)p[k]=p[k]!+weight*joint.translation[k]!;
          hasTranslation[index]=true;
        }
      }
    }
    for(let j=0;j<n;j++){
      const q=sums[j];
      if(hasRotation[j]&&q){
        const m=Math.hypot(...q);
        this.rotations[j]=m>1e-10?[q[0]!/m,q[1]!/m,q[2]!/m,q[3]!/m]:[...neutral];
      }else this.rotations[j]=undefined;
      const p=positions[j];
      this.translations[j]=hasTranslation[j]&&p?
        [p[0]!,p[1]!,0]:undefined; // no authored source-Z travel in world space
      this.output[j]={
        jointId:this.ids[j]!,
        ...(this.rotations[j]?{rotation:this.rotations[j]}:{}),
        ...(this.translations[j]?{translation:this.translations[j]}:{}),
      };
    }
    return this.output;
  }
  dispose():void {
    if(this.disposed)return;
    this.weights.clear();this.directionIds.clear();this.motionIds.clear();
    this.contactPhases.clear();this.turnIds.clear();
    this.playback=undefined;this.disposed=true;
  }
}
