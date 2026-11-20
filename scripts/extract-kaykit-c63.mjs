/**
 * Extract a pinned official CC0 KayKit Adventurers GLB into deterministic
 * authored skeletal channels for C6.3 directional motion. No per-clip rig
 * patches, guessed curves, IK targets or runtime dependencies on GLB.
 *
 * node scripts/extract-kaykit-c63.mjs path/to/Knight.glb output.json
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {dirname,resolve} from "node:path";

const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error("Usage: extract-kaykit-c63.mjs input.glb output.json");
const sourceBytes=await readFile(resolve(input));
const hash=b=>createHash("sha256").update(b).digest("hex");
const SOURCE_SHA="60428e3abc09ba83e595d256e3af8c5c976b46cdae599f0802fc82b4a3445168";
if(hash(sourceBytes)!==SOURCE_SHA)throw Error("KayKit source GLB SHA-256 mismatch");
if(sourceBytes.readUInt32LE(0)!==0x46546c67||
  sourceBytes.readUInt32LE(4)!==2||
  sourceBytes.readUInt32LE(8)!==sourceBytes.length)
  throw Error("Invalid glTF v2 binary source");

let at=12,gltf,bin;
while(at<sourceBytes.length){
  const length=sourceBytes.readUInt32LE(at);
  const kind=sourceBytes.readUInt32LE(at+4);
  if(length<4||at+8+length>sourceBytes.length)throw Error("Bad GLB chunk length");
  if(kind===0x4e4f534a)gltf=JSON.parse(sourceBytes.subarray(at+8,at+8+length).toString("utf8"));
  else if(kind===0x004e4942)bin=sourceBytes.subarray(at+8,at+8+length);
  at+=8+length;
}
if(!gltf||!bin||!Array.isArray(gltf.animations)||gltf.animations.length!==76||
  !Array.isArray(gltf.nodes)||!Array.isArray(gltf.skins))
  throw Error("Unexpected KayKit source structure");
const dims={SCALAR:1,VEC3:3,VEC4:4,MAT4:16};
const cache=new Map();
function accessor(index){
  if(cache.has(index))return cache.get(index);
  const acc=gltf.accessors[index],view=acc&&gltf.bufferViews[acc.bufferView];
  const size=dims[acc?.type];
  if(!acc||!view||acc.sparse||acc.componentType!==5126||!size||
    view.buffer!==0||acc.count<1)throw Error("Unsupported KayKit float accessor "+index);
  const base=(view.byteOffset??0)+(acc.byteOffset??0);
  const stride=view.byteStride??4*size;
  if(stride<4*size||base+stride*(acc.count-1)+4*size>bin.length)
    throw Error("Accessor overflows binary chunk");
  const output=[];
  for(let i=0;i<acc.count;i++){
    const value=[];
    for(let j=0;j<size;j++){
      const n=bin.readFloatLE(base+i*stride+j*4);
      if(!Number.isFinite(n))throw Error("Nonfinite authored animation value");
      value.push(n);
    }
    output.push(size===1?value[0]:value);
  }
  cache.set(index,output);
  return output;
}
const nodes=gltf.nodes.map((n,i)=>{
  if(n.matrix)throw Error("Unexpected source node matrix "+i);
  return {name:n.name??"node_"+i,parent:null,
    translation:n.translation??[0,0,0],
    rotation:n.rotation??[0,0,0,1],
    scale:n.scale??[1,1,1]};
});
for(let i=0;i<gltf.nodes.length;i++)
  for(const c of gltf.nodes[i].children??[]){
    if(!nodes[c]||nodes[c].parent!==null)throw Error("Invalid source hierarchy");
    nodes[c].parent=i;
  }
const byName=new Map();
nodes.forEach((n,i)=>{
  if(byName.has(n.name))throw Error("Duplicate authored source node "+n.name);
  byName.set(n.name,i);
});
const wanted=[
  ["Walking_Backwards","human-backward"],
  ["Running_Strafe_Left","human-strafe-left"],
  ["Running_Strafe_Right","human-strafe-right"],
];
const durationFor=clip=>{
  let max=0;
  for(const sampler of clip.samplers){
    const times=accessor(sampler.input);
    max=Math.max(max,times.at(-1));
  }
  return max;
};
function sampleCurve(values,times,interpolation,time,path){
  if(values.length!==times.length)throw Error("Invalid sampler dimensions");
  if(times[0]>0||times.at(-1)<time-1e-5||
    times.some((v,i)=>i>0&&v<=times[i-1]))
    throw Error("Unsupported sampler timeline");
  if(interpolation!=="LINEAR"&&interpolation!=="STEP")
    throw Error("Unsupported authored interpolation "+interpolation);
  let low=0,high=times.length-1;
  while(low<high){
    const mid=(low+high)>>1;
    if(times[mid]<time)low=mid+1;else high=mid;
  }
  if(low===0)return [...values[0]];
  const b=low,a=b-1;
  if(Math.abs(time-times[b])<1e-8)return [...values[b]];
  const alpha=interpolation==="STEP"?0:(time-times[a])/(times[b]-times[a]);
  if(path==="rotation"){
    let dot=values[a].reduce((s,v,k)=>s+v*values[b][k],0);
    const sign=dot<0?-1:1;
    // Stable source quaternion slerp (not Euler channel manipulation).
    dot=Math.min(1,Math.max(-1,dot*sign));
    let wa=1-alpha,wb=alpha;
    if(dot<.9995){
      const omega=Math.acos(dot),sin=Math.sin(omega);
      wa=Math.sin((1-alpha)*omega)/sin;
      wb=Math.sin(alpha*omega)/sin;
    }
    const out=values[a].map((v,k)=>v*wa+sign*values[b][k]*wb);
    const magnitude=Math.hypot(...out);
    return out.map(v=>v/magnitude);
  }
  return values[a].map((v,k)=>v+(values[b][k]-v)*alpha);
}
const clips=[];
for(const [name,id] of wanted){
  const animation=gltf.animations.find(a=>a.name===name);
  if(!animation)throw Error("Missing CC0 directional motion "+name);
  const duration=durationFor(animation);
  if(!(duration>.3&&duration<30))throw Error("Invalid source duration "+name);
  const count=Math.round(duration*30)+1;
  if(count>400)throw Error("Unexpected motion length "+name);
  const timesSeconds=Array.from({length:count},(_,i)=>i===count-1?duration:
    Number((i*duration/(count-1)).toFixed(9)));
  const tracks={};
  for(const channel of animation.channels){
    const path=channel.target.path;
    if(!["rotation","translation","scale"].includes(path))
      throw Error("Unsupported source path "+path);
    const sampler=animation.samplers[channel.sampler];
    const times=accessor(sampler.input),values=accessor(sampler.output);
    const node=nodes[channel.target.node];
    if(!node)throw Error("Invalid source track node");
    const interpolation=sampler.interpolation??"LINEAR";
    const samples=timesSeconds.map(time=>sampleCurve(values,times,interpolation,time,path));
    tracks[node.name]??={};
    if(tracks[node.name][path])throw Error("Duplicate animated node/channel");
    tracks[node.name][path]=samples;
  }
  clips.push({sourceName:name,id,durationSeconds:duration,timesSeconds,tracks});
}
const skin=gltf.skins.find(s=>s.joints.length===41&&
  Number.isInteger(s.inverseBindMatrices));
if(!skin)throw Error("KayKit source does not expose expected 41-joint bind");
const inverses=accessor(skin.inverseBindMatrices);
const sourceSkin={
  jointNames:skin.joints.map(i=>nodes[i].name),
  inverseBindMatrices:inverses,
};
const source={
  schemaVersion:1,creator:"Kay Lousberg (KayKit)",license:"CC0-1.0",
  origin:"https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0",
  revision:"672074b73ba276876a19e8816ecdc5241817ab47",
  sourceGlbSha256:SOURCE_SHA,sourceGlbPath:"addons/kaykit_character_pack_adventures/Characters/gltf/Knight.glb",
  extractionTool:"scripts/extract-kaykit-c63.mjs@1",nodes,sourceSkin,clips,
};
await mkdir(dirname(resolve(output)),{recursive:true});
await writeFile(resolve(output),JSON.stringify(source)+"\n");
console.log(JSON.stringify({sourceGlbSha256:SOURCE_SHA,
  bytes:Buffer.byteLength(JSON.stringify(source)),
  clips:clips.map(c=>({name:c.sourceName,id:c.id,
    duration:c.durationSeconds,keys:c.timesSeconds.length,tracks:Object.keys(c.tracks).length})),
  sourceSkinJoints:sourceSkin.jointNames.length}));
