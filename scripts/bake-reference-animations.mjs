import {createServer} from "vite";
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const sha256=text=>createHash("sha256").update(text,"utf8").digest("hex");
const output=resolve(root,"assets/animations/reference-v1");
const manifestPath=resolve(output,"manifest.json");
const write=process.argv.includes("--write");
const emit=process.argv.includes("--emit");
const server=await createServer({root,server:{middlewareMode:true},appType:"custom",
  logLevel:"error",configFile:false});
try {
  const {createAnatomyPreset}=await server.ssrLoadModule("/packages/character-core/src/presets.ts");
  const {bakeReferenceMotion,REFERENCE_MOTION_SOURCES}=await server.ssrLoadModule(
    "/packages/character-core/src/animation-library.ts");
  const {serializeAnimationClip,parseAnimationClip}=await server.ssrLoadModule(
    "/packages/character-core/src/animation.ts");
  const graph=createAnatomyPreset({archetype:"human"});
  const files={};
  const entries=[];
  for(const source of REFERENCE_MOTION_SOURCES){
    const input=JSON.stringify(source);
    const clip=bakeReferenceMotion(source,graph);
    const content=serializeAnimationClip(clip,graph)+"\n";
    parseAnimationClip(content,graph);
    const filename=source.id+".clip.json";
    files[filename]=content;
    entries.push({id:source.id,label:source.label,filename,
      sourceSha256:sha256(input),artifactSha256:sha256(content),bytes:Buffer.byteLength(content)});
  }
  const manifest=JSON.stringify({
    schemaVersion:1,creator:"trilok",license:"Trilok-Proprietary",
    generator:"packages/character-core/src/animation-library.ts",
    generatorRevision:"c6.2-gait-source-v2",
    toolchain:"Node.js 22 + Vite 6 (repo lockfile)",normalization:"rest_delta; radians; local XYZ quaternion",
    entries,
  },null,2)+"\n";
  files["manifest.json"]=manifest;
  if(write){
    await mkdir(output,{recursive:true});
    for(const [name,content] of Object.entries(files))
      await writeFile(resolve(output,name),content);
  }else if(!emit){
    for(const [name,content] of Object.entries(files)){
      const existing=await readFile(resolve(output,name),"utf8");
      if(existing!==content)throw new Error("Animation bake drift: "+name);
    }
  }
  for(const entry of entries)console.log(entry.id+" "+entry.bytes+" bytes sha256:"+entry.artifactSha256);
  if(emit)console.log("C6_2_BAKE_BEGIN"+JSON.stringify(files)+"C6_2_BAKE_END");
}finally{await server.close();}
