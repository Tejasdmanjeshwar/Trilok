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
  type ArcheryState} from "./StudioArchery";
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
  get bowPoseResult():ArcheryPoseResult|undefined{return this.archeryResult;}
  setArcheryState(state:ArcheryState):void{this.archeryState=state;this.refresh();}
  setArcheryDraw(value:number):void{this.archeryDraw=value;this.refresh();}
  get shieldPoseResult():ShieldPoseResult|undefined{return this.shieldResult;}
  setShieldStance(stance:ShieldStance):void{
    if(!["guard","attack-ready","parry"].includes(stance))throw new Error("Unknown shield stance");
    this.shieldStance=stance;this.refresh();
  }
  get twoHandResult():TwoHandIKResult|undefined{return this.result;}
  setGrip(hand:EquipmentChoice):void{this.grip=hand;this.refresh();}
  constructor(private readonly model:StudioHumanModel){
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
    this.result=undefined;
    this.shieldResult=undefined;
    this.archeryResult=undefined;
    if(isBowEquipment(this.grip)){
      this.archeryResult=solveArcheryPose(this.model,this.fk,effective,
        this.grip.endsWith("right")?"right":"left",this.archeryState,this.archeryDraw);
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
  refresh():void{this.setPose(this.current);}
  dispose():void{
    this.result=undefined;
    this.shieldResult=undefined;
    this.archeryResult=undefined;
    this.fk.apply([]);
    this.correctives?.dispose();
  }
}
