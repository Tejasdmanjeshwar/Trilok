import {type HumanHeadMorphologyV1}
  from "@trilok/character-core";
import {BODY_MACRO_DEFAULTS} from "../characters/geometry/MakeHumanBodyTargets";
import {
  STUDIO_CONTROLS,STUDIO_CONTROL_BY_ID,controlValue,defaultStudioMorphState,
  validateStudioMorphState,withStudioControl,type StudioMorphState,
} from "./StudioMorphCatalog";
import {
  DEFAULT_STUDIO_APPEARANCE,HUMAN_SKIN_TONES,SKIN_ROUGHNESS_RANGE,
  validateStudioAppearance,type SkinToneId,type StudioAppearanceV1,
} from "./StudioAppearance";
import type {StudioRecipeV1} from "./StudioRecipe";

/** This version is embedded in every in-memory recipe. Never use Math.random. */
export const STUDIO_GENERATOR_VERSION="studio-human-v1" as const;
export const GENERATOR_STYLES={
  balanced:{label:"Balanced",description:"Natural, versatile proportions.",
    muscle:.51,weight:.5,height:.5,proportions:.5},
  warrior:{label:"Warrior",description:"Athletic strength and a confident silhouette.",
    muscle:.8,weight:.5,height:.57,proportions:.55},
  scout:{label:"Scout",description:"Lean, agile build with longer lines.",
    muscle:.48,weight:.27,height:.62,proportions:.61},
  guardian:{label:"Guardian",description:"Solid, powerful build with grounded proportions.",
    muscle:.72,weight:.77,height:.51,proportions:.44},
} as const;
export type GeneratorStyle=keyof typeof GENERATOR_STYLES;

export interface GeneratorLocks {
  readonly body:boolean;
  readonly face:boolean;
  readonly age:boolean;
  readonly appearance:boolean;
  /** Precise source-catalog IDs, including advanced body/face/head controls. */
  readonly features:readonly string[];
}
export interface GeneratorOptions {
  readonly seed:number;
  readonly style:GeneratorStyle;
  readonly variation:number;
  readonly locks:GeneratorLocks;
}
export interface GeneratorResult {
  readonly seed:number;
  readonly morphology:StudioMorphState;
  readonly appearance:StudioAppearanceV1;
  readonly selectedPresets:StudioRecipeV1["selectedPresets"];
}

const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const round=(x:number)=>Number(x.toFixed(6));
const defaultLockState=():GeneratorLocks=>({
  body:false,face:false,age:false,appearance:false,features:[],
});
export const DEFAULT_GENERATOR_OPTIONS:Readonly<GeneratorOptions>=
  Object.freeze({seed:1,style:"balanced",variation:.65,
    locks:Object.freeze(defaultLockState())});

/** Reject malformed seeds and feature IDs before changing any recipe/history. */
export function validateGeneratorOptions(options:GeneratorOptions):void {
  if(!options||!Number.isSafeInteger(options.seed)||
    options.seed<1||options.seed>0xffffffff||
    !Object.hasOwn(GENERATOR_STYLES,options.style)||
    !Number.isFinite(options.variation)||options.variation<0||options.variation>1||
    !options.locks||!Array.isArray(options.locks.features)||
    ["body","face","age","appearance"].some(k=>
      typeof options.locks[k as keyof Omit<GeneratorLocks,"features">]!=="boolean")||
    options.locks.features.length>STUDIO_CONTROLS.length||
    options.locks.features.some(id=>typeof id!=="string"||
      !STUDIO_CONTROL_BY_ID.has(id))||
    new Set(options.locks.features).size!==options.locks.features.length)
    throw new Error("Invalid character generation choices");
}

