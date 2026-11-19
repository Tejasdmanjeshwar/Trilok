import * as THREE from "three";
import type {AnatomicalGraphV1} from "@trilok/character-core";
import type {SemanticCharacter} from "../characters/runtime/SemanticCharacter";

/**
 * Reusable presentation-only foot contact pass. An explicit ground-height
 * callback permits a future simulation-provided terrain sampler. It cannot
 * set actor world position or decide collisions.
 */
export interface GroundContactSurface {
  heightAt(x:number,z:number): number | undefined;
}
export interface GroundContactMetrics {
  readonly plantedFeet:number;
  readonly maxAnchorSlipMeters:number;
  readonly maxPenetrationMeters:number;
  readonly unreachableFeet:number;
}
interface FootChain {
  hip:THREE.Object3D;
  knee:THREE.Object3D;
  ankle:THREE.Object3D;
  toe:THREE.Object3D;
  anchor:THREE.Vector3;
  previous:THREE.Vector3;
  soleOffset:number;
  planted:boolean;
  blend:number;
}
const minReach=.03;
/** No root shift, no unbounded iteration, no terrain/physics dependency. */
export class GroundedFootContacts {
  private readonly chains:FootChain[];
  private readonly surface:GroundContactSurface;
  private disposed=false;
  private readonly scratch=new THREE.Vector3();
  private readonly bend=new THREE.Vector3();
  private readonly delta=new THREE.Vector3();
  private readonly a=new THREE.Vector3();
  private readonly b=new THREE.Vector3();
  private readonly c=new THREE.Vector3();
  private readonly worldQ=new THREE.Quaternion();
  private readonly rotation=new THREE.Quaternion();
  private readonly parentQ=new THREE.Quaternion();
  private readonly after=new THREE.Vector3();
  private metrics:GroundContactMetrics={
    plantedFeet:0,maxAnchorSlipMeters:0,maxPenetrationMeters:0,unreachableFeet:0,
  };
  constructor(character:SemanticCharacter,ground:GroundContactSurface={heightAt:()=>0}) {
    this.surface=ground;
    const graph:AnatomicalGraphV1=character.graph;
    const role=(name:string)=>{
      const candidates=graph.joints.filter(j=>j.role===name);
      if(candidates.length!==1)throw new Error("Ground contact joint not unique: "+name);
      return character.joint(candidates[0]!.id);
    };
    character.root.updateWorldMatrix(true,true);
    this.chains=(["left","right"] as const).map(side=>{
      const hip=role("hip_"+side);
      const knee=role("knee_"+side);
      const ankle=role("ankle_"+side);
      const toe=role("toe_"+side);
      const ankleAt=ankle.getWorldPosition(new THREE.Vector3());
      const toeAt=toe.getWorldPosition(new THREE.Vector3());
      // Estimate sole from the lower of toe and ankle at this morphology.
      const soleOffset=Math.max(0,ankleAt.y-Math.min(toeAt.y,ankleAt.y));
      return {hip,knee,ankle,toe,anchor:ankleAt.clone(),previous:ankleAt.clone(),
        soleOffset,planted:false,blend:0};
    });
  }
  get status():GroundContactMetrics {return {...this.metrics};}
  reset():void {
    this.live();
    for(const chain of this.chains){chain.planted=false;chain.blend=0;
      chain.ankle.getWorldPosition(chain.previous);
    }
    this.metrics={plantedFeet:0,maxAnchorSlipMeters:0,
      maxPenetrationMeters:0,unreachableFeet:0};
  }
  private live():void {if(this.disposed)throw new Error("Ground contacts disposed");}
  /**
   * Run after the authored FK pose and the skin correctives have been applied.
   * threshold/velocity depend on anatomy and actual elapsed time, not named
   * clips. The optional world actor transform is never mutated.
   */
  apply(deltaSeconds:number,grounded:boolean):GroundContactMetrics {
    this.live();
    if(!Number.isFinite(deltaSeconds)||deltaSeconds<0||deltaSeconds>1)
      throw new Error("Invalid foot contact delta");
    let plantedFeet=0,maxAnchorSlipMeters=0,maxPenetrationMeters=0,unreachableFeet=0;
    const dt=Math.max(deltaSeconds,1/120);
    for(const chain of this.chains){
      chain.hip.updateWorldMatrix(true,true);
      const ankle=chain.ankle.getWorldPosition(this.a);
      const ground=this.surface.heightAt(ankle.x,ankle.z);
      if(ground===undefined||!Number.isFinite(ground)||!grounded){
        chain.planted=false;chain.blend=0;chain.previous.copy(ankle);
        continue;
      }
      const soleY=ankle.y-chain.soleOffset;
      const proximity=Math.abs(soleY-ground);
      const speed=ankle.distanceTo(chain.previous)/dt;
      // Contact must be near terrain and moving slowly; an anchored foot
      // keeps its contact until rise/velocity suggests takeoff.
      const enter=proximity<=.055&&speed<.8;
      const keep=proximity<=.09&&speed<1.35;
      if(!chain.planted&&enter){
        chain.anchor.copy(ankle);
        chain.anchor.y=ground+chain.soleOffset;
        chain.planted=true;
      }else if(chain.planted&&!keep)chain.planted=false;
      chain.previous.copy(ankle);
      const desired=chain.planted?1:0;
      chain.blend+=Math.min(1,dt/(desired? .09:.11))*(desired-chain.blend);
      if(chain.blend<.0001){chain.blend=0;continue;}
      // Plant target stays fixed in world space; during release it approaches
      // current authored ankle smoothly. Reachability is measured and clamped.
      this.scratch.copy(ankle).lerp(chain.anchor,chain.blend);
      this.scratch.y=Math.max(ground+chain.soleOffset,this.scratch.y);
      const hip=chain.hip.getWorldPosition(this.b);
      const knee=chain.knee.getWorldPosition(this.c);
      const upper=hip.distanceTo(knee);
      const lower=knee.distanceTo(ankle);
      if(upper<minReach||lower<minReach){unreachableFeet++;continue;}
      const distance=hip.distanceTo(this.scratch);
      const maxReach=(upper+lower)*.985;
      const minDistance=Math.abs(upper-lower)+.012;
      if(distance>maxReach||distance<minDistance){
        unreachableFeet++;
        this.scratch.sub(hip).setLength(THREE.MathUtils.clamp(distance,minDistance,maxReach)).add(hip);
      }
      // Two-bone CCD, bounded to four alternating adjustments. The source
      // knee's existing bend plane is retained; one frame is never allowed
      // to rotate a joint by more than 0.17 radians per iteration.
      for(let iter=0;iter<4;iter++){
        this.rotateToward(chain.knee,chain.ankle,this.scratch,.17);
        this.rotateToward(chain.hip,chain.ankle,this.scratch,.17);
      }
      chain.hip.updateWorldMatrix(true,true);
      chain.ankle.getWorldPosition(this.after);
      if(chain.planted){
        plantedFeet++;
        maxAnchorSlipMeters=Math.max(maxAnchorSlipMeters,
          this.after.distanceTo(chain.anchor));
      }
      maxPenetrationMeters=Math.max(maxPenetrationMeters,
        Math.max(0,ground-(this.after.y-chain.soleOffset)));
    }
    this.metrics={plantedFeet,maxAnchorSlipMeters,maxPenetrationMeters,unreachableFeet};
    return this.status;
  }
  private rotateToward(joint:THREE.Object3D,end:THREE.Object3D,
    target:THREE.Vector3,maxAngle:number):void {
    joint.updateWorldMatrix(true,true);
    const pivot=joint.getWorldPosition(this.a);
    const from=end.getWorldPosition(this.b).sub(pivot).normalize();
    const to=this.delta.copy(target).sub(pivot).normalize();
    if(from.lengthSq()<.5||to.lengthSq()<.5)return;
    const radians=Math.acos(THREE.MathUtils.clamp(from.dot(to),-1,1));
    if(radians<.00001)return;
    this.bend.crossVectors(from,to);
    if(this.bend.lengthSq()<1e-10)return;
    this.bend.normalize();
    this.rotation.setFromAxisAngle(this.bend,Math.min(radians,maxAngle));
    joint.getWorldQuaternion(this.worldQ);
    this.worldQ.premultiply(this.rotation);
    joint.parent?.getWorldQuaternion(this.parentQ);
    joint.quaternion.copy(this.parentQ.invert().multiply(this.worldQ)).normalize();
    joint.updateWorldMatrix(true,true);
  }
  dispose():void {
    if(this.disposed)return;
    this.chains.length=0;this.disposed=true;
  }
}
