import {
  createAnimationSampler, type AnimationClipV1,
} from "@trilok/character-core";
import {CanonicalAnimationPose} from "../characters/runtime/CanonicalAnimationPose";
import type {SemanticCharacter} from "../characters/runtime/SemanticCharacter";

/** Presentation-only timestamp player. No animation clock, rig, or pose survives
 * character regeneration. All seek operations sample a deterministic baseline. */
export class StudioAnimationPlayback {
  private readonly pose:CanonicalAnimationPose;
  readonly durationSeconds:number;
  readonly clipId:string;
  private seconds=0;
  private speed=1;
  private looping=true;
  private playing=false;
  private anchorMs:number|undefined;
  private anchorSeconds=0;
  private disposed=false;
  constructor(character:SemanticCharacter,clip:AnimationClipV1){
    // Validate before creating a mutating adapter.
    createAnimationSampler(clip,character.graph);
    this.pose=new CanonicalAnimationPose(character,clip);
    this.durationSeconds=clip.durationSeconds;
    this.clipId=clip.id;
    this.pose.apply(0);
  }
  private live():void {if(this.disposed)throw new Error("Animation playback disposed");}
  get state(){
    return {clipId:this.clipId,timeSeconds:this.seconds,durationSeconds:this.durationSeconds,
      playing:this.playing,loop:this.looping,speed:this.speed};
  }
  /** Explicit performance.now() input lets tests reproduce irregular frames. */
  update(nowMs:number):void {
    this.live();
    if(!Number.isFinite(nowMs))throw new Error("Invalid animation timestamp");
    if(!this.playing)return;
    if(this.anchorMs===undefined){
      this.anchorMs=nowMs;this.anchorSeconds=this.seconds;
    }
    const next=this.anchorSeconds+Math.max(0,nowMs-this.anchorMs)*this.speed/1000;
    if(this.looping){
      this.seconds=next%this.durationSeconds;
    }else{
      this.seconds=Math.min(this.durationSeconds,next);
      if(next>=this.durationSeconds){this.playing=false;this.anchorMs=undefined;}
    }
    this.pose.apply(this.seconds);
  }
  seek(seconds:number):void {
    this.live();
    if(!Number.isFinite(seconds))throw new Error("Invalid seek timestamp");
    this.seconds=Math.max(0,Math.min(this.durationSeconds,seconds));
    this.anchorMs=undefined;
    this.pose.apply(this.seconds);
  }
  setPlaying(playing:boolean):void {
    this.live();
    this.playing=playing;
    this.anchorMs=undefined;
    if(playing&&!this.looping&&this.seconds>=this.durationSeconds)this.seek(0);
  }
  setSpeed(speed:number):void {
    this.live();
    if(![.25,.5,1,1.5,2].includes(speed))throw new Error("Unsupported playback speed");
    this.speed=speed;
    this.anchorMs=undefined;
  }
  setLoop(loop:boolean):void {
    this.live();this.looping=loop;this.anchorMs=undefined;
  }
  step(direction:-1|1,frameRate=30):void {
    this.live();
    if(!Number.isFinite(frameRate)||frameRate<=0)throw new Error("Invalid frame rate");
    this.setPlaying(false);
    this.seek(this.seconds+direction/frameRate);
  }
  /** Background tabs do not consume timeline time. */
  suspend():void {if(!this.disposed)this.anchorMs=undefined;}
  reset():void {this.setPlaying(false);this.seek(0);}
  dispose():void{
    if(this.disposed)return;
    this.playing=false;
    this.pose.dispose();
    this.disposed=true;
  }
}
