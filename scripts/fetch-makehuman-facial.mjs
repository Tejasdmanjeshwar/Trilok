// C3.5: pinned CC0 MakeHuman facial targets, precompiled without external editors.
// Runs during the existing asset acquisition step; no runtime upstream requests.
import {createHash} from "node:crypto";
import {fetchPinnedSourceBytes} from "./fetch-pinned-source.mjs";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url));
const manifest=JSON.parse(await readFile(resolve(root,"assets/makehuman-facial-v1.json"),"utf8"));
const output=resolve(root,"apps/web/public/anatomy/makehuman-facial-v1.json");
const sourceRevision="a8bc2d54ff0ac92e78ff71431b1023eda42bf482";
if(manifest.schemaVersion!==1||manifest.revision!==sourceRevision||
   manifest.license!=="CC0-1.0"||!Array.isArray(manifest.targets)||
   manifest.targets.length<50)throw new Error("Unpinned MakeHuman facial corpus");
const sha=(data,algorithm="sha256")=>createHash(algorithm).update(data).digest("hex");
const sourceManifestHash=sha(JSON.stringify(manifest));
function digest(payload){return sha(JSON.stringify(payload));}
function verifyCached(result){
  if(result?.contentDigest!==digest(result.payload)||
     result.payload?.revision!==sourceRevision||
     result.payload?.sourceManifestHash!==sourceManifestHash||
     result.payload?.targets?.length!==manifest.targets.length)
    throw new Error("Cached facial atlas does not match pinned corpus");
  const ids=result.payload.targets.map(t=>t.id);
  if(new Set(ids).size!==ids.length)throw new Error("Duplicate compiled facial target");
}
let valid=false;
try{
 const cached=JSON.parse(await readFile(output,"utf8"));
 verifyCached(cached);valid=true;
}catch{}
if(valid)console.log("MakeHuman CC0 facial targets verified (cached):",manifest.targets.length);
else{
  const targets=new Array(manifest.targets.length);
  let cursor=0;
  async function worker(){
    while(cursor<manifest.targets.length){
      const index=cursor++;
      const asset=manifest.targets[index];
      if(!asset.path.startsWith("makehuman/data/targets/")||
         !asset.path.endsWith(".target")||
         !asset.id||asset.rawBytes<100||!/^[a-f0-9]{40}$/.test(asset.gitBlobSha1))
        throw new Error("Invalid facial asset manifest entry "+index);
      const url="https://raw.githubusercontent.com/makehumancommunity/makehuman/"+
        sourceRevision+"/"+asset.path;
      const bytes=await fetchPinnedSourceBytes(url,{timeoutMs:45_000});
      const gitBlob=sha(Buffer.concat([
        Buffer.from("blob "+bytes.length+"\0","utf8"),bytes]),"sha1");
      if(bytes.length!==asset.rawBytes||gitBlob!==asset.gitBlobSha1)
        throw new Error("MakeHuman facial Git blob identity failed: "+asset.id);
      const source=bytes.toString("utf8");
      if(!source.includes("basemesh hm08")||
         !source.includes("explicitly released as CC0"))
        throw new Error("MakeHuman facial source/license header mismatch: "+asset.id);
      const rows=[];
      const seen=new Set();
      for(const raw of source.split(/\r?\n/)){
        const line=raw.trim();
        if(!line||line.startsWith("#"))continue;
        const values=line.split(/\s+/);
        if(values.length!==4)throw new Error("Invalid .target row: "+asset.id);
        const [vertex,x,y,z]=values.map(Number);
        if(!Number.isSafeInteger(vertex)||vertex<0||vertex>=100000||
           [x,y,z].some(v=>!Number.isFinite(v)||Math.abs(v)>10)||
           seen.has(vertex))throw new Error("Invalid facial delta index/value: "+asset.id);
        seen.add(vertex);
        if(x||y||z)rows.push(vertex,x,y,z);
      }
      if(!rows.length)throw new Error("Empty MakeHuman facial target: "+asset.id);
      targets[index]={id:asset.id,rows};
    }
  }
  await Promise.all(Array.from({length:Math.min(8,manifest.targets.length)},worker));
  const payload={schemaVersion:1,revision:sourceRevision,license:"CC0-1.0",
    sourceManifestHash,units:"MakeHuman source coordinates",targets};
  const document={payload,contentDigest:digest(payload)};
  verifyCached(document);
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(document)+"\n");
  console.log("MakeHuman CC0 source-indexed facial atlas generated:",
    manifest.targets.length,"targets,",targets.reduce((n,t)=>n+t.rows.length/4,0),
    "sparse displacement records");
}
