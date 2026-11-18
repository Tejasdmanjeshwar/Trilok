import {createAnatomyPreset} from "./presets";
import {canonicalRigIdentity, validateAnimationClip, type AnimationClipV1} from "./animation";
import type {AnatomicalGraphV1, Quat} from "./schema";

/** Declarative, original Trilok source definitions. Angles are radians in
 * semantic joint-local axes, relative to the calibrated rest pose. */
export interface ReferenceMotionSourceV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly label: string;
  readonly durationSeconds: number;
  readonly timesSeconds: readonly number[];
  readonly channels: readonly (readonly [role:string, axis:"x"|"y"|"z", radians:readonly number[]])[];
}
export const REFERENCE_MOTION_SOURCES: readonly ReferenceMotionSourceV1[] = [
  {
    schemaVersion:1, id:"relaxed-idle", label:"Relaxed breathing", durationSeconds:3,
    timesSeconds:[0,.75,1.5,2.25,3],
    channels:[
      ["chest","x",[0,.024,.005,-.008,0]],
      ["spine_lower","x",[0,.007,.003,-.003,0]],
      ["clavicle_left","z",[0,-.01,-.002,.004,0]],
      ["clavicle_right","z",[0,.01,.002,-.004,0]],
      ["shoulder_left","x",[0,-.008,0,.005,0]],
      ["shoulder_right","x",[0,-.008,0,.005,0]],
    ],
  },
  {
    schemaVersion:1, id:"controlled-step",label:"Controlled forward step",durationSeconds:2,
    timesSeconds:[0,.25,.5,.75,1,1.25,1.5,1.75,2],
    channels:[
      ["pelvis","z",[0,-.025,-.045,-.02,.025,.04,.02,.005,0]],
      ["pelvis","x",[0,.02,.045,.035,.01,-.012,-.012,-.005,0]],
      ["hip_left","x",[0,-.12,-.32,-.36,-.2,-.04,.04,.02,0]],
      ["knee_left","x",[0,.12,.38,.54,.34,.18,.08,.02,0]],
      ["ankle_left","x",[0,-.06,-.14,-.16,-.1,.02,.04,.02,0]],
      ["hip_right","x",[0,.06,.15,.12,-.08,-.16,-.1,-.03,0]],
      ["knee_right","x",[0,.05,.12,.08,.07,.22,.18,.06,0]],
      ["ankle_right","x",[0,-.02,-.05,-.03,.06,.08,.04,0,0]],
      ["spine_lower","z",[0,.014,.028,.02,-.01,-.023,-.01,0,0]],
      ["shoulder_left","x",[0,.035,.08,.07,-.01,-.06,-.04,0,0]],
      ["shoulder_right","x",[0,-.04,-.09,-.06,.025,.07,.04,.01,0]],
    ],
  },
  {
    schemaVersion:1,id:"ready-gesture",label:"Weapon-ready gesture",durationSeconds:2.4,
    timesSeconds:[0,.4,.8,1.2,1.6,2,2.4],
    channels:[
      ["chest","y",[0,.055,.11,.12,.09,.04,0]],
      ["clavicle_left","z",[0,-.04,-.085,-.09,-.07,-.025,0]],
      ["clavicle_right","z",[0,.04,.08,.09,.07,.025,0]],
      ["shoulder_left","x",[0,-.16,-.32,-.35,-.27,-.11,0]],
      ["shoulder_right","x",[0,-.20,-.42,-.45,-.33,-.14,0]],
      ["shoulder_left","z",[0,-.07,-.15,-.16,-.11,-.04,0]],
      ["shoulder_right","z",[0,.08,.17,.18,.13,.05,0]],
      ["elbow_left","x",[0,-.13,-.30,-.34,-.26,-.09,0]],
      ["elbow_right","x",[0,-.18,-.42,-.45,-.33,-.13,0]],
      ["wrist_left","y",[0,-.07,-.13,-.14,-.09,-.03,0]],
      ["wrist_right","y",[0,.07,.15,.16,.12,.05,0]],
      ["neck","y",[0,-.02,-.04,-.05,-.035,-.01,0]],
    ],
  },
] as const;

export function validateReferenceMotionSource(value:unknown): asserts value is ReferenceMotionSourceV1 {
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
      channel[2][0]!==0||channel[2].at(-1)!==0||
      seen.has(channel[0]+":"+channel[1]))throw new Error("Invalid reference motion channel");
    seen.add(channel[0]+":"+channel[1]);
  }
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
  const tracks=[...byRole.values()].map(({jointId,axes})=>({
    jointId,channel:"rotation" as const,timesSeconds:[...source.timesSeconds],
    values:source.timesSeconds.map((_,i)=>{
      let q:Quat=[0,0,0,1];
      for(const axis of ["x","y","z"] as const)
        if(axes[axis])q=mul(q,angleQuaternion(axis,axes[axis][i]!));
      const length=Math.hypot(...q);
      return q.map(n=>n/length) as unknown as Quat;
    }),
  }));
  const clip:AnimationClipV1={schemaVersion:1,id:source.id,rig,
    durationSeconds:source.durationSeconds,
    source:{kind:"internal",creator:"trilok",revision:"c6.2-motion-source-v1",
      license:"Trilok-Proprietary"},
    rootMotion:"locked",layer:{mode:"base",jointMask:tracks.map(t=>t.jointId)},
    retarget:{mode:"rest_delta",authoredBindPoseId:rig.bindPoseId},
    tracks,contacts:[]};
  validateAnimationClip(clip,graph);
  return clip;
}
