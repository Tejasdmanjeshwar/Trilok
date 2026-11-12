import { anatomyId } from "./ids";
import { CHARACTER_COORDINATES, type AnatomicalGraphV1, type AnatomyModuleV1,
  type AnatomySegmentV1, type CharacterRecipeV1, type SemanticJointV1,
  type SemanticSocketV1, type Vec3 } from "./schema";
import { validateAnatomicalGraph, validateCharacterRecipe } from "./validate";

export type CharacterArchetypeV1 = "human" | "rakshasa" | "vanara" | "jatayu" | "animal_head";
export interface PresetOptionsV1 {
  readonly archetype?: CharacterArchetypeV1;
  readonly extraArmPairs?: number;
  readonly extraLegPairs?: number;
  readonly extraHeads?: number;
  readonly animalHeadKind?: "primate" | "avian" | "bear";
}
const identity=[0,0,0,1] as const;
const FOUNDATION="humanoid[0]";
const torsoCap="bow_draw";
interface MutableModule {
  id:string; kind: AnatomyModuleV1["kind"]; topologyFamilyId:string;
  attachedToSegment:string|null; segmentIds:string[]; jointIds:string[];
}
/** A deterministic, structural A-pose descriptor, not a skinned art asset. */
export function createAnatomyPreset(options:PresetOptionsV1={}): AnatomicalGraphV1 {
  const archetype=options.archetype??"human";
  const arms=options.extraArmPairs??0, legs=options.extraLegPairs??0, heads=options.extraHeads??0;
  if(!["human","rakshasa","vanara","jatayu","animal_head"].includes(archetype) ||
      ![arms,legs,heads].every(x=>Number.isSafeInteger(x)&&x>=0&&x<=2))
    throw new Error("Invalid archetype extension count");
  const modules:MutableModule[]=[];
  const segments:AnatomySegmentV1[]=[];
  const joints:SemanticJointV1[]=[];
  const sockets:SemanticSocketV1[]=[];
  let module:MutableModule;
  function begin(id:string,kind:MutableModule["kind"],parent:string|null,family:string):void{
    module={id,kind,attachedToSegment:parent,topologyFamilyId:family,segmentIds:[],jointIds:[]};
    modules.push(module);
  }
  function add(path:string,role:string,parentSegment:string|null,translation:Vec3,
    caps:readonly string[]=[],regions:readonly string[]=[]):string {
    const id=anatomyId(module.id,path);
    const jointId=id+"/joint";
    const parentJointId=parentSegment===null?null:segments.find(s=>s.id===parentSegment)?.proximalJointId;
    if(parentSegment!==null && !parentJointId)throw new Error("Missing builder parent segment");
    segments.push({id,moduleId:module.id,parentId:parentSegment,proximalJointId:jointId,
      combatRegionIds:regions,capabilityIds:caps});
    joints.push({id:jointId,segmentId:id,parentId:parentJointId??null,role,
      bindTranslation:translation.map(n=>Object.is(n,-0)?0:n) as unknown as Vec3,bindQuaternion:identity,exported:true});
    module.segmentIds.push(id);module.jointIds.push(jointId);
    return id;
  }
  function socket(owner:string,purpose:SemanticSocketV1["purpose"],suffix:string,
    translation:Vec3,caps:readonly string[]=[]):void {
    const joint=segments.find(s=>s.id===owner)?.proximalJointId;
    if(!joint)throw new Error("Socket without joint");
    sockets.push({id:owner+"/socket/"+suffix,purpose,ownerSegmentId:owner,parentJointId:joint,
      localTranslation:translation,localQuaternion:identity,requiredCapabilityIds:caps});
  }
  begin(FOUNDATION,"humanoid",null,"humanoid_biped_v1");
  const pelvis=add("pelvis","pelvis",null,[0,.93,0]);
  const spine=add("spine/lower","spine_lower",pelvis,[0,.14,0],[],["torso","body"]);
  const chest=add("spine/chest","chest",spine,[0,.30,0],[],["torso"]);
  const neck=add("neck","neck",chest,[0,.26,0],[],["neck"]);
  const head=add("head[0]","head",neck,[0,.17,0],["look_head_0"],["head"]);
  add("head[0]/jaw","jaw",head,[0,-.10,.09]);
  socket(chest,"back","back",[0,.05,-.20]);
  socket(pelvis,"hip","hip",[.18,-.08,-.10]);
  for(const [side,sign] of [["left",-1],["right",1]] as const) {
    const clavicle=add("clavicle["+side+",0]","clavicle_"+side,chest,[sign*.17,.20,0]);
    const shoulder=add("arm["+side+",0]/shoulder","shoulder_"+side,clavicle,[sign*.17,-.04,0],[],[side+"_arm"]);
    const elbow=add("arm["+side+",0]/elbow","elbow_"+side,shoulder,[sign*.18,-.24,0],[],[side+"_arm"]);
    const wrist=add("arm["+side+",0]/wrist","wrist_"+side,elbow,[sign*.08,-.26,0],[],[side+"_arm"]);
    const cap="grip_"+side+"0";
    const palm=add("arm["+side+",0]/palm","palm_"+side,wrist,[0,-.055,.01],[cap],[]);
    socket(palm,"primary_grip","primary",[0,-.04,.04],[cap]);
    socket(palm,"secondary_grip","secondary",[0,-.04,.04],[cap]);
    if(side==="left") {
      socket(palm,"bow_nock","bow_nock",[0,-.03,.13],[cap]);
      socket(palm,"projectile_origin","projectile",[0,-.08,.28],[cap]);
    } else {
      socket(palm,"projectile_origin","projectile",[0,-.08,.28],[cap]);
      socket(palm,"shield","shield",[0,-.02,.08],[cap]);
    }
    for(const digit of ["thumb","index","middle","ring","little"]) {
      let p=palm;
      for(let n=0;n<(digit==="thumb"?2:3);n++)
        p=add("arm["+side+",0]/finger["+digit+"]/phalanx["+n+"]",
          "finger_"+digit+"_"+n,p,[digit==="thumb"?sign*.04:0,-.025,.025]);
    }
    const hip=add("leg["+side+",0]/hip","hip_"+side,pelvis,[sign*.15,-.07,0],[],[side+"_leg"]);
    const knee=add("leg["+side+",0]/knee","knee_"+side,hip,[0,-.41,.02],[],[side+"_leg"]);
    const ankle=add("leg["+side+",0]/ankle","ankle_"+side,knee,[0,-.39,-.02],[],[side+"_leg"]);
    const foot=add("leg["+side+",0]/foot","foot_"+side,ankle,[0,-.08,.09]);
    add("leg["+side+",0]/toe","toe_"+side,foot,[0,0,.13]);
  }
  // Socket capabilities are hand-specific; torso bow capability is separate.
  // The capability is descriptive metadata and does NOT alter combat move legality.
  // Extra arms are not added to the foundation's fixed limb collections.
  for(let index=1;index<=arms;index++) {
    for(const [side,sign] of [["left",-1],["right",1]] as const) {
      const id="arm["+side+","+index+"]";begin(id,"extra_arm",chest,"humanoid_multi_shoulder_v1");
      const shoulder=add("shoulder","shoulder_"+side,chest,[sign*.33,.12-index*.12,0],[],[side+"_arm"]);
      const elbow=add("elbow","elbow_"+side,shoulder,[sign*.18,-.23,0]);
      const wrist=add("wrist","wrist_"+side,elbow,[sign*.07,-.26,0]);
      const cap="grip_"+side+index;
      const palm=add("palm","palm_"+side,wrist,[0,-.06,0],[cap]);
      socket(palm,"primary_grip","primary",[0,-.04,.04],[cap]);
    }
  }
  for(let index=1;index<=legs;index++) {
    for(const [side,sign] of [["left",-1],["right",1]] as const) {
      begin("leg["+side+","+index+"]","extra_leg",pelvis,"multi_leg_v1");
      const hip=add("hip","hip_"+side,pelvis,[sign*(.23+index*.14),-.06,0]);
      const knee=add("knee","knee_"+side,hip,[0,-.40,0]);
      const ankle=add("ankle","ankle_"+side,knee,[0,-.40,0]);
      const foot=add("foot","foot_"+side,ankle,[0,-.08,.09]);
      add("toe","toe_"+side,foot,[0,0,.13]);
    }
  }
  for(let index=1;index<=heads;index++) {
    begin("head["+index+"]","head",chest,"head_human_v1");
    const extraNeck=add("neck","neck",chest,[(index%2?-.20:.20),.24,0],[],["neck"]);
    const extraHead=add("head","head",extraNeck,[0,.17,0],["look_head_"+index],["head"]);
    add("jaw","jaw",extraHead,[0,-.10,.09]);
  }
  if(archetype==="jatayu") {
    for(const [side,sign] of [["left",-1],["right",1]] as const) {
      begin("wing["+side+",0]","wing",chest,"wing_feathered_v1");
      const scapula=add("scapula","wing_scapula_"+side,chest,[sign*.24,.12,-.10]);
      const humerus=add("humerus","wing_humerus_"+side,scapula,[sign*.25,.08,-.06]);
      const ulna=add("radius_ulna","wing_ulna_"+side,humerus,[sign*.31,0,-.05]);
      const carpal=add("carpal","wing_carpal_"+side,ulna,[sign*.28,0,0],
        ["wing_flap_"+side+"0"]);
      for(let i=0;i<3;i++)add("digit["+i+"]","wing_digit",carpal,[sign*.10,0,-i*.04]);
    }
  }
  if(archetype==="vanara") {
    begin("tail[0]","tail",pelvis,"tail_primate_v1");
    const base=add("base","tail_base",pelvis,[0,-.08,-.17],[],["tail"]);
    const middle=add("middle","tail_middle",base,[0,-.08,-.22],[],["tail"]);
    add("tip","tail_tip",middle,[0,.06,-.23],[],["tail"]);
  }
  if(archetype==="rakshasa") {
    begin("horn[left,0]","head",head,"horn_v1");
    add("horn","horn",head,[-.16,.12,0],[],["horn"]);
    begin("horn[right,0]","head",head,"horn_v1");
    add("horn","horn",head,[.16,.12,0],[],["horn"]);
  }
  const family=archetype==="animal_head"?
    "head_"+(options.animalHeadKind??"primate")+"_v1":archetype==="jatayu"?
    "head_avian_v1":"head_human_v1";
  const graph:AnatomicalGraphV1={
    schemaVersion:1,coordinates:CHARACTER_COORDINATES,
    topologyFamilyId:arms||legs?"humanoid_multi_limb_v1":"humanoid_biped_v1",
    headTopologyFamilyId:family,
    modules:modules.map(m=>({...m})),segments,joints,sockets,skinBindings:[],severZones:[],
  };
  // Descriptive head topology family is reserved, but C1 does not manufacture
  // a substitute primitive skull, nor claim to generate morph-compatible meshes.
  validateAnatomicalGraph(graph);
  return graph;
}
export function createCharacterRecipe(archetype:CharacterArchetypeV1="human",
  seed=1):CharacterRecipeV1 {
  const recipe:CharacterRecipeV1={schemaVersion:1,generatorVersion:"c1-contract-v1",
    archetypeId:archetype,seed,topologyFamilyId:"humanoid_biped_v1",
    modules:[],parameters:{},materialPresetIds:[]};
  validateCharacterRecipe(recipe);
  return recipe;
}
