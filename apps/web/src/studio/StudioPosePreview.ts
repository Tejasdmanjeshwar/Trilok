import {AnatomicalFK} from "../characters/geometry/AnatomicalFK";
import {anatomicalPoseById,resolveAnatomicalPose} from "../characters/geometry/AnatomicalPoseMatrix";
import {HumanPoseCorrectives} from "../characters/geometry/HumanPoseCorrectives";
import {coordinateFacialJawPose} from "../characters/geometry/MakeHumanFacialTargets";
import type {StudioHumanModel} from "./StudioHumanModel";
import {STUDIO_POSES,type StudioPose} from "./StudioInspection";

/** One FK evaluator per owned human. Same calibrated rig and target matrix as Lab.
 * Nothing is written into morphology recipes, history or combat simulation. */
export class StudioPosePreview {
  private readonly fk:AnatomicalFK;
  private correctives?:HumanPoseCorrectives;
  private current:StudioPose="neutral";
  constructor(private readonly model:StudioHumanModel){
    const h=model.human;
    this.fk=new AnatomicalFK(h.spike.graph,h.spike.bones,{
      jawTipWorldRest:h.jawTipWorldRest,
      forearmSkinBones:h.spike.forearmSkinBones,
      shoulderSkinBones:h.spike.shoulderSkinBones,
    });
  }
  setPose(id:StudioPose):void{
    if(!Object.hasOwn(STUDIO_POSES,id))throw new Error("Unknown preview pose");
    const human=this.model.human;
    const commands=resolveAnatomicalPose(anatomicalPoseById(id),
      human.spike.graph,this.fk);
    const jaw=human.spike.graph.joints.find(j=>j.role==="jaw")?.id;
    const effective=coordinateFacialJawPose(commands,jaw,this.model.sourceJawOpeningRadians);
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
