/**
 * C6.2 source-data extraction. Run ONLY in the optional offline acquisition
 * workflow. The public build never requires the large CC0 UAL1 GLB/ZIP.
 * Reads glTF 2.0 FLOAT accessors from the verified standard non-RM GLB.
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {dirname,resolve} from "node:path";
const input=process.argv[2],output=process.argv[3];
const includeSprint=process.argv.includes("--include-sprint");
const includeBind=process.argv.includes("--include-bind");
if(!input||!output)throw new Error("Usage: node scripts/extract-quaternius-ual1.mjs input.glb output.json");
const bytes=await readFile(resolve(input));
const sha256=buffer=>createHash("sha256").update(buffer).digest("hex");
const sourceSha256=sha256(bytes);
if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||
  bytes.readUInt32LE(8)!==bytes.length)throw new Error("Invalid glTF v2 binary");
let at=12,document,bin;
while(at<bytes.length){
  const length=bytes.readUInt32LE(at),type=bytes.readUInt32LE(at+4);
  if(type===0x4e4f534a)document=JSON.parse(bytes.subarray(at+8,at+8+length).toString("utf8"));
  else if(type===0x004e4942)bin=bytes.subarray(at+8,at+8+length);
  at+=8+length;
}
if(!document||!bin)throw new Error("Incomplete GLB chunks");
const gltf=document;
if(gltf.accessors.some(a=>a.sparse))throw new Error("Sparse glTF accessors unsupported");
const dimensions={SCALAR:1,VEC3:3,VEC4:4,MAT4:16};
function accessor(index){
  const a=gltf.accessors[index],view=gltf.bufferViews[a.bufferView];
  if(!a||!view||a.componentType!==5126||!(a.type in dimensions)||view.buffer!==0)
    throw new Error("Unexpected glTF animation accessor "+index);
  const n=dimensions[a.type],stride=view.byteStride??n*4;
  if(stride<n*4)throw new Error("Invalid accessor stride");
  const start=(view.byteOffset??0)+(a.byteOffset??0);
  const values=[];
  for(let i=0;i<a.count;i++){
    const vector=[];
    for(let k=0;k<n;k++){
      const p=start+i*stride+k*4;
      if(p+4>bin.length)throw new Error("Accessor out of bounds");
      const number=bin.readFloatLE(p);
      if(!Number.isFinite(number))throw new Error("Nonfinite source motion");
      vector.push(number);
    }
    values.push(n===1?vector[0]:vector);
  }
  return values;
}
const nodes=gltf.nodes.map((n,i)=>({
  name:n.name??"node_"+i,
  parent:null,
  translation:n.translation??[0,0,0],
  rotation:n.rotation??[0,0,0,1],
  scale:n.scale??[1,1,1],
}));
for(let i=0;i<gltf.nodes.length;i++)
  for(const child of gltf.nodes[i].children??[]){
    if(nodes[child].parent!==null)throw new Error("Multiple source parents");
    nodes[child].parent=i;
  }
const wanted={
  Idle_Loop:"human-idle",
  Walk_Loop:"human-walk",
  Jog_Fwd_Loop:"human-run",
  ...(includeSprint?{Sprint_Loop:"human-sprint"}:{}),
};
const clips=[];
for(const animation of gltf.animations){
  const id=wanted[animation.name];
  if(!id)continue;
  const tracks={};
  let timesSeconds;
  for(const channel of animation.channels){
    const path=channel.target.path;
    if(path==="scale")continue;
    if(path!=="rotation"&&path!=="translation")throw new Error("Unexpected glTF track");
    const sampler=animation.samplers[channel.sampler];
    if(sampler.interpolation&&sampler.interpolation!=="LINEAR")
      throw new Error("Unsupported source interpolation");
    const times=accessor(sampler.input);
    const values=accessor(sampler.output);
    if(!timesSeconds)timesSeconds=times;
    else if(times.length!==timesSeconds.length||times.some((t,i)=>Math.abs(t-timesSeconds[i])>1e-5))
      throw new Error("Nonuniform source sampler times");
    const name=nodes[channel.target.node]?.name;
    if(!name||!values.length||values.length!==times.length)
      throw new Error("Bad source animation channel");
    tracks[name]??={};
    if(tracks[name][path])throw new Error("Duplicate source motion channel");
    tracks[name][path]=values;
  }
  if(!timesSeconds||timesSeconds[0]!==0)throw new Error("Source clip lacks t=0");
  clips.push({id,sourceName:animation.name,
    durationSeconds:timesSeconds.at(-1),timesSeconds,tracks});
}
if(clips.length!==(includeSprint?4:3))throw new Error("Missing selected source locomotion clips");
const source={
  schemaVersion:1,
  creator:"Quaternius",license:"CC0-1.0",
  origin:"https://quaternius.itch.io/universal-animation-library",
  sourceArchiveSha256:"cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724",
  sourceGlbSha256:sourceSha256,
  sourceFilename:"Unreal-Godot/UAL1_Standard.glb",
  importer:"scripts/extract-quaternius-ual1.mjs@1",
  nodes,clips,
  ...(includeBind?{sourceSkin:(()=>{
    const skin=(gltf.skins??[]).find(s=>s.joints?.length>=60&&
      Number.isInteger(s.inverseBindMatrices));
    if(!skin)throw new Error("No glTF skin with inverse bind matrices");
    const inverses=accessor(skin.inverseBindMatrices);
    if(inverses.length!==skin.joints.length||inverses.some(m=>
      m.length!==16||m.some(v=>!Number.isFinite(v))))
      throw new Error("Malformed source inverse bind matrices");
    return {jointNames:skin.joints.map(i=>{
      if(!Number.isSafeInteger(i)||!nodes[i])throw new Error("Invalid skin joint index");
      return nodes[i].name;
    }),inverseBindMatrices:inverses};
  })()}:{}),
};
await mkdir(dirname(resolve(output)),{recursive:true});
await writeFile(resolve(output),JSON.stringify(source)+"\n");
console.log(JSON.stringify({sourceGlbSha256:sourceSha256,clips:clips.map(c=>({name:c.sourceName,id:c.id,frames:c.timesSeconds.length,duration:c.durationSeconds})),bytes:Buffer.byteLength(JSON.stringify(source))}));
