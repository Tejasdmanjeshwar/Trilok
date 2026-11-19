import {
  createAnimationSampler, type AnimationClipV1, type AnimationSampler,
  type SampledJointV1,
} from "./animation";
import type {AnatomicalGraphV1} from "./schema";

/** Presentation-only movement request. Gameplay decides displacement and heading. */
export interface LocomotionIntent {
  /** Fraction of the configured forward top speed; never world displacement. */
  readonly forward: number;
  readonly lateral: number;
  readonly turn: number;
  readonly grounded: boolean;
}
export type LocomotionDirection = "forward" | "backward" | "left" | "right" | "turn-left" | "turn-right";
export interface LocomotionLibrary {
  readonly idle: AnimationClipV1;
  readonly walk: AnimationClipV1;
  readonly jog: AnimationClipV1;
  readonly sprint: AnimationClipV1;
  /** Authored, independently retargeted source clips; never rotate/reverse forward gait. */
  readonly directional?: Partial<Record<LocomotionDirection, AnimationClipV1>>;
}
export interface LocomotionTuning {
  /** Preview speed bands are unitless; simulation can supply its own mapping. */
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

/**
 * Canonical C6.3 gait mixer. All clips use the same C1 graph; the same
 * normalized gait phase samples simultaneously, eliminating phase reset when
 * changing speeds. No root-space translation is ever returned as actor travel.
 * Contacts, terrain and IK are a separate presentation pass.
 */
export class CanonicalLocomotionMixer {
  private readonly samplers: ReadonlyMap<string, AnimationSampler>;
  private readonly durations: ReadonlyMap<string, number>;
  private readonly ids: readonly string[];
  private readonly output: SampledJointV1[];
  private readonly rotations: ([number,number,number,number] | undefined)[];
  private readonly translations: ([number,number,number] | undefined)[];
  private readonly bands: readonly [number,number,number];
  private readonly blendSeconds: number;
  private readonly directionIds = new Map<LocomotionDirection,string>();
  private readonly weights = new Map<string,number>();
  private target: LocomotionIntent = {forward:0,lateral:0,turn:0,grounded:true};
  private phase = 0;
  private idleTime = 0;
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
      const key="direction:"+direction;
      entries.push([key,clip]);
      this.directionIds.set(direction,key);
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
    this.rotations=this.ids.map(()=>undefined);
    this.translations=this.ids.map(()=>undefined);
    this.output=this.ids.map(jointId=>({jointId}));
  }
  get availableDirections(): readonly LocomotionDirection[] {
    return [...this.directionIds.keys()];
  }
  get gaitPhase():number {return this.phase;}
  get blendWeights():Readonly<Record<string,number>> {
    return Object.fromEntries(this.weights);
  }
  get intent():LocomotionIntent {return {...this.target};}
  /** Reinitialize without discarding samplers or rig-bound caches. */
  reset():void {
    this.live();
    this.target={forward:0,lateral:0,turn:0,grounded:true};
    this.phase=0;this.idleTime=0;
    for(const key of this.weights.keys())this.weights.set(key,key==="idle"?1:0);
  }
  setIntent(intent:LocomotionIntent):void {
    this.live();
    if(![intent.forward,intent.lateral,intent.turn].every(finite) ||
      Math.max(Math.abs(intent.forward),Math.abs(intent.lateral),Math.abs(intent.turn))>1 ||
      typeof intent.grounded!=="boolean") throw new Error("Invalid locomotion intent");
    const direction=this.direction(intent);
    if(direction&&!this.directionIds.has(direction))
      throw new Error("No verified authored clip for "+direction);
    this.target={...intent};
  }
  private direction(i:LocomotionIntent):LocomotionDirection|undefined {
    if(i.forward<-.001)return "backward";
    if(i.lateral<-.001)return "left";
    if(i.lateral>.001)return "right";
    if(i.turn<-.001)return "turn-left";
    if(i.turn>.001)return "turn-right";
    return undefined;
  }
  private live():void {if(this.disposed)throw new Error("Locomotion mixer disposed");}
  /** Purely presentation clock: elapsed seconds must be supplied by caller. */
  advance(deltaSeconds:number):readonly SampledJointV1[] {
    this.live();
    if(!finite(deltaSeconds)||deltaSeconds<0||deltaSeconds>1)
      throw new Error("Invalid locomotion sample delta");
    const i=this.target;
    const targetWeights=new Map<string,number>();
    const movement=Math.max(Math.abs(i.forward),Math.abs(i.lateral));
    const direction=this.direction(i);
    if(!i.grounded){
      // No locked feet or fabricated airborne gait. Existing authored sample
      // is retained; the grounding system receives grounded=false separately.
      for(const [key,value] of this.weights)targetWeights.set(key,value);
    }else if(direction){
      const key=this.directionIds.get(direction)!;
      const intensity=direction.startsWith("turn")?Math.abs(i.turn):movement;
      targetWeights.set("idle",1-intensity);
      targetWeights.set(key,intensity);
    }else{
      const keys=["idle","walk","jog","sprint"] as const;
      const thresholds=[0,...this.bands];
      for(let x=0;x<3;x++){
        if(movement<=thresholds[x+1]! || x===2){
          const alpha=clamp((movement-thresholds[x]!)/
            (thresholds[x+1]!-thresholds[x]!),0,1);
          targetWeights.set(keys[x]!,1-alpha);
          targetWeights.set(keys[x+1]!,alpha);
          break;
        }
      }
    }
    const inertia=1-Math.exp(-deltaSeconds/this.blendSeconds);
    let sum=0;
    for(const [key,current] of this.weights){
      const next=current+inertia*((targetWeights.get(key)??0)-current);
      this.weights.set(key,next);sum+=next;
    }
    if(sum>0)for(const [key,current] of this.weights)
      this.weights.set(key,current/sum);
    let cyclesPerSecond=0;
    for(const [key,weight] of this.weights){
      if(key==="idle"||weight<=1e-6)continue;
      cyclesPerSecond+=weight/this.durations.get(key)!;
    }
    this.phase=(this.phase+deltaSeconds*cyclesPerSecond)%1;
    this.idleTime+=deltaSeconds;
    return this.evaluate();
  }
  /** Seeking uses a normalized phase and never consumes gameplay timeline. */
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
    const indices=new Map(this.ids.map((id,j)=>[id,j]));
    for(const [key,weight] of this.weights){
      if(weight<=1e-7)continue;
      const sampler=this.samplers.get(key)!;
      const duration=this.durations.get(key)!;
      const seconds=key==="idle"?this.idleTime%duration:this.phase*duration;
      for(const joint of sampler.sample(seconds)){
        const index=indices.get(joint.jointId)!;
        if(joint.rotation){
          const q=joint.rotation;
          let accum=sums[index];
          if(!accum){accum=[0,0,0,0];sums[index]=accum;}
          // Hemisphere-aligned normalized quaternion blending.
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
        [p[0]!,p[1]!,0]:undefined; // z is never authoritative actor travel
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
    this.weights.clear();this.directionIds.clear();
    this.disposed=true;
  }
}
