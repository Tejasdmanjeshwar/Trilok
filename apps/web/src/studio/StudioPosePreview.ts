import {AnatomicalFK} from "../characters/geometry/AnatomicalFK";
import {anatomicalPoseById,resolveAnatomicalPose} from "../characters/geometry/AnatomicalPoseMatrix";
import {HumanPoseCorrectives} from "../characters/geometry/HumanPoseCorrectives";
import {coordinateFacialJawPose} from "../characters/geometry/MakeHumanFacialTargets";
import type {StudioHumanModel} from "./StudioHumanModel";
import {calibrateGripSpreads,swordGripTargets,type GripSpreads} from "./StudioWeaponGrip";
import {isTwoHandEquipment,primaryHand,twoHandKind,solveTwoHandIK,type EquipmentChoice,
  type TwoHandIKResult} from "./StudioTwoHandGrip";
import {STUDIO_POSES,type StudioPose} from "./StudioInspection";
import {solveArcheryPose,isBowEquipment,type ArcheryPoseResult,
  type ArcheryState,type ArcheryTransitionGuide} from "./StudioArchery";
import {twoHandGripContactWorld} from "./StudioTwoHandGrip";
import {oppositeHand} from "./StudioArchery";
import {bowNockLocal} from "./StudioBowGeometry";
import {measureSourceArrowShaft} from "./StudioArrowRest";
import {sourceHandSamples,measureSourceStringContact,
  measureSourceCylinder} from "./StudioSourceContact";
import {isAcceptableBowContact} from "./StudioBowContact";
import {isSwordShieldEquipment,shieldHand,solveShieldPose,type ShieldPoseResult,
  type ShieldStance} from "./StudioShieldGrip";

/** One FK evaluator per owned human. Same calibrated rig and target matrix as Lab.
 * Nothing is written into morphology recipes, history or combat simulation. */
