// C3.6: original CC0 MakeHuman body targets; immutable Git-blob correspondence.
// Never imports or executes MakeHuman application code.
import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve,dirname} from "node:path";

const root=new URL("../",import.meta.url);
const manifest=JSON.parse(await readFile(new URL("../assets/makehuman-body-v1.json",import.meta.url),"utf8"));
const output=resolve(new URL("../assets/cache/makehuman-body-v1.json",import.meta.url).pathname);
const publicDir=resolve(new URL("../apps/web/public/anatomy/",import.meta.url).pathname);
const chunkIndex=resolve(publicDir,"makehuman-body-v1-index.json");
const revision="a8bc2d54ff0ac92e78ff71431b1023eda42bf482";
const sha=(bytes,algo="sha256")=>createHash(algo).update(bytes).digest("hex");
const fingerprint=sha(JSON.stringify(manifest));
const digest=payload=>sha(JSON.stringify(payload));
if(manifest.schemaVersion!==1||manifest.revision!==revision||
   manifest.license!=="CC0-1.0"||manifest.targets.length!==846||
   new Set(manifest.targets.map(t=>t.id)).size!==manifest.targets.length)
  throw new Error("Unpinned or incomplete MakeHuman body target manifest");
let cached;
try{cached=JSON.parse(await readFile(output,"utf8"));}catch{}
if(cached?.payload&&cached.contentDigest===digest(cached.payload)&&
   cached.payload?.sourceManifestHash===fingerprint&&
   cached.payload?.targets?.length===manifest.targets.length){
  console.log("MakeHuman CC0 native body atlas verified (cached):",manifest.targets.length);
}else{
  const parsed=new Array(manifest.targets.length);
  let cursor=0;
  async function worker(){
    while(cursor<manifest.targets.length){
      const index=cursor++;
      const entry=manifest.targets[index];
      if(!entry.path.startsWith("makehuman/data/targets/")||
         !entry.path.endsWith(".target")||entry.rawBytes<100||
         !/^[a-f0-9]{40}$/.test(entry.gitBlobSha1))
        throw new Error("Invalid MakeHuman body manifest "+index);
      const url="https://raw.githubusercontent.com/makehumancommunity/makehuman/"+
        revision+"/"+entry.path;
      let bytes;
      for(let attempt=0;attempt<3;attempt++){
        try{
          const response=await fetch(url,{signal:AbortSignal.timeout(60000)});
          if(!response.ok)throw new Error("HTTP "+response.status);
          bytes=Buffer.from(await response.arrayBuffer());
          break;
        }catch(error){
          if(attempt===2)throw new Error("Pinned body fetch "+entry.id+": "+error);
        }
      }
      const git=sha(Buffer.concat([
        Buffer.from("blob "+bytes.length+"\0","utf8"),bytes]),"sha1");
      if(git!==entry.gitBlobSha1||bytes.length!==entry.rawBytes)
        throw new Error("MakeHuman source blob mismatch "+entry.id);
      const source=bytes.toString("utf8");
      if(!source.includes("basemesh hm08")||
         !source.includes("explicitly released as CC0"))
        throw new Error("MakeHuman CC0 source header missing "+entry.id);
      const rows=[],seen=new Set();
      for(const raw of source.split(/\r?\n/)){
        const line=raw.trim();
        if(!line||line.startsWith("#"))continue;
        const parts=line.split(/\s+/);
        if(parts.length!==4)throw new Error("Malformed MakeHuman target "+entry.id);
        const values=parts.map(Number),id=values[0];
        if(!Number.isSafeInteger(id)||id<0||id>=100000||seen.has(id)||
           values.slice(1).some(v=>!Number.isFinite(v)||Math.abs(v)>100))
          throw new Error("Invalid MakeHuman displacement "+entry.id);
        seen.add(id);
        if(values.slice(1).some(v=>v!==0))rows.push(...values);
      }
      parsed[index]={id:entry.id,rows};
    }
  }
  await Promise.all(Array.from({length:20},worker));
  const payload={schemaVersion:1,revision,license:"CC0-1.0",
    units:"MakeHuman source coordinates",sourceManifestHash:fingerprint,targets:parsed};
  const result={payload,contentDigest:digest(payload)};
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(result)+"\n");
  console.log("MakeHuman original body atlas compiled:",
    parsed.length,"targets",parsed.reduce((s,t)=>s+t.rows.length/4,0),"deltas");
}

/** Distribute original source rows across immutable gzip archives. Cloudflare
 * Workers limits each static asset to 25 MiB; keep each chunk below 12 MiB
 * and keep the 846-target full atlas outside the public output. */
const MAX_COMPRESSED_BYTES=12*1024*1024;
const allTargets=cached?.payload?.targets?.length===manifest.targets.length&&
  cached?.contentDigest===digest(cached.payload) ? cached.payload.targets :
  JSON.parse(await readFile(output,"utf8")).payload.targets;
const chunks=[];
let cursor=0;
while(cursor<allTargets.length){
  let size=0;
  const group=[];
  // Cap uncompressed JSON to avoid huge decompression allocations.
  while(cursor<allTargets.length){
    const target=allTargets[cursor];
    const estimated=JSON.stringify(target).length;
    if(group.length&&size+estimated>12*1024*1024)break;
    group.push(target);size+=estimated;cursor++;
  }
  const raw=Buffer.from(JSON.stringify({targets:group}));
  let compressed=gzipSync(raw,{level:6});
  if(compressed.length>MAX_COMPRESSED_BYTES)
    throw new Error("Original CC0 body source chunk exceeds deployable limit");
  const name="makehuman-body-v1-"+String(chunks.length).padStart(3,"0")+".json.gz";
  await mkdir(publicDir,{recursive:true});
  await writeFile(resolve(publicDir,name),compressed);
  chunks.push({name,targetCount:group.length,sha256:sha(compressed),
    compressedBytes:compressed.length,jsonSha256:sha(raw),jsonBytes:raw.length});
}
const index={schemaVersion:1,revision,license:"CC0-1.0",
  sourceManifestHash:fingerprint,targetCount:manifest.targets.length,chunks};
await writeFile(chunkIndex,JSON.stringify(index)+"\n");
console.log("C3.6 cloud deploy chunks:",chunks.length,
  "largest",Math.max(...chunks.map(c=>c.compressedBytes)),"bytes",
  "total",chunks.reduce((n,c)=>n+c.compressedBytes,0),"bytes");
