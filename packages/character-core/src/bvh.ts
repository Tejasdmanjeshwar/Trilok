import type {Quat, Vec3} from "./schema";

/**
 * Strict, renderer-independent BVH decoder for offline acquisition/baking.
 * BVH uses local Euler channels in DECLARED order (intrinsic active rotations).
 * Original values, root translation and hierarchy are retained for auditing.
 * Coordinate conversion/scale is explicit in the calling source profile;
 * never silently apply XYZ Euler or assume centimeters.
 */
export interface BVHJointV1 {
  readonly name: string;
  readonly parent: number | null;
  readonly offset: Vec3;
  readonly channels: readonly string[];
  readonly endSites: readonly Vec3[];
}
export interface BVHSourceV1 {
  readonly schemaVersion: 1;
  readonly joints: readonly BVHJointV1[];
  readonly frameTimeSeconds: number;
  readonly frames: number;
  readonly channelCount: number;
  readonly values: readonly (readonly number[])[];
}
export interface BVHSampleV1 {
  readonly rotations: readonly Quat[];
  readonly translations: readonly Vec3[];
  readonly sourceRootTranslation: Vec3;
}
type Axis="X"|"Y"|"Z";
const channelPattern=/^[XYZ](?:position|rotation)$/;
const finite=(x:number)=>Number.isFinite(x);
function invalid(message:string):never{throw Error("Invalid BVH: "+message);}
function product(a:Quat,b:Quat):Quat{
  return [
    a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
    a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
    a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
    a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2],
  ];
}
function axisQuat(axis:Axis, angleDeg:number):Quat{
  const angle=angleDeg*Math.PI/360;
  const s=Math.sin(angle),c=Math.cos(angle);
  return axis==="X"?[s,0,0,c]:axis==="Y"?[0,s,0,c]:[0,0,s,c];
}
function unit(q:Quat):Quat{
  const length=Math.hypot(...q);
  if(!finite(length)||length<1e-12)invalid("invalid orientation");
  return [q[0]/length,q[1]/length,q[2]/length,q[3]/length];
}
/** No silently introduced unit scale or axes; fidelity is source-native. */
export function parseBVH(source:string):BVHSourceV1{
  if(typeof source!=="string"||source.length<50||source.length>180_000_000)
    invalid("source text bounds");
  const tokens=source.replace(/\{/g," { ").replace(/\}/g," } ")
    .trim().split(/\s+/);
  let index=0,channelCount=0;
  const next=()=>tokens[index++];
  const expect=(literal:string)=>{
    const token=next();
    if(token!==literal)invalid("expected "+literal+", got "+token);
  };
  const number=():number=>{
    const t=next();
    if(t===undefined||!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(t))
      invalid("invalid numeric token "+t);
    const value=Number(t);
    if(!finite(value))invalid("nonfinite numeric value");
    return value;
  };
  const vec=():Vec3=>[number(),number(),number()];
  const joints:BVHJointV1[]=[];
  expect("HIERARCHY");
  function joint(parent:number|null,kind:"ROOT"|"JOINT"):void{
    expect(kind);
    const name=next();
    if(!name||/^[{}]$/.test(name)||joints.some(j=>j.name===name))
      invalid("missing/duplicate joint name "+name);
    const self=joints.length;
    if(self>=512)invalid("too many joints");
    expect("{");
    expect("OFFSET");
    const offset=vec();
    expect("CHANNELS");
    const count=number();
    if(!Number.isInteger(count)||count<0||count>6||
       (kind==="ROOT"&&count===0))invalid("invalid channel count");
    const channels:string[]=[];
    const seen=new Set<string>();
    for(let i=0;i<count;i++){
      const c=next()!;
      if(!channelPattern.test(c)||seen.has(c))
        invalid("unknown/duplicate channel "+c);
      seen.add(c);channels.push(c);
    }
    // Rotation order varies by source; all three angles must be declared
    // together, and translation must be 0 or 3 channels.
    const rotations=channels.filter(c=>c.endsWith("rotation"));
    const positions=channels.filter(c=>c.endsWith("position"));
    if(rotations.length!==3||(positions.length!==0&&positions.length!==3)||
      (kind==="JOINT"&&positions.length>0))
      invalid("unsupported incomplete joint channels "+name);
    channelCount+=count;
    const ends:Vec3[]=[];
    joints.push({name,parent,offset,channels,endSites:ends});
    for(;;){
      const token=tokens[index];
      if(token==="}"){next();break;}
      if(token==="JOINT"){joint(self,"JOINT");continue;}
      if(token==="End"){
        next();expect("Site");expect("{");expect("OFFSET");
        ends.push(vec());expect("}");continue;
      }
      invalid("invalid hierarchy token "+token);
    }
  }
  joint(null,"ROOT");
  expect("MOTION");
  expect("Frames:");
  const frames=number();
  if(!Number.isInteger(frames)||frames<2||frames>2_000_000)
    invalid("invalid frames");
  expect("Frame");
  expect("Time:");
  const frameTimeSeconds=number();
  if(frameTimeSeconds<=0||frameTimeSeconds>1)invalid("invalid frame timing");
  if(channelCount<3||channelCount>4096||
     frames*channelCount>25_000_000)invalid("channel/sample budget");
  const values:number[][]=[];
  for(let i=0;i<frames;i++){
    const frame:number[]=[];
    for(let k=0;k<channelCount;k++)frame.push(number());
    values.push(frame);
  }
  if(index!==tokens.length)invalid("extra motion samples");
  return {schemaVersion:1,joints,frames,frameTimeSeconds,channelCount,values};
}

/** Deterministic unclamped source frame sample; no trajectory loss. */
export function sampleBVHFrame(source:BVHSourceV1,frame:number):BVHSampleV1{
  if(!Number.isInteger(frame)||frame<0||frame>=source.frames)
    invalid("frame index out of range");
  const values=source.values[frame]!;
  let offset=0;
  const rotations:Quat[]=[],translations:Vec3[]=[];
  const rawRoot=[0,0,0];
  for(const joint of source.joints){
    let q:Quat=[0,0,0,1];
    const p=[...joint.offset];
    for(const channel of joint.channels){
      const value=values[offset++]!;
      if(!finite(value))invalid("nonfinite frame channel");
      const axis=channel[0] as Axis;
      const dimension=axis==="X"?0:axis==="Y"?1:2;
      if(channel.endsWith("position")){
        p[dimension]+=value;
        if(rotations.length===0)rawRoot[dimension]=value;
      }
      else q=product(q,axisQuat(axis,value));
    }
    rotations.push(unit(q));
    translations.push([p[0]!,p[1]!,p[2]!]);
  }
  if(offset!==source.channelCount)invalid("channel count mismatch");
  return {rotations,translations,sourceRootTranslation:[rawRoot[0]!,rawRoot[1]!,rawRoot[2]!]};
}
