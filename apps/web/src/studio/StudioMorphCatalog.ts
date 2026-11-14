import {
  DEFAULT_HUMAN_HEAD_MORPHOLOGY, HUMAN_MORPHOLOGY_LIMITS,
  HUMAN_LOCAL_LIMITS, HUMAN_HEAD_LIMITS, createHumanHeadRecipe,
  type HumanHeadMorphologyV1,
} from "@trilok/character-core";
import {
  BODY_CONTROLS, BODY_MACRO_DEFAULTS, BODY_PRESETS,
  setBodyAncestryChannel, validateBodyWeights, type BodyWeights,
} from "../characters/geometry/MakeHumanBodyTargets";
import {
  ALL_FACIAL_CONTROLS, FACIAL_CONTROLS, FACIAL_PRESETS,
  validateFacialWeights, type FacialWeights,
} from "../characters/geometry/MakeHumanFacialTargets";

/** Canonical Studio metadata is a view over the actual validated source registries. */
export type StudioSection="body"|"face";
export type StudioChannel="body"|"face"|"shape";
export interface StudioControl {
  readonly id:string;
  readonly label:string;
  readonly category:StudioSection;
  readonly group:string;
  readonly channel:StudioChannel;
  readonly min:number;
  readonly max:number;
  readonly step:number;
  readonly defaultValue:number;
  readonly advanced:boolean;
  readonly note?:string;
}
export interface StudioMorphState {
  readonly body:BodyWeights;
  readonly face:FacialWeights;
  readonly shape:Readonly<HumanHeadMorphologyV1>;
}
const pretty=(input:string):string=>input.replace(/[-_/]+/g," ").replace(/\b\w/g,c=>c.toUpperCase());
const BODY_MAIN=new Set(["macro/sex","macro/age","macro/height","macro/weight",
  "macro/muscle","macro/proportions","macro/breastSize","macro/breastFirmness"]);
const FACE_MAIN=new Set(FACIAL_CONTROLS.map(c=>c.id));
const nativeCategory=(group:string):string=>{
  const label=pretty(group.replace(/^Native /,""));
  return label==="Macrodetails"?"Build":label;
};
const body:StudioControl[]=BODY_CONTROLS.map(item=>{
  const id=item.id;
  const macro=id.startsWith("macro/");
  const isAncestry=/^macro\/(african|asian|caucasian)$/.test(id);
  return {
    id:"body:"+id, label:macro?item.label.split(" · ")[0]!.replace(" (min to max)","")
      .replace(" (baby to old)","").replace(" (female to male)","")
      .replace(" (uncommon to ideal)",""):pretty(item.label),
    category:"body",group:macro?(isAncestry?"Ancestry":"Foundation"):
      item.group==="Stress inspection"?"Stress testing":nativeCategory(item.group),
    channel:"body",min:item.min,max:item.max,
    step:id==="macro/age"?.0005:macro?.001:.05,
    defaultValue:BODY_MACRO_DEFAULTS[id]??0,
    advanced:!BODY_MAIN.has(id),note:item.max>item.nativeMax?
      "Values beyond the original range are for stress testing.":undefined,
  };
});
const face:StudioControl[]=ALL_FACIAL_CONTROLS.map(item=>({
  id:"face:"+item.id,label:pretty(item.label),
  category:"face",group:nativeCategory(item.group),channel:"face",
  min:item.min,max:item.max,step:.05,defaultValue:0,
  advanced:!FACE_MAIN.has(item.id),
  note:item.max>1?"Values beyond the original range are for stress testing.":undefined,
}));
const humanShapeKeys=(Object.keys(DEFAULT_HUMAN_HEAD_MORPHOLOGY) as
  (keyof HumanHeadMorphologyV1)[]);
const faceShape=new Set(["skullWidth","skullHeight","forehead","brow",
  "cheeks","jawWidth","chin","faceDepth","eyeSpacing"]);
const shape:StudioControl[]=humanShapeKeys.map(key=>{
  const range=key in HUMAN_HEAD_LIMITS?
    HUMAN_HEAD_LIMITS[key as keyof typeof HUMAN_HEAD_LIMITS]:
    key in HUMAN_LOCAL_LIMITS?HUMAN_LOCAL_LIMITS[key as keyof typeof HUMAN_LOCAL_LIMITS]:
      HUMAN_MORPHOLOGY_LIMITS[key as keyof typeof HUMAN_MORPHOLOGY_LIMITS];
  const category:StudioSection=faceShape.has(key)?"face":"body";
  const label=key.replace(/([A-Z])/g," $1").trim().replace(/^./,c=>c.toUpperCase());
  return {id:"shape:"+key,label,category,group:category==="face"?"Head shape":"Local proportions",
    channel:"shape",min:range[0],max:range[1],step:.001,defaultValue:1,
    advanced:true};
});
export const STUDIO_CONTROLS:readonly StudioControl[]=Object.freeze([...body,...face,...shape]);
export const STUDIO_CONTROL_BY_ID:ReadonlyMap<string,StudioControl>=
  new Map(STUDIO_CONTROLS.map(c=>[c.id,c]));

