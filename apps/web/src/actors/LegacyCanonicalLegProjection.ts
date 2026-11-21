import * as THREE from "three";
import {
  CanonicalLocomotionMixer,createAnatomyPreset,
  type LocomotionIntent,type SampledJointV1,
} from "@trilok/character-core";

/** Temporary presentation projector for the existing combat proxy (two leg
 * hinges, no C5 skin). Uses the EXACT canonical mixer and Kevin library used
 * by Studio, without inventing clips or applying any root displacement.
 * The eventual full skinned gameplay character can remove this projector. */
export class LegacyCanonicalLegProjection {
  private readonly mixer:CanonicalLocomotionMixer;
  private readonly hips:readonly [string,string];
  private readonly localRotation=new THREE.Quaternion();
  private readonly euler=new THREE.Euler();
  private disposed=false;
  private last:LocomotionIntent={forward:0,lateral:0,turn:0,grounded:true};
  private constructor(mixer:CanonicalLocomotionMixer,
    hips:readonly [string,string]){
    this.mixer=mixer;
    this.hips=hips;
  }
  static async load():Promise<LegacyCanonicalLegProjection>{
    const [{installKevinC63Review},{loadStudioLocomotionLibrary}]=await Promise.all([
      import("../studio/StudioKevinC63ReviewLibrary"),
      import("../studio/StudioAnimationLibrary"),
    ]);
    installKevinC63Review();
    const graph=createAnatomyPreset({archetype:"human"});
    const left=graph.joints.find(j=>j.role==="hip_left")?.id;
    const right=graph.joints.find(j=>j.role==="hip_right")?.id;
    if(!left||!right)throw new Error("Canonical hip identifiers unavailable");
    const mixer=new CanonicalLocomotionMixer(graph,loadStudioLocomotionLibrary(graph));
    return new LegacyCanonicalLegProjection(mixer,[left,right]);
  }
  /** Missing authored backward sprint is explicitly limited to jogging.
   * No reverse playback, root-motion export, or mislabeled Kevin clip. */
  setIntent(input:LocomotionIntent):void{
    this.live();
    const magnitude=Math.hypot(input.forward,input.lateral);
    const backward=input.forward<0;
    const limited=backward&&magnitude>.65? .65/magnitude:1;
    const intent=limited===1?input:{
      ...input,forward:input.forward*limited,lateral:input.lateral*limited,
    };
    this.mixer.setIntent(intent);
    this.last={...intent};
  }
  /** Projection contains only legacy leg local pitch/abduction angles.
   * All 49 canonical joints were sampled; no authoritative translation or
   * gameplay time changes are permitted. */
  sample(deltaSeconds:number):Readonly<{
    leftPitch:number;rightPitch:number;leftRoll:number;rightRoll:number;
  }>{
    this.live();
    const poses=this.mixer.advance(deltaSeconds);
    const hip=(id:string):readonly [number,number]=>{
      const sample:SampledJointV1|undefined=poses.find(j=>j.jointId===id);
      if(!sample?.rotation)return [0,0];
      this.localRotation.set(...sample.rotation);
      this.euler.setFromQuaternion(this.localRotation,"XYZ");
      return [
        THREE.MathUtils.clamp(this.euler.x,-.78,.78),
        THREE.MathUtils.clamp(this.euler.z,-.18,.18),
      ];
    };
    const [leftPitch,leftRoll]=hip(this.hips[0]);
    const [rightPitch,rightRoll]=hip(this.hips[1]);
    return {leftPitch,leftRoll,rightPitch,rightRoll};
  }
  get intent():LocomotionIntent{return {...this.last};}
  reset():void{this.live();this.mixer.reset();}
  dispose():void{if(this.disposed)return;this.disposed=true;this.mixer.dispose();}
  private live():void{if(this.disposed)throw new Error("Canonical legacy projector disposed");}
}
