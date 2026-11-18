import {createAnatomyPreset} from "./presets";
import {canonicalRigIdentity, validateAnimationClip, type AnimationClipV1} from "./animation";
import type {AnatomicalGraphV1, Quat, Vec3} from "./schema";

/** Original Trilok motion authoring inputs, never runtime-generated poses.
 * Angles are rest-local radians; +Z is forward and +Y up. All poses loop.
 * The motion reference is a biomechanical guide, NOT redistributed mocap. */
export interface ReferenceMotionSourceV1 {
  readonly schemaVersion:1;
  readonly id:string;
  readonly label:string;
  readonly durationSeconds:number;
  readonly timesSeconds:readonly number[];
  readonly channels:readonly (readonly [role:string,axis:"x"|"y"|"z",radians:readonly number[]])[];
  /** Presentation-only pelvis offsets. Root movement is never gameplay authority. */
  readonly rootTranslation?:readonly Vec3[];
}
type Axis="x"|"y"|"z";
type Side="left"|"right";
type Knot=readonly [phase:number,value:number];
type MotionWriter={
  readonly timesSeconds:readonly number[];
  channel(role:string,axis:Axis,sample:(phase:number)=>number):void;
  translation(sample:(phase:number)=>Vec3):void;
  result(id:string,label:string):ReferenceMotionSourceV1;
};
const TWO_PI=2*Math.PI;
function writer(durationSeconds:number,framesPerSecond:number):MotionWriter {
  const frames=Math.round(durationSeconds*framesPerSecond);
  const timesSeconds=Array.from({length:frames+1},(_,i)=>durationSeconds*i/frames);
  const channels:[string,Axis,number[]][]=[];
  let rootTranslation:Vec3[]|undefined;
  return {
    timesSeconds,
    channel(role,axis,sample){
      const values=timesSeconds.map((_,i)=>sample(i/frames));
      values[frames]=values[0]!;
      channels.push([role,axis,values]);
    },
    translation(sample){
      rootTranslation=timesSeconds.map((_,i)=>sample(i/frames));
      rootTranslation[frames]=[...rootTranslation[0]!] as Vec3;
    },
    result(id,label){
      return {schemaVersion:1,id,label,durationSeconds,timesSeconds,channels,
        ...(rootTranslation?{rootTranslation}:{})};
    },
  };
}
/** Cyclic cubic Hermite interpolation: continuous positions and tangents.
 * Knots encode recognizable gait events rather than arbitrary sine waves.
 * End tangent is calculated from the periodic neighbors. */