export const STUDIO_PRESETS:Readonly<Record<StudioSection,readonly {id:string;label:string}[]>>={
  body:[
    {id:"neutral",label:"Balanced"},{id:"athletic",label:"Athletic"},
    {id:"muscular",label:"Powerful"},{id:"lean",label:"Lean"},
    {id:"heavy",label:"Sturdy"},{id:"tall",label:"Tall"},
    {id:"short",label:"Compact"},{id:"wideShoulders",label:"Broad shoulders"},
    {id:"longArms",label:"Long arms"},{id:"largeHands",label:"Large hands"},
    {id:"wideHips",label:"Wide hips"},
  ],
  face:[
    {id:"neutral",label:"Natural"},{id:"smile",label:"Warm smile"},
    {id:"surprised",label:"Surprised"},{id:"asymmetric",label:"Asymmetric"},
    {id:"blink",label:"Eyes closed"},{id:"wide",label:"Distinct features"},
  ],
};
export function defaultStudioMorphState():StudioMorphState{
  return {body:{},face:{},shape:{...DEFAULT_HUMAN_HEAD_MORPHOLOGY}};
}
export function validateStudioMorphState(value:StudioMorphState):void {
  validateBodyWeights(value.body);
  validateFacialWeights(value.face);
  createHumanHeadRecipe(value.shape as HumanHeadMorphologyV1);
}
export function controlValue(state:StudioMorphState,control:StudioControl):number{
  const id=control.id.slice(control.id.indexOf(":")+1);
  return control.channel==="body"?state.body[id]??control.defaultValue:
    control.channel==="face"?state.face[id]??0:
      state.shape[id as keyof HumanHeadMorphologyV1];
}
export function withStudioControl(state:StudioMorphState,id:string,value:number):StudioMorphState{
  const c=STUDIO_CONTROL_BY_ID.get(id);
  if(!c||!Number.isFinite(value)||value<c.min||value>c.max)
    throw new Error("Invalid character adjustment");
  const key=id.slice(id.indexOf(":")+1);
  let next:StudioMorphState;
  if(c.channel==="body"){
    const body=/^macro\/(african|asian|caucasian)$/.test(key)?
      setBodyAncestryChannel(state.body,key.slice(6) as "african"|"asian"|"caucasian",value):
      {...state.body,[key]:value};
    next={...state,body};
  }else if(c.channel==="face"){
    next={...state,face:{...state.face,[key]:value}};
  }else{
    next={...state,shape:{...state.shape,[key]:value}};
  }
  validateStudioMorphState(next);
  return next;
}
export function resetStudioSection(state:StudioMorphState,section:StudioSection):StudioMorphState{
  const next:StudioMorphState=section==="body"?
    {...state,body:{},shape:{...state.shape,...Object.fromEntries(humanShapeKeys.filter(k=>
      !faceShape.has(k)).map(k=>[k,1]))}}:
    {...state,face:{},shape:{...state.shape,...Object.fromEntries(humanShapeKeys.filter(k=>
      faceShape.has(k)).map(k=>[k,1]))}};
  validateStudioMorphState(next);
  return next;
}
export function withStudioPreset(state:StudioMorphState,section:StudioSection,
  preset:string):StudioMorphState{
  if(!STUDIO_PRESETS[section].some(p=>p.id===preset))throw new Error("Unknown character style");
  const next=section==="body"?{...state,body:{...BODY_PRESETS[preset]}}:
    {...state,face:{...FACIAL_PRESETS[preset]}};
  validateStudioMorphState(next);
  return next;
}
export function findStudioControls(section:StudioSection,query:string,advanced:boolean,
  group="all"):readonly StudioControl[]{
  const q=query.trim().toLocaleLowerCase();
  return STUDIO_CONTROLS.filter(c=>c.category===section &&
    (advanced||!c.advanced||!!q) &&
    (group==="all"||c.group===group) &&
    (!q||[c.label,c.group,c.id.slice(c.id.indexOf(":")+1)].join(" ")
      .toLocaleLowerCase().includes(q)));
}
