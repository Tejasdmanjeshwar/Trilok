import * as THREE from "three";
import type {AnatomicalGraphV1} from "@trilok/character-core";
import type {SemanticCharacter} from "../characters/runtime/SemanticCharacter";
import type {JointFrame,JointFreedom} from "../characters/geometry/AnatomicalFK";

/**
 * Reusable presentation-only foot contact pass. An explicit ground-height
 * callback permits a future simulation-provided terrain sampler. It cannot
 * set actor world position or decide collisions.
 */
export interface GroundContactSurface {
  /** Simulation/collision-owned height query in world metres; undefined is unknown. */
  heightAt(x:number,z:number): number | undefined;
}
export interface GroundContactMetrics {
  readonly plantedFeet:number;
  readonly maxAnchorSlipMeters:number;
  readonly maxPenetrationMeters:number;
  readonly unreachableFeet:number;
  /** Actual deformed skin was available for this many feet (0–2). */
  readonly sampledSoleFeet?:number;
  /** Pose-only vertical pelvis correction, never actor/root translation. */
  readonly pelvisOffsetMeters?:number;
  /** Contact-eligibility diagnostics; these are observations, not plant markers. */
  readonly nearestSoleGapMeters?:number;
  readonly nearestSoleSpeedMetersPerSecond?:number;
  readonly nearGroundFeet?:number;
  readonly rawSolePenetrationMeters?:number;
}
interface FootChain {
  hip:THREE.Object3D;
  knee:THREE.Object3D;
  /** Per-morphology calibrated C5 joints, not arbitrary CCD axes. */
  hipFlex?:JointFreedom;
  hipAbduct?:JointFreedom;
  kneeFlex?:JointFreedom;
  ankleFlex?:JointFreedom;
  ankle:THREE.Object3D;
  toe:THREE.Object3D;
  anchor:THREE.Vector3;
  previous:THREE.Vector3;
  soleOffset:number;
  /** Two measured skin vertices, calibrated once per regenerated morphology. */
  samples:readonly {mesh:THREE.SkinnedMesh;index:number}[];
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
  private readonly sourceQ=new THREE.Quaternion();
  private readonly worldAxis=new THREE.Vector3();
  private readonly localAxis=new THREE.Vector3();
  private readonly neutral=new THREE.Quaternion();
  private readonly correction=new Map<string,number>();
  private readonly delta=new THREE.Vector3();
  private readonly a=new THREE.Vector3();
  private readonly b=new THREE.Vector3();
  private readonly c=new THREE.Vector3();
  private readonly rotation=new THREE.Quaternion();
  private readonly after=new THREE.Vector3();
  private readonly ankleRaw=new THREE.Vector3();
  private readonly sole=new THREE.Vector3();
  private readonly heel=new THREE.Vector3();
  private readonly toeSample=new THREE.Vector3();
  private readonly previousRoot=new THREE.Vector3();
  private readonly rootMovement=new THREE.Vector3();
  private readonly worldRoot=new THREE.Vector3();
  private readonly worldFootMovement=new THREE.Vector3();
  private readonly localShift=new THREE.Vector3();
  private readonly pelvisRotation=new THREE.Quaternion();
  private readonly up=new THREE.Vector3(0,1,0);
  private readonly pelvis?:THREE.Object3D;
  private readonly footSamples:number;
  private readonly root:THREE.Object3D;
  private rootObserved=false;
  private pelvisHeight=0;
  private pelvisLateral=0;
  private pelvisLean=0;
  private readonly lastCorrectedPosition=new THREE.Vector3();
  private readonly lastCorrectedOrientation=new THREE.Quaternion();
  private readonly sourcePelvisPosition=new THREE.Vector3();
  private readonly sourcePelvisOrientation=new THREE.Quaternion();
  private hasLastCorrection=false;
  private metrics:GroundContactMetrics={
    plantedFeet:0,maxAnchorSlipMeters:0,maxPenetrationMeters:0,unreachableFeet:0,
  };
  constructor(character:SemanticCharacter,ground:GroundContactSurface={heightAt:()=>0},
    frames?:ReadonlyMap<string,JointFrame>) {
    this.surface=ground;
    this.root=character.root;
    const graph:AnatomicalGraphV1=character.graph;
    const pelvisId=graph.joints.find(j=>j.role==="pelvis")?.id;
    this.pelvis=pelvisId?character.joint(pelvisId):undefined;
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
      const calibrated=(roleName:string,motion:"flexion"|"abduction")=>{
        const id=graph.joints.find(j=>j.role===roleName)?.id;
        return id?frames?.get(id)?.freedoms.get(motion):undefined;
      };
      const samples=this.calibrateSole(character.root,ankle,toe);
      const previous=ankleAt.clone().addScaledVector(this.up,-soleOffset);
      if(samples.length===2){
        this.skinWorld(samples[0]!,this.heel);
        this.skinWorld(samples[1]!,this.toeSample);
        previous.copy(this.heel).add(this.toeSample).multiplyScalar(.5);
        previous.y=Math.min(this.heel.y,this.toeSample.y);
      }
      return {hip,knee,ankle,toe,samples,
        hipFlex:calibrated("hip_"+side,"flexion"),
        hipAbduct:calibrated("hip_"+side,"abduction"),
        kneeFlex:calibrated("knee_"+side,"flexion"),
        ankleFlex:calibrated("ankle_"+side,"flexion"),
        anchor:previous.clone(),previous,
        soleOffset,planted:false,blend:0};
    });
    this.footSamples=this.chains.filter(c=>c.samples.length===2).length;
  }
  /**
   * Determine heel/toe support from actual bound, currently skinned vertices.
   * Calibrated once per character: mesh and bone identities are not shared
   * across regeneration. Never uses a fixed footwear thickness.
   */
  private calibrateSole(root:THREE.Object3D,ankle:THREE.Object3D,
    toe:THREE.Object3D):readonly {mesh:THREE.SkinnedMesh;index:number}[]{
    const at=ankle.getWorldPosition(new THREE.Vector3());
    const front=toe.getWorldPosition(new THREE.Vector3());
    const direction=front.clone().sub(at);direction.y=0;
    const length=direction.length();
    if(length<.015)return [];
    direction.normalize();
    let heel:{mesh:THREE.SkinnedMesh;index:number;score:number}|undefined;
    let tip:typeof heel;
    root.traverse(object=>{
      if(!(object instanceof THREE.SkinnedMesh))return;
      const mesh=object;
      const ankleIndex=mesh.skeleton.bones.indexOf(ankle as THREE.Bone);
      const toeIndex=mesh.skeleton.bones.indexOf(toe as THREE.Bone);
      if(ankleIndex<0||toeIndex<0)return;
      const positions=mesh.geometry.getAttribute("position");
      const indices=mesh.geometry.getAttribute("skinIndex");
      const weights=mesh.geometry.getAttribute("skinWeight");
      if(!positions||!indices||!weights)return;
      mesh.updateWorldMatrix(true,false);
      const v=new THREE.Vector3(),offset=new THREE.Vector3();
      for(let i=0;i<positions.count;i++){
        let footWeight=0;
        for(let k=0;k<4;k++){
          const bone=indices.getComponent(i,k);
          if(bone===ankleIndex||bone===toeIndex)
            footWeight+=weights.getComponent(i,k);
        }
        if(footWeight<.25)continue;
        v.fromBufferAttribute(positions,i);
        mesh.applyBoneTransform(i,v).applyMatrix4(mesh.matrixWorld);
        offset.copy(v).sub(at);
        const along=offset.dot(direction);
        const transverse=offset.clone().addScaledVector(direction,-along).length();
        if(along<-.12||along>length+.12||transverse>.16||
          Math.abs(v.y-at.y)>.25)continue;
        // Height decides sole contact; a small proximity penalty excludes
        // off-foot vertices when weights spill across nearby regions.
        const score=v.y+.03*transverse;
        const candidate={mesh,index:i,score};
        if(along<=length*.55&&(!heel||score<heel.score))heel=candidate;
        if(along>=length*.3&&(!tip||score<tip.score))tip=candidate;
      }
    });
    if(!heel||!tip||heel.mesh===tip.mesh&&heel.index===tip.index)return [];
    return [heel,tip];
  }
  private skinWorld(sample:{mesh:THREE.SkinnedMesh;index:number},
    out:THREE.Vector3):THREE.Vector3{
    const mesh=sample.mesh;
    out.fromBufferAttribute(mesh.geometry.getAttribute("position"),sample.index);
    mesh.applyBoneTransform(sample.index,out);
    return out.applyMatrix4(mesh.matrixWorld);
  }
  private measureSole(chain:FootChain,ankle:THREE.Vector3,
    out:THREE.Vector3):THREE.Vector3 {
    if(chain.samples.length===2){
      this.skinWorld(chain.samples[0]!,this.heel);
      this.skinWorld(chain.samples[1]!,this.toeSample);
      out.copy(this.heel).add(this.toeSample).multiplyScalar(.5);
      out.y=Math.min(this.heel.y,this.toeSample.y);
    }else out.copy(ankle).addScaledVector(this.up,-chain.soleOffset);
    return out;
  }
  get status():GroundContactMetrics {return {...this.metrics};}
  reset():void {
    this.live();
    if(this.pelvis&&this.hasLastCorrection &&
      this.pelvis.position.distanceToSquared(this.lastCorrectedPosition)<1e-14 &&
      1-Math.abs(this.pelvis.quaternion.dot(this.lastCorrectedOrientation))<1e-12){
      this.pelvis.position.copy(this.sourcePelvisPosition);
      this.pelvis.quaternion.copy(this.sourcePelvisOrientation);
      this.pelvis.updateWorldMatrix(true,true);
    }
    for(const chain of this.chains){chain.planted=false;chain.blend=0;
      chain.ankle.getWorldPosition(this.ankleRaw);
      this.measureSole(chain,this.ankleRaw,chain.previous);
    }
    this.rootObserved=false;
    this.hasLastCorrection=false;
    this.pelvisHeight=0;this.pelvisLateral=0;this.pelvisLean=0;
    this.metrics={plantedFeet:0,maxAnchorSlipMeters:0,
      maxPenetrationMeters:0,unreachableFeet:0,pelvisOffsetMeters:0,
      sampledSoleFeet:this.footSamples};
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
    const dt=Math.max(deltaSeconds,1/120);
    // If a caller advances contact-only (without a new FK pose), undo the
    // preceding presentation residual before solving. New mixer/FK poses
    // are left untouched; successive contact passes must not accumulate.
    if(this.pelvis&&this.hasLastCorrection &&
      this.pelvis.position.distanceToSquared(this.lastCorrectedPosition)<1e-14 &&
      1-Math.abs(this.pelvis.quaternion.dot(this.lastCorrectedOrientation))<1e-12){
      this.pelvis.position.copy(this.sourcePelvisPosition);
      this.pelvis.quaternion.copy(this.sourcePelvisOrientation);
      this.pelvis.updateWorldMatrix(true,true);
    }
    if(this.pelvis){
      this.sourcePelvisPosition.copy(this.pelvis.position);
      this.sourcePelvisOrientation.copy(this.pelvis.quaternion);
    }
    let plantedFeet=0,maxAnchorSlipMeters=0,maxPenetrationMeters=0,unreachableFeet=0;
    let nearestSoleGapMeters=Infinity,nearestSoleSpeedMetersPerSecond=Infinity;
    let nearGroundFeet=0,rawSolePenetrationMeters=0;
    this.root.updateWorldMatrix(true,true);
    this.root.getWorldPosition(this.worldRoot);
    this.rootMovement.set(0,0,0);
    if(this.rootObserved)this.rootMovement.copy(this.worldRoot).sub(this.previousRoot);
    this.previousRoot.copy(this.worldRoot);this.rootObserved=true;
    const evidence=this.chains.map(chain=>{
      chain.hip.updateWorldMatrix(true,true);
      const ankle=chain.ankle.getWorldPosition(this.ankleRaw);
      const contact=this.measureSole(chain,ankle,this.sole);
      // Both measured ends must have valid terrain support: missing terrain
      // information is not evidence for an invented flat surface.
      const heelHeight=chain.samples.length===2?
        this.surface.heightAt(this.heel.x,this.heel.z):undefined;
      const toeHeight=chain.samples.length===2?
        this.surface.heightAt(this.toeSample.x,this.toeSample.z):undefined;
      const ground=chain.samples.length===2?
        (heelHeight!==undefined&&toeHeight!==undefined&&
          Number.isFinite(heelHeight)&&Number.isFinite(toeHeight)?
          Math.max(heelHeight,toeHeight):undefined):
        this.surface.heightAt(contact.x,contact.z);
      const available=ground!==undefined&&Number.isFinite(ground)&&grounded;
      // Ground contact is defined in the WORLD frame: subtracting actor
      // translation would incorrectly release a truly stationary planted
      // sole while the character walks past it.
      const speed=this.worldFootMovement.copy(contact).sub(chain.previous).length()/dt;
      const rise=Math.abs(contact.y-chain.previous.y)/dt;
      if(!available){
        chain.planted=false;chain.blend=0;chain.previous.copy(contact);
        return {chain,valid:false,ground:0,contact:contact.clone()};
      }
      const leg=chain.hip.getWorldPosition(this.b)
        .distanceTo(chain.knee.getWorldPosition(this.c))+
        chain.knee.getWorldPosition(this.c).distanceTo(ankle);
      // Scale by measured anatomy; phases are advisory, not contact markers.
      const enterHeight=Math.max(.025,leg*.065);
      const leaveHeight=Math.max(.045,leg*.12);
      const proximity=Math.abs(contact.y-ground);
      nearestSoleGapMeters=Math.min(nearestSoleGapMeters,proximity);
      nearestSoleSpeedMetersPerSecond=Math.min(nearestSoleSpeedMetersPerSecond,speed);
      if(proximity<=enterHeight)nearGroundFeet++;
      rawSolePenetrationMeters=Math.max(rawSolePenetrationMeters,Math.max(0,ground-contact.y));
      const enter=proximity<=enterHeight&&speed<1.1&&rise<.9;
      const keep=proximity<=leaveHeight&&speed<2&&rise<1.6;
      if(!chain.planted&&enter){
        chain.anchor.copy(contact);chain.anchor.y=ground;
        chain.planted=true;
      }else if(chain.planted&&!keep)chain.planted=false;
      chain.previous.copy(contact);
      const desired=chain.planted?1:0;
      chain.blend+=(1-Math.exp(-dt/(desired?.09:.11)))*(desired-chain.blend);
      if(chain.blend<1e-5)chain.blend=0;
      return {chain,valid:true,ground,contact:contact.clone()};
    });
    // Pose-only pelvis adjustment, after source FK and before residual leg IK.
    // Up/down follows observed contact residual; lateral shift and roll
    // favor the single support leg without modifying the gameplay actor.
    const support=evidence.filter(e=>e.valid&&e.chain.planted);
    if(this.pelvis&&this.chains.every(c=>c.hipFlex&&c.kneeFlex)){
      const heightTarget=grounded&&support.length?
        THREE.MathUtils.clamp(support.reduce((sum,e)=>
          sum+e.ground-e.contact.y,0)/support.length,-.035,.035):0;
      const parent=this.pelvis.parent;
      const pelvisWorld=this.pelvis.getWorldPosition(this.b);
      // Weight transfer is lateral in the CHARACTER frame, not world X:
      // the same pose must work when the actor turns toward any heading.
      const toward=support.length===1?
        this.localShift.copy(support[0]!.contact).sub(pelvisWorld)
          .dot(this.worldAxis.set(1,0,0)
            .transformDirection(this.root.matrixWorld)):0;
      const lateralTarget=grounded?
        THREE.MathUtils.clamp(toward*.12,-.024,.024):0;
      const response=1-Math.exp(-dt/.13);
      this.pelvisHeight+=(heightTarget-this.pelvisHeight)*response;
      this.pelvisLateral+=(lateralTarget-this.pelvisLateral)*response;
      this.pelvisLean+=(THREE.MathUtils.clamp(-this.pelvisLateral*.85,-.03,.03)-
        this.pelvisLean)*response;
      this.localShift.set(this.pelvisLateral,this.pelvisHeight,0);
      if(parent) {
        parent.getWorldQuaternion(this.sourceQ).invert();
        this.localShift.applyQuaternion(this.sourceQ);
      }
      // FK supplies the untouched authored pose each frame; no pelvis/root
      // drift is stored in game state or injected into animation assets.
      this.pelvis.position.add(this.localShift);
      this.pelvisRotation.setFromAxisAngle(this.worldAxis.set(0,0,1),this.pelvisLean);
      this.pelvis.quaternion.multiply(this.pelvisRotation).normalize();
      this.pelvis.updateWorldMatrix(true,true);
    }
    if(this.pelvis){
      this.lastCorrectedPosition.copy(this.pelvis.position);
      this.lastCorrectedOrientation.copy(this.pelvis.quaternion);
      this.hasLastCorrection=true;
    }
    for(const item of evidence){
      const {chain,valid,ground,contact}=item;
      if(!valid||chain.blend<1e-5)continue;
      chain.ankle.getWorldPosition(this.a);
      // Anchor is a WORLD sole surface point. The ankle IK target is the
      // measured difference from that point to its current deformed skin.
      this.scratch.copy(this.a).addScaledVector(
        this.delta.copy(chain.anchor).sub(contact),chain.blend);
      const hip=chain.hip.getWorldPosition(this.b);
      const knee=chain.knee.getWorldPosition(this.c);
      const upper=hip.distanceTo(knee),lower=knee.distanceTo(this.a);
      if(upper<minReach||lower<minReach){
        unreachableFeet++;
        // The existing C5 bones are degenerate: do not force a fallback
        // rotation. Release support smoothly rather than retaining an anchor.
        chain.planted=false;
        chain.blend*=Math.exp(-dt/.11);
        continue;
      }
      const distance=hip.distanceTo(this.scratch);
      const maxReach=(upper+lower)*.985;
      const minDistance=Math.abs(upper-lower)+.012;
      if(distance>maxReach||distance<minDistance){
        unreachableFeet++;
        // No authored foot can remain planted beyond the measured reach.
        // Fade out support; clamp only the residual correction target, NOT
        // the gameplay root or the original world-space foot anchor.
        chain.planted=false;
        chain.blend*=Math.exp(-dt/.11);
        if(distance<1e-8)continue;
        this.scratch.sub(hip).setLength(
          THREE.MathUtils.clamp(distance,minDistance,maxReach)).add(hip);
      }
      this.correction.clear();
      for(let iter=0;iter<4;iter++){
        this.rotateBounded(chain.knee,chain.ankle,this.scratch,chain.kneeFlex,"knee",.14);
        this.rotateBounded(chain.hip,chain.ankle,this.scratch,chain.hipFlex,"hip-flex",.12);
        this.rotateBounded(chain.hip,chain.ankle,this.scratch,chain.hipAbduct,"hip-abduct",.075);
      }
      chain.hip.updateWorldMatrix(true,true);
      chain.ankle.getWorldPosition(this.after);
      let sole=this.measureSole(chain,this.after,this.sole);
      // On a verified support, use the two REAL skinned-foot sample points
      // and the caller's local terrain height to align ankle pitch to the
      // measured longitudinal slope. No new ankle freedom or tilt marker.
      if(chain.planted&&chain.samples.length===2&&chain.ankleFlex){
        const heelGround=this.surface.heightAt(this.heel.x,this.heel.z);
        const toeGround=this.surface.heightAt(this.toeSample.x,this.toeSample.z);
        if(heelGround!==undefined&&toeGround!==undefined&&
          Number.isFinite(heelGround)&&Number.isFinite(toeGround)){
          const groundRise=toeGround-heelGround;
          // Add the TERRAIN slope as a bounded residual. Preserve the
          // authored Kevin ankle/toe pitch on a flat surface; normal source
          // toe-off is not evidence of a sloped ground plane.
          const error=groundRise;
          if(Number.isFinite(error)&&Math.abs(error)>1e-5){
            chain.toe.getWorldPosition(this.after);
            this.scratch.copy(this.after);
            // A residual only, not a source-clip overwrite: constrain the
            // toe target by measured foot length and a gentle pitch budget.
            const along=this.toeSample.distanceTo(this.heel);
            this.scratch.y+=THREE.MathUtils.clamp(error,
              -along*.18,along*.18);
            this.rotateBounded(chain.ankle,chain.toe,this.scratch,
              chain.ankleFlex,"ankle-flex",.065);
            chain.ankle.getWorldPosition(this.after);
            sole=this.measureSole(chain,this.after,this.sole);
          }
        }
      }
      if(chain.planted){
        plantedFeet++;
        maxAnchorSlipMeters=Math.max(maxAnchorSlipMeters,
          sole.distanceTo(chain.anchor));
      }
      maxPenetrationMeters=Math.max(maxPenetrationMeters,Math.max(0,ground-sole.y));
    }
    this.metrics={plantedFeet,maxAnchorSlipMeters,maxPenetrationMeters,unreachableFeet,
      sampledSoleFeet:this.footSamples,
      pelvisOffsetMeters:this.pelvisHeight,
      nearestSoleGapMeters:Number.isFinite(nearestSoleGapMeters)?nearestSoleGapMeters:0,
      nearestSoleSpeedMetersPerSecond:Number.isFinite(nearestSoleSpeedMetersPerSecond)?
        nearestSoleSpeedMetersPerSecond:0,
      nearGroundFeet,rawSolePenetrationMeters};
    return this.status;
  }
  /**
   * Joint-local axis-constrained gradient descent. Every frame starts from
   * authored FK and is corrected only within a small residual envelope;
   * C5 calibrated limits are enforced against the source frame's existing
   * flexion component. No second representation of the skeleton is created.
   */
  private rotateBounded(joint:THREE.Object3D,end:THREE.Object3D,
    target:THREE.Vector3,freedom:JointFreedom|undefined,
    channel:string,maxCorrection:number):void {
    if(!freedom)return;
    joint.updateWorldMatrix(true,true);
    const pivot=joint.getWorldPosition(this.a);
    const endAt=end.getWorldPosition(this.b);
    const radius=this.delta.copy(endAt).sub(pivot);
    if(radius.lengthSq()<1e-8)return;
    // C5 freedom axes are stored in rest-local coordinates. Rotate with
    // current world orientation for a physical world-space response.
    this.worldAxis.copy(freedom.axis).transformDirection(joint.matrixWorld);
    const gradient=this.bend.crossVectors(this.worldAxis,radius);
    const denom=gradient.lengthSq();
    if(denom<1e-10)return;
    const desired=this.sourceQ; // scratch is a quaternion, not an extra pose.
    // Use a local-axis projection of the authored orientation for conservative
    // joint limits. Multi-DOF hip bounds still restrict residual magnitude.
    this.localAxis.copy(freedom.axis);
    const key=joint.uuid+"/"+channel;
    const applied=this.correction.get(key)??0;
    let step=THREE.MathUtils.clamp(
      gradient.dot(this.delta.copy(target).sub(endAt))/(denom+1e-8),-.07,.07);
    step=THREE.MathUtils.clamp(applied+step,-maxCorrection,maxCorrection)-applied;
    if(Math.abs(step)<1e-7)return;
    // Knee and ankle pitch are single C5 hinges. Extract their signed
    // twist to prohibit hyperextension and out-of-range foot dorsiflexion.
    if(channel==="knee"||channel==="ankle-flex"){
      this.neutral.copy(joint.quaternion);
      desired.set(this.localAxis.x*this.neutral.x+
        this.localAxis.y*this.neutral.y+
        this.localAxis.z*this.neutral.z,0,0,this.neutral.w);
      let angle=2*Math.atan2(desired.x,desired.w);
      if(angle>Math.PI)angle-=2*Math.PI;
      if(angle<-Math.PI)angle+=2*Math.PI;
      const allowable=THREE.MathUtils.clamp(angle+step,
        freedom.min,freedom.max)-angle;
      // A source FK pose can already exceed its nominal C5 residual range.
      // Never jump it all the way back to a bound (which would snap the skin);
      // simply refuse residual correction that cannot move safely.
      step=Math.abs(allowable)>Math.abs(step)?0:allowable;
    }
    if(Math.abs(step)<1e-7)return;
    this.correction.set(key,applied+step);
    // Physical local hinge rotation; bone parent and skin constraints remain
    // owned by the original semantic FK runtime.
    this.rotation.setFromAxisAngle(this.localAxis,step);
    joint.quaternion.multiply(this.rotation).normalize();
    joint.updateWorldMatrix(true,true);
  }
  dispose():void {
    if(this.disposed)return;
    this.chains.length=0;this.disposed=true;
  }
}
