import {
  CanonicalLocomotionMixer,type LocomotionIntent,type LocomotionLibrary,
  type SampledJointV1,
} from "@trilok/character-core";
import type {SemanticCharacter} from "../characters/runtime/SemanticCharacter";
import {GroundedFootContacts,type GroundContactMetrics} from "./GroundedFootContacts";

/** Studio-only presentation adapter; same canonical sampled-pose/FK path as C6.2. */
export class StudioLocomotionPlayback {
  readonly clipId="locomotion-preview";
  readonly durationSeconds=1;
  private readonly mixer:CanonicalLocomotionMixer;
  private readonly contacts:GroundedFootContacts;
  private playing=false;
  private looping=true;
  private speed=1;
  private seconds=0;
  private anchorMs:number|undefined;
  private disposed=false;
  private input:LocomotionIntent={forward:0,lateral:0,turn:0,grounded:true};
  private contactMetrics:GroundContactMetrics={
    plantedFeet:0,maxAnchorSlipMeters:0,maxPenetrationMeters:0,unreachableFeet:0,
  };
  constructor(character:SemanticCharacter,library:LocomotionLibrary,
    private readonly applyPose:(samples:readonly SampledJointV1[])=>void){
    this.mixer=new CanonicalLocomotionMixer(character.graph,library);
    this.contacts=new GroundedFootContacts(character);
    this.paint(this.mixer.seek(0),0);
  }
  private live():void{if(this.disposed)throw new Error("Locomotion playback disposed");}
  get state(){
    return {clipId:this.clipId,timeSeconds:this.seconds,
      durationSeconds:this.durationSeconds,playing:this.playing,
      loop:this.looping,speed:this.speed};
  }
  get contactStatus():GroundContactMetrics{return this.contactMetrics;}
  get availableDirections(){return this.mixer.availableDirections;}
  setMovement(forward:number,lateral=0,turn=0,grounded=true):void {
    this.live();
    this.input={forward,lateral,turn,grounded};
    this.mixer.setIntent(this.input);
    this.contacts.reset();
    this.paint(this.mixer.seek(this.seconds),0);
  }
  private paint(samples:readonly SampledJointV1[],dt:number):void {
    this.applyPose(samples);
    this.contactMetrics=this.contacts.apply(dt,this.input.grounded);
  }
  update(nowMs:number):void {
    this.live();
    if(!Number.isFinite(nowMs))throw new Error("Invalid animation timestamp");
    if(!this.playing)return;
    if(this.anchorMs===undefined){this.anchorMs=nowMs;return;}
    const dt=Math.max(0,Math.min(1,(nowMs-this.anchorMs)/1000))*this.speed;
    this.anchorMs=nowMs;
    const phase=this.mixer.advance(dt);
    this.seconds=this.mixer.gaitPhase;
    this.paint(phase,dt);
  }
  seek(seconds:number):void{
    this.live();
    if(!Number.isFinite(seconds))throw new Error("Invalid animation seek");
    this.seconds=Math.max(0,Math.min(1,seconds));
    this.anchorMs=undefined;
    this.contacts.reset();
    this.paint(this.mixer.seek(this.seconds),0);
  }
  setPlaying(playing:boolean):void{
    this.live();this.playing=playing;this.anchorMs=undefined;
  }
  setSpeed(speed:number):void{
    this.live();
    if(![.25,.5,1,1.5,2].includes(speed))
      throw new Error("Unsupported animation speed");
    this.speed=speed;this.anchorMs=undefined;
  }
  setLoop(loop:boolean):void{this.live();this.looping=loop;}
  step(direction:-1|1,frameRate=30):void{
    this.live();
    if(!Number.isFinite(frameRate)||frameRate<=0)
      throw new Error("Invalid frame rate");
    this.setPlaying(false);
    this.seek(Math.max(0,Math.min(1,this.seconds+direction/frameRate)));
  }
  reset():void{
    this.live();this.setPlaying(false);
    this.mixer.setIntent({forward:0,lateral:0,turn:0,grounded:true});
    this.input={forward:0,lateral:0,turn:0,grounded:true};
    this.contacts.reset();this.seek(0);
  }
  suspend():void{if(!this.disposed)this.anchorMs=undefined;}
  dispose():void {
    if(this.disposed)return;
    this.disposed=true;
    this.contacts.dispose();
    this.mixer.dispose();
  }
}