function seededStream(seed:number,domain:string):()=>number {
  let state=seed>>>0;
  for(let i=0;i<domain.length;i++){
    state=Math.imul(state^domain.charCodeAt(i),16777619)>>>0;
  }
  return ()=>{
    state=(state+0x6d2b79f5)>>>0;
    let t=Math.imul(state^(state>>>15),1|state);
    t^=t+Math.imul(t^(t>>>7),61|t);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
/** Triangular samples reduce the risk of simultaneous unsupported extremes. */
function deviate(next:()=>number):number{return next()+next()-1;}
function mix(center:number,target:number,intensity:number,noise:number,range:number):number{
  return center+(target-center)*intensity+noise*range*intensity;
}

/** Reuse the same source-control validators as manual editing. Every control
 * has a bounded, shrinking fallback; an invalid combination never escapes. */
function applySafe(state:StudioMorphState,id:string,value:number):StudioMorphState{
  const control=STUDIO_CONTROL_BY_ID.get(id);
  if(!control)throw new Error("Missing generator source control: "+id);
  const start=controlValue(state,control);
  const target=round(clamp(value,control.min,control.max));
  for(let attempt=0;attempt<5;attempt++){
    const candidate=round(start+(target-start)*Math.pow(.5,attempt));
    try{return withStudioControl(state,id,candidate);}
    catch{/* A progressively smaller source-supported delta may validate. */}
  }
  return state;
}

/** Draw complete correlated trait vectors *before* applying feature locks.
 * Separate streams keep Face identical when Body/Age are locked and vice versa,
 * apart from intentional age-dependent anatomical safety attenuation. */
export function generateStudioCharacter(
  previous:StudioRecipeV1,options:GeneratorOptions,
):GeneratorResult{
  validateGeneratorOptions(options);
  const locked=new Set(options.locks.features);
  const fullBody=options.locks.body;
  const fullFace=options.locks.face;
  const keep=(id:string)=>locked.has(id)||
    (id.startsWith("body:")?fullBody:
      STUDIO_CONTROL_BY_ID.get(id)?.category==="face"?fullFace:fullBody);
  const previousMorph=previous.morphology;
  const base=defaultStudioMorphState();
  // Demographic and ancestry controls are not sampled from play-style labels.
  // Preserve source ancestry triplets exactly, even when regenerating Body.
  const body:Record<string,number>=fullBody?{...previousMorph.body}:
    Object.fromEntries(Object.entries(previousMorph.body).filter(([key])=>
      /^macro\/(sex|african|asian|caucasian)$/.test(key)||
      locked.has("body:"+key)||
      (key==="macro/age"&&options.locks.age)));
  const face:Record<string,number>=fullFace?{...previousMorph.face}:
    Object.fromEntries(Object.entries(previousMorph.face).filter(([key])=>
      locked.has("face:"+key)));
  const shape={...base.shape} as Record<string,number>;
  for(const control of STUDIO_CONTROLS){
    if(control.channel!=="shape")continue;
    if(keep(control.id)){
      const key=control.id.slice(6);
      shape[key]=previousMorph.shape[key as keyof HumanHeadMorphologyV1];
    }
  }
  let result:StudioMorphState={body,face,shape:shape as unknown as HumanHeadMorphologyV1};
  const ageLocked=fullBody||options.locks.age||locked.has("body:macro/age");
  const bodyRandom=seededStream(options.seed,"body-profile-v1");
  const faceRandom=seededStream(options.seed,"face-profile-v1");
  const appearanceRandom=seededStream(options.seed,"appearance-v1");
  const profile=GENERATOR_STYLES[options.style];
  const v=options.variation;

  const age=ageLocked?
    previousMorph.body["macro/age"]??BODY_MACRO_DEFAULTS["macro/age"]!:
    round(clamp(.5+deviate(bodyRandom)*v*.18,.31,.69));
  const safety=age<.12?.10:age<.22?.4:1;
  const strength=v*safety;
  const height=mix(.5,profile.height,strength,deviate(bodyRandom),.10);
  const weight=mix(.5,profile.weight,strength,deviate(bodyRandom),.10);
  const muscle=mix(.5,profile.muscle,strength,deviate(bodyRandom),.095);
  const proportions=mix(.5,profile.proportions,strength,
    (height-.5)*1.3+deviate(bodyRandom)*.4,.075);
  const stature=height-.5,bulk=weight-.5,power=muscle-.5;
  const torso=clamp((bulk*.33+power*.23+deviate(bodyRandom)*.055)*strength,-.27,.27);
  const hips=clamp((bulk*.25-power*.08+deviate(bodyRandom)*.045)*strength,-.22,.22);
  const upperArm=clamp((stature*.36+deviate(bodyRandom)*.04)*strength,-.20,.20);
  const hands=clamp((stature*.22+power*.07+deviate(bodyRandom)*.03)*strength,-.16,.16);
  if(!fullBody){
    const values:readonly (readonly [string,number])[]=[
      ["body:macro/age",age],
      ["body:macro/height",clamp(height,.22,.79)],
      ["body:macro/weight",clamp(weight,.21,.79)],
      ["body:macro/muscle",clamp(muscle,.22,.83)],
      ["body:macro/proportions",clamp(proportions,.3,.7)],
      ["body:native/torso/torso-scale-horiz-decr-incr",torso],
      ["body:native/hip/hip-scale-horiz-decr-incr",hips],
      ["body:native/measure/measure-upperarm-length-decr-incr",upperArm],
      ["body:native/armslegs/l-hand-scale-decr-incr",hands],
      ["body:native/armslegs/r-hand-scale-decr-incr",hands],
    ];
    for(const [id,value] of values){
      if(id==="body:macro/age"&&ageLocked||locked.has(id))continue;
      result=applySafe(result,id,value);
    }
  }
  const faceBulk=deviate(faceRandom);
  const faceLength=deviate(faceRandom);
  const faceEye=deviate(faceRandom);
  const faceCheek=faceBulk*.62+deviate(faceRandom)*.38;
  const faceJaw=faceBulk*.55+faceLength*.25+deviate(faceRandom)*.2;
  const faceNose=faceBulk*.38+deviate(faceRandom)*.62;
  const faceLips=deviate(faceRandom);
  const faceSymmetry=deviate(faceRandom)*.035;
  const fv=strength;
  if(!fullFace){
    const features:readonly (readonly [string,number])[]=[
      ["face:noseWidth",faceNose*.54*fv],
      ["face:nostrilWidth",faceNose*.36*fv],
      ["face:noseBridge",(faceLength*.3+deviate(faceRandom)*.25)*fv],
      ["face:leftCheek",(faceCheek*.43+faceSymmetry)*fv],
      ["face:rightCheek",(faceCheek*.43-faceSymmetry)*fv],
      ["face:leftCheekbone",faceCheek*.32*fv],
      ["face:rightCheekbone",faceCheek*.32*fv],
      ["face:chinWidth",faceJaw*.45*fv],
      ["face:chinHeight",faceLength*.28*fv],
      ["face:leftEyeHeight",(faceEye*.28+faceSymmetry)*fv],
      ["face:rightEyeHeight",(faceEye*.28-faceSymmetry)*fv],
      ["face:upperLipVolume",faceLips*.29*fv],
      ["face:lowerLipVolume",faceLips*.25*fv],
      ["face:leftEarSize",faceLength*.21*fv],
      ["face:rightEarSize",faceLength*.21*fv],
    ];
    for(const [id,value] of features)if(!locked.has(id))
      result=applySafe(result,id,value);
  }

  // Head/eye/jaw proportions are coordinated with the same latent facial
  // vector; height-age coupling remains gentle, particularly for infants.
  const scale=v*safety;
  const headProportions:readonly (readonly [string,number])[]=[
    ["shape:skullWidth",1+(faceBulk*.032+bulk*.02)*scale],
    ["shape:skullHeight",1+(faceLength*.032+(age-.5)*.018)*scale],
    ["shape:jawWidth",1+faceJaw*.035*scale],
    ["shape:cheeks",1+faceCheek*.025*scale],
    ["shape:eyeSpacing",1+faceEye*.025*scale],
    ["shape:faceDepth",1+faceNose*.018*scale],
  ];
  for(const [id,value] of headProportions){
    if(keep(id))continue;
    result=applySafe(result,id,value);
  }
  // Keep non-generated source channels at their default neutral values while
  // retaining every explicitly locked channel; no stress extrapolation.
  validateStudioMorphState(result);

  let appearance:StudioAppearanceV1=previous.appearance;
  if(!options.locks.appearance){
    const colors=Object.keys(HUMAN_SKIN_TONES) as SkinToneId[];
    const currentIndex=colors.indexOf(previous.appearance.tone);
    const offset=Math.round(deviate(appearanceRandom)*Math.ceil(v*4));
    const tone=colors[clamp(currentIndex+offset,0,colors.length-1)]!;
    const roughness=round(clamp(DEFAULT_STUDIO_APPEARANCE.roughness+
      deviate(appearanceRandom)*v*.12,SKIN_ROUGHNESS_RANGE.min,
      SKIN_ROUGHNESS_RANGE.max));
    appearance={tone,roughness};
  }
  validateStudioAppearance(appearance);
  return {
    seed:options.seed,
    morphology:result,
    appearance,
    selectedPresets:{
      body:fullBody?previous.selectedPresets.body:"custom",
      face:fullFace?previous.selectedPresets.face:"custom",
    },
  };
}

export interface GeneratorDifference {
  readonly body:number;
  readonly face:number;
  readonly appearance:number;
  readonly examples:readonly string[];
}
export function compareGeneratedCharacter(before:StudioRecipeV1,
  after:StudioRecipeV1):GeneratorDifference {
  let body=0,face=0;
  const examples:string[]=[];
  for(const control of STUDIO_CONTROLS){
    const previous=controlValue(before.morphology,control);
    const current=controlValue(after.morphology,control);
    if(Math.abs(previous-current)<1e-6)continue;
    if(control.category==="body")body++;else face++;
    if(examples.length<4)examples.push(control.label);
  }
  const appearance=Number(before.appearance.tone!==after.appearance.tone)+
    Number(before.appearance.roughness!==after.appearance.roughness);
  return {body,face,appearance,examples};
}