function phaseCurve(knots:readonly Knot[],phase:number):number {
  const p=((phase%1)+1)%1;
  let i=0;
  while(i+1<knots.length&&p>knots[i+1]![0])i++;
  const a=knots[i]!,b=knots[i+1]!;
  const prev=knots[i===0?knots.length-2:i-1]!;
  const next=knots[i+2===knots.length?1:i+2]!;
  const x0=prev[0]-(i===0?1:0);
  const x3=next[0]+(i+2>=knots.length?1:0);
  const slope0=(b[1]-prev[1])/(b[0]-x0);
  const slope1=(next[1]-a[1])/(x3-a[0]);
  const h=b[0]-a[0],t=(p-a[0])/h;
  const t2=t*t,t3=t2*t;
  return (2*t3-3*t2+1)*a[1]+(t3-2*t2+t)*h*slope0+
    (-2*t3+3*t2)*b[1]+(t3-t2)*h*slope1;
}
const WALK={
  hip:[[0,-.32],[.12,-.25],[.30,-.03],[.51,.27],[.62,.29],[.75,-.09],[.87,-.35],[1,-.32]],
  knee:[[0,.10],[.12,.31],[.30,.16],[.51,.12],[.62,.46],[.75,.77],[.87,.31],[1,.10]],
  ankle:[[0,-.15],[.12,.02],[.30,.07],[.51,.20],[.62,.24],[.75,-.17],[.87,-.20],[1,-.15]],
  toe:[[0,-.06],[.12,0],[.30,.02],[.51,-.15],[.62,-.28],[.75,-.08],[.87,-.05],[1,-.06]],
} as const;
const RUN={
  hip:[[0,-.51],[.10,-.31],[.28,.15],[.39,.43],[.54,.31],[.70,-.32],[.83,-.67],[1,-.51]],
  knee:[[0,.31],[.10,.61],[.28,.81],[.39,1.13],[.54,1.53],[.70,1.14],[.83,.48],[1,.31]],
  ankle:[[0,-.12],[.10,.08],[.28,.23],[.39,.29],[.54,-.20],[.70,-.25],[.83,-.20],[1,-.12]],
  toe:[[0,-.05],[.10,0],[.28,-.18],[.39,-.36],[.54,-.16],[.70,-.09],[.83,-.06],[1,-.05]],
} as const;
function idle():ReferenceMotionSourceV1 {
  const w=writer(3.6,30);
  const breath=(p:number)=>Math.sin(TWO_PI*p);
  const sway=(p:number)=>Math.sin(TWO_PI*p+.45);
  w.channel("pelvis","y",p=>.008*sway(p));
  w.channel("pelvis","z",p=>.008*sway(p));
  w.channel("spine_lower","x",p=>.022+.006*breath(p));
  w.channel("spine_lower","y",p=>-.006*sway(p));
  w.channel("chest","x",p=>.014+.014*breath(p-.08));
  w.channel("chest","z",p=>-.007*sway(p));
  w.channel("clavicle_left","z",p=>-.025-.010*breath(p-.08));
  w.channel("clavicle_right","z",p=>.025+.010*breath(p-.08));
  for(const side of ["left","right"] as const) {
    const sign=side==="left"?-1:1;
    w.channel("shoulder_"+side,"x",p=>-.10-.012*breath(p-.05)+.006*sign*sway(p));
    w.channel("shoulder_"+side,"z",p=>sign*(.065+.008*breath(p-.08)));
    w.channel("elbow_"+side,"x",p=>-.16-.009*breath(p+.12));
    w.channel("wrist_"+side,"x",p=>-.035-.005*breath(p));
    w.channel("hip_"+side,"x",p=>-.012+.003*sign*sway(p));
    w.channel("knee_"+side,"x",p=>.075+.005*sign*sway(p));
    w.channel("ankle_"+side,"x",p=>-.025-.003*sign*sway(p));
  }
  w.channel("neck","x",p=>-.012-.006*breath(p-.08));
  w.channel("head","y",p=>.003*sway(p));
  w.translation(p=>[.005*sway(p),.003*breath(p),0]);
  return w.result("human-idle","Natural idle · breathing and balance");
}
function locomotion(kind:"walk"|"run"):ReferenceMotionSourceV1 {
  const running=kind==="run", table=running?RUN:WALK;
  // One complete left/right stride. Walk ~100 steps/min, run ~167.
  const w=writer(running?.72:1.2,60);
  const wave=(p:number)=>Math.sin(TWO_PI*p);
  const sideWave=(p:number)=>Math.cos(TWO_PI*p);
  const amplitude=running?1.6:1;
  w.channel("pelvis","x",p=>running?.035:.015);
  w.channel("pelvis","y",p=>(running?.075:.050)*wave(p));
  w.channel("pelvis","z",p=>(running?.030:.022)*sideWave(p));
  w.channel("spine_lower","x",p=>(running?.09:.04)+.012*Math.cos(2*TWO_PI*p));
  w.channel("spine_lower","y",p=>-(running?.045:.030)*wave(p));
  w.channel("spine_lower","z",p=>-(running?.018:.012)*sideWave(p));
  w.channel("chest","x",p=>(running?.04:.012)+.010*Math.cos(2*TWO_PI*p));
  w.channel("chest","y",p=>-(running?.045:.035)*wave(p+.07));
  w.channel("chest","z",p=>-(running?.015:.009)*sideWave(p));
  w.channel("neck","x",p=>running?-.045:-.018);
  w.channel("neck","y",p=>.012*wave(p+.07));
  w.channel("head","x",p=>running?-.015:-.008);
  w.channel("head","y",p=>.008*wave(p));
  for(const side of ["left","right"] as const){
    const offset=side==="left"?0:.5;
    const sign=side==="left"?-1:1;
    const gait=(p:number,k:readonly Knot[])=>phaseCurve(k,p+offset);
    w.channel("hip_"+side,"x",p=>gait(p,table.hip));
    w.channel("hip_"+side,"y",p=>sign*(running?.025:.018));
    w.channel("knee_"+side,"x",p=>gait(p,table.knee));
    w.channel("ankle_"+side,"x",p=>gait(p,table.ankle));
    w.channel("toe_"+side,"x",p=>gait(p,table.toe));
    // Contralateral arm swing: the arm is behind its advancing leg.
    w.channel("shoulder_"+side,"x",p=>(running?-.03:-.055)+
      (running?.43:.22)*Math.cos(TWO_PI*(p+offset)));
    w.channel("shoulder_"+side,"z",p=>sign*(running?.105:.075)+
      sign*.01*Math.cos(TWO_PI*(p+offset)));
    w.channel("elbow_"+side,"x",p=>(running?-.95:-.19)+
      (running?.13:.08)*Math.sin(TWO_PI*(p+offset)));
    w.channel("wrist_"+side,"x",p=>running?-.12:-.045);
    w.channel("clavicle_"+side,"x",p=>-.018*wave(p+offset));
  }
  // In-place preview. The simulation owns forward displacement; these small
  // lateral/vertical offsets merely convey weight and suspension.
  w.translation(p=>[(running?.016:.012)*sideWave(p),
    (running?-.006:.002)+(running?.028:.012)*Math.cos(2*TWO_PI*p),
    0]);
  return w.result(running?"human-run":"human-walk",
    running?"Running · flight, arm drive and recovery":"Walking · heel strike and toe-off");
}
export const REFERENCE_MOTION_SOURCES:readonly ReferenceMotionSourceV1[]=[
  idle(),locomotion("walk"),locomotion("run"),
];

