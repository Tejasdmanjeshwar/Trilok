import {AnatomicalFK} from "../characters/geometry/AnatomicalFK";
import {anatomicalPoseById,resolveAnatomicalPose} from "../characters/geometry/AnatomicalPoseMatrix";
import {HumanPoseCorrectives} from "../characters/geometry/HumanPoseCorrectives";
import {coordinateFacialJawPose} from "../characters/geometry/MakeHumanFacialTargets";
import type {StudioHumanModel} from "./StudioHumanModel";
import {calibrateGripSpreads,swordGripTargets,type SwordHand,type GripSpreads} from "./StudioWeaponGrip";
import {STUDIO_POSES,type StudioPose} from "./StudioInspection";

/** One FK evaluator per owned human. Same calibrated rig and target matrix as Lab.
 * Nothing is written into morphology recipes, history or combat simulation. */
export class StudioPosePreview {
  private readonly fk:AnatomicalFK;
  private readonly spreads:Readonly<Record<"left"|"right",GripSpreads>>;
  private correctives?:HumanPoseCorrectives;
  private current:StudioPose="neutral";
  private grip:SwordHand="none";
  setGrip(hand:SwordHand):void{this.grip=hand;this.refresh();}
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
    const grip=this.grip==="none"?[]:swordGripTargets(human.spike.graph,this.grip,this.spreads[this.grip]);
    const covered=new Set(grip.map(c=>c.jointId+"/"+c.motion));
    const composed=[...commands.filter(c=>!covered.has(c.jointId+"/"+c.motion)),...grip];
    const jaw=human.spike.graph.joints.find(j=>j.role==="jaw")?.id;
    const effective=coordinateFacialJawPose(composed,jaw,this.model.sourceJawOpeningRadians);
    if(id!=="neutral"&&!this.correctives &&
      commands.some(c=>human.spike.graph.joints.some(j=>j.id===c.jointId&&
        /^(shoulder|hip)_/.test(j.role)))){
      this.correctives=new HumanPoseCorrectives(human);
    }
    this.fk.apply(effective);
    this.correctives?.apply(effective);
    human.spike.character.root.updateWorldMatrix(true,true);
    this.current=id;
  }
  refresh():void{this.setPose(this.current);}
  dispose():void{
    this.fk.apply([]);
    this.correctives?.dispose();
  }
}