export class StudioPosePreview {
  private readonly fk:AnatomicalFK;
  private readonly spreads:Readonly<Record<"left"|"right",GripSpreads>>;
  private correctives?:HumanPoseCorrectives;
  private current:StudioPose="neutral";
  private grip:EquipmentChoice="none";
  private result:TwoHandIKResult|undefined;
  private shieldResult:ShieldPoseResult|undefined;
  private shieldStance:ShieldStance="guard";
  private archeryState:ArcheryState="rest";
  private archeryDraw=1;
  private archeryResult?:ArcheryPoseResult;
  /** Per-generated-character solved source endpoints. Do not recompute
   * expensive source-skinned contact fits on every partial slider change. */
  private archeryGuide?:Readonly<{
    pose:StudioPose;hand:"left"|"right";value:ArcheryTransitionGuide;
  }>;
  /** A failed nock/aim endpoint must also be remembered for this unchanged
   * generated character and pose. Otherwise each partial-draw input repeats
   * both expensive rejected endpoint fits before its own constrained solve.
   * This is a single bounded status record, never a cached posed-skin sample. */
  private archeryEndpointsAttempted?:Readonly<{
    pose:StudioPose;hand:"left"|"right";
  }>;
  get bowPoseResult():ArcheryPoseResult|undefined{return this.archeryResult;}
  setArcheryState(state:ArcheryState):void{
    this.archeryState=state;
    this.setPose(this.current);
  }
  setArcheryDraw(value:number):void{
    if(!Number.isFinite(value)||value<0||value>1)
      throw new Error("Invalid archery draw");
    if(value===this.archeryDraw)return;
    this.archeryDraw=value;
    // The slider interpolates partial draw only. Retain its value for a
    // later partial state without re-solving settled rest/nock/aim/release.
    if(isBowEquipment(this.grip)&&this.archeryState==="partial")
      this.setPose(this.current);
  }
  get shieldPoseResult():ShieldPoseResult|undefined{return this.shieldResult;}
  setShieldStance(stance:ShieldStance):void{
    if(!["guard","attack-ready","parry"].includes(stance))throw new Error("Unknown shield stance");
    this.shieldStance=stance;this.refresh();
  }
  get twoHandResult():TwoHandIKResult|undefined{return this.result;}
  setGrip(hand:EquipmentChoice):void{
    if(hand!==this.grip){
      this.archeryGuide=undefined;
      this.archeryEndpointsAttempted=undefined;
    }
    this.grip=hand;
    this.setPose(this.current);
  }
  constructor(private readonly model:StudioHumanModel,
    archery?:Readonly<{state:ArcheryState;draw:number}>){
    if(archery){
      this.archeryState=archery.state;
      this.archeryDraw=archery.draw;
    }
    const h=model.human;
    this.fk=new AnatomicalFK(h.spike.graph,h.spike.bones,{
      jawTipWorldRest:h.jawTipWorldRest,
      forearmSkinBones:h.spike.forearmSkinBones,
      shoulderSkinBones:h.spike.shoulderSkinBones,
    });
    this.spreads={
      left:calibrateGripSpreads(h.spike.graph,h.spike.bones,this.fk.frames,"left"),
      right:calibrateGripSpreads(h.spike.graph,h.spike.bones,this.fk.frames,"right"),
    };
  }
  setPose(id:StudioPose):void{
    if(!Object.hasOwn(STUDIO_POSES,id))throw new Error("Unknown preview pose");
    if(id!==this.current){
      this.archeryGuide=undefined;
      this.archeryEndpointsAttempted=undefined;
    }
    const human=this.model.human;
    const commands=resolveAnatomicalPose(anatomicalPoseById(id),
      human.spike.graph,this.fk);
    const dual=isSwordShieldEquipment(this.grip);
    const grip=this.grip==="none"||isTwoHandEquipment(this.grip)||isBowEquipment(this.grip)?[]:
      isSwordShieldEquipment(this.grip)?(()=>{
        const swordSide=this.grip.endsWith("right")?"right":"left";
        const offhand=shieldHand(swordSide);
        return [...swordGripTargets(human.spike.graph,swordSide,this.spreads[swordSide]),
          ...swordGripTargets(human.spike.graph,offhand,this.spreads[offhand])];
      })():swordGripTargets(human.spike.graph,this.grip,this.spreads[this.grip]);
    const covered=new Set(grip.map(c=>c.jointId+"/"+c.motion));
    const composed=[...commands.filter(c=>!covered.has(c.jointId+"/"+c.motion)),...grip];
    const jaw=human.spike.graph.joints.find(j=>j.role==="jaw")?.id;
    const effective=coordinateFacialJawPose(composed,jaw,this.model.sourceJawOpeningRadians);
    if(!this.correctives&&(isTwoHandEquipment(this.grip)||dual||isBowEquipment(this.grip)||
      id!=="neutral"&&commands.some(c=>human.spike.graph.joints.some(j=>
        j.id===c.jointId&&/^(shoulder|hip)_/.test(j.role))))){
      this.correctives=new HumanPoseCorrectives(human);
    }
    // C3 presentation morphs must not change source geometry while C5
    // re-solves authoritative anatomical FK/contact. A preceding aim state
    // otherwise leaves shoulder-corrective influences active and makes the
    // next refresh depend on the previously viewed state.
    this.correctives?.apply([]);
    this.result=undefined;
    this.shieldResult=undefined;
    this.archeryResult=undefined;
    if(isBowEquipment(this.grip)){
      const hand=this.grip.endsWith("right")?"right":"left";
      if(this.archeryGuide?.pose!==id||this.archeryGuide.hand!==hand)
        this.archeryGuide=undefined;
      if(this.archeryEndpointsAttempted?.pose!==id||
        this.archeryEndpointsAttempted.hand!==hand)
        this.archeryEndpointsAttempted=undefined;
      if(this.archeryState==="partial"&&!this.archeryGuide&&
        !this.archeryEndpointsAttempted){
        // Endpoints are solved with the same legal FK and strict source-skin
        // contact gates as normal preview states. No manufactured hand pose.
        const nock=solveArcheryPose(this.model,this.fk,effective,hand,"nock",1);
        const nockGrip=nock.reachable?
          twoHandGripContactWorld(this.model,hand).clone():undefined;
        const aim=solveArcheryPose(this.model,this.fk,effective,hand,"aim",1);
        const aimGrip=aim.reachable?
          twoHandGripContactWorld(this.model,hand).clone():undefined;
        if(nockGrip&&aimGrip)
          this.archeryGuide={pose:id,hand,value:{
            nock:{commands:nock.commands,gripWorld:nockGrip},
            aim:{commands:aim.commands,gripWorld:aimGrip},
          }};
        // Remember even unreachable endpoints: the next distinct slider
        // amount still undergoes its own full IK/source-skin validation.
        this.archeryEndpointsAttempted={pose:id,hand};
      }
      this.archeryResult=solveArcheryPose(this.model,this.fk,effective,
        hand,this.archeryState,this.archeryDraw,this.archeryGuide?.value);
    }else if(dual){
      const swordSide=this.grip.endsWith("right")?"right":"left";
      this.shieldResult=solveShieldPose(this.model,this.fk,effective,
        shieldHand(swordSide),this.shieldStance);
    }else if(isTwoHandEquipment(this.grip)){
      this.result=solveTwoHandIK(this.model,this.fk,effective,primaryHand(this.grip)!,twoHandKind(this.grip));
      // No second arm snap on unreachable targets; the solver restores the
      // input pose and returns a descriptive status without changing the root.
    }else this.fk.apply(effective);
    this.correctives?.apply(this.result?.reachable?this.result.commands:
      this.shieldResult?.commands??this.archeryResult?.commands??effective);
    human.spike.character.root.updateWorldMatrix(true,true);
    this.current=id;
  }
  /** Worker-only transition: the last validated source pose stays visible
   * until a separate source-skinned solver accepts a new draw. */
  stagePartialDraw():void{
    if(!isBowEquipment(this.grip))
      throw new Error("No source bow equipped for deferred partial draw");
    this.archeryState="partial";
  }
  /** Only adopt a result from the identically generated source once the
   * viewport has verified model/generation/hand/pose/root ownership.
   * Recheck full-resolution posed source finger/string and arrow/hand
   * clearance against the LIVE source before changing rendered props.
   * A rejected result restores the last legal FK and corrective pose.
   */
  acceptWorkerPartial(draw:number,result:ArcheryPoseResult):boolean{
    if(!isBowEquipment(this.grip)||this.archeryState!=="partial"||
      result.state!=="partial"||
      result.hand!==(this.grip.endsWith("right")?"right":"left")||
      !Number.isFinite(draw)||draw<0||draw>1)
      throw new Error("Mismatched worker source pose");
    if(!result.reachable)return false;
    const before=this.archeryResult;
    const restore=()=>{
      this.correctives?.apply([]);
      if(before)this.fk.apply(before.commands);
      this.correctives?.apply(before?.commands??[]);
    };
    try{
      this.correctives?.apply([]);
      this.fk.apply(result.commands);
      const scale=result.descriptor.limbLengthMeters/.64;
      // Complete original source-region vertices, not IK downsampling:
      // revalidate against this actual posed rendering character.
      const drawSide=oppositeHand(result.hand);
      const bowTip=(side:1|-1)=>bowNockLocal(result.descriptor,side)
        .applyMatrix4(result.bowWorld);
      const gaps=measureSourceStringContact(this.model,
        sourceHandSamples(this.model,drawSide),result.nockWorld,
        bowTip(1),bowTip(-1),.0018*scale,.055*scale);
      const bowSkin=sourceHandSamples(this.model,result.hand);
      // The worker's earlier calibrated grip report cannot substitute for
      // the LIVE final rendered hand. Recheck every original volar region
      // against the same strict finite-cylinder acceptance used by C5.4.
      const grasp=measureSourceCylinder(this.model,bowSkin,result.bowWorld,
        result.descriptor.handleRadiusMeters,
        result.descriptor.handleLengthMeters);
      const shaft=measureSourceArrowShaft(this.model,
        bowSkin,result.bowWorld,
        result.nockWorld.clone().applyMatrix4(result.bowWorld.clone().invert()),
        result.descriptor.arrowLengthMeters,
        result.descriptor.arrowRest.shaftRadiusMeters);
      if(!isAcceptableBowContact(grasp)||
        !Number.isFinite(gaps.index)||!Number.isFinite(gaps.middle)||
        gaps.index>=.008*scale||gaps.middle>=.008*scale||
        shaft.some(x=>!Number.isFinite(x.nearestSurfaceClearanceMeters)||
          x.nearestSurfaceClearanceMeters<-.001*scale))
        throw new Error("Worker source-skin contact rejected by live character");
      this.archeryDraw=draw;
      this.archeryResult=result;
      this.correctives?.apply(result.commands);
      this.model.human.spike.character.root.updateWorldMatrix(true,true);
      return true;
    }catch(error){
      restore();
      throw error;
    }
  }
  /** Invalidate calibrated source contacts after in-place face/source edits.
   * Regeneration creates a new preview and needs no explicit invalidation. */
  invalidateSourceContact():void{
    this.archeryGuide=undefined;
    this.archeryEndpointsAttempted=undefined;
  }
  /** Re-evaluate the same generated source without discarding valid endpoints.
   * Explicit source edits must call invalidateSourceContact() first. */
  refresh():void{this.setPose(this.current);}
  dispose():void{
    this.result=undefined;
    this.shieldResult=undefined;
    this.archeryResult=undefined;
    this.archeryGuide=undefined;
    this.archeryEndpointsAttempted=undefined;
    this.fk.apply([]);
    this.correctives?.dispose();
  }
}