export function validateReferenceMotionSource(value:unknown):asserts value is ReferenceMotionSourceV1 {
  if(!value||typeof value!=="object")throw new Error("Invalid reference motion source");
  const s=value as ReferenceMotionSourceV1;
  if(s.schemaVersion!==1||!/^[-a-z0-9]{2,64}$/.test(s.id)||
    typeof s.label!=="string"||s.label.length<2||s.label.length>80||
    !Number.isFinite(s.durationSeconds)||s.durationSeconds<=0||s.durationSeconds>120||
    !Array.isArray(s.timesSeconds)||s.timesSeconds.length<2||s.timesSeconds.length>1024||
    s.timesSeconds[0]!==0||s.timesSeconds.at(-1)!==s.durationSeconds||
    s.timesSeconds.some((t,i)=>!Number.isFinite(t)||(i>0&&t<=s.timesSeconds[i-1]!))||
    !Array.isArray(s.channels)||s.channels.length===0||s.channels.length>128)
    throw new Error("Invalid reference motion source header");
  const seen=new Set<string>();
  for(const channel of s.channels){
    if(!Array.isArray(channel)||channel.length!==3||typeof channel[0]!=="string"||
      !["x","y","z"].includes(channel[1])||!Array.isArray(channel[2])||
      channel[2].length!==s.timesSeconds.length||
      channel[2].some(v=>!Number.isFinite(v)||Math.abs(v)>Math.PI/2)||
      Math.abs(channel[2][0]!-channel[2].at(-1)!)>1e-9||
      seen.has(channel[0]+":"+channel[1]))
      throw new Error("Invalid reference motion channel");
    seen.add(channel[0]+":"+channel[1]);
  }
  if(s.rootTranslation!==undefined&&
    (!Array.isArray(s.rootTranslation)||
      s.rootTranslation.length!==s.timesSeconds.length||
      s.rootTranslation.some(v=>!Array.isArray(v)||v.length!==3||
        v.some(n=>!Number.isFinite(n)||Math.abs(n)>.1))||
      s.rootTranslation[0]!.some((n:number,i:number)=>
        Math.abs(n-s.rootTranslation![s.rootTranslation!.length-1]![i]!)>1e-9)))
    throw new Error("Invalid presentation root offsets");
}
function angleQuaternion(axis:"x"|"y"|"z",angle:number):Quat {
  const sin=Math.sin(angle/2), cos=Math.cos(angle/2);
  return axis==="x"?[sin,0,0,cos]:axis==="y"?[0,sin,0,cos]:[0,0,sin,cos];
}
/** Pure deterministic bake against the canonical graph. A new morphology may
 * use these clips only while its exact graph/bind identity remains unchanged. */
export function bakeReferenceMotion(source:ReferenceMotionSourceV1,
  graph:AnatomicalGraphV1=createAnatomyPreset({archetype:"human"})):AnimationClipV1 {
  validateReferenceMotionSource(source);
  const rig=canonicalRigIdentity(graph);
  const byRole=new Map<string,{jointId:string; axes:Partial<Record<"x"|"y"|"z",readonly number[]>>}>();
  for(const [role,axis,angles] of source.channels){
    const joints=graph.joints.filter(j=>j.role===role&&j.exported);
    if(joints.length!==1)throw new Error("Ambiguous animation semantic role: "+role);
    const existing=byRole.get(role)??{jointId:joints[0]!.id,axes:{} as Partial<Record<"x"|"y"|"z",readonly number[]>>};
    existing.axes[axis]=angles;
    byRole.set(role,existing);
  }
  const mul=(a:Quat,b:Quat):Quat=>[
    a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
    a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
    a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
    a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2],
  ];
  const rotationTracks=[...byRole.values()].map(({jointId,axes})=>({
    jointId,channel:"rotation" as const,timesSeconds:[...source.timesSeconds],
    values:source.timesSeconds.map((_,i)=>{
      let q:Quat=[0,0,0,1];
      for(const axis of ["x","y","z"] as const)
        if(axes[axis])q=mul(q,angleQuaternion(axis,axes[axis][i]!));
      const length=Math.hypot(...q);
      return q.map(n=>n/length) as unknown as Quat;
    }),
  }));
  const tracks=[...rotationTracks,...(source.rootTranslation?[{
    jointId:rig.rootJointId,channel:"translation" as const,
    timesSeconds:[...source.timesSeconds],
    values:source.rootTranslation.map(v=>[...v] as Vec3),
  }]:[])];
  const clip:AnimationClipV1={schemaVersion:1,id:source.id,rig,
    durationSeconds:source.durationSeconds,
    source:{kind:"internal",creator:"trilok",revision:"c6.2-gait-source-v2",
      license:"Trilok-Proprietary"},
    rootMotion:source.rootTranslation?"visual_only":"locked",layer:{mode:"base",jointMask:[...new Set(tracks.map(t=>t.jointId))]},
    retarget:{mode:"rest_delta",authoredBindPoseId:rig.bindPoseId},
    tracks,contacts:[]};
  validateAnimationClip(clip,graph);
  return clip;
}
