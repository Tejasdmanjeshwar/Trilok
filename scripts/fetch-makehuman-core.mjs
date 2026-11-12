// Reproducible asset acquisition for browser build; never invokes MakeHuman/Blender.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url));
const manifest=JSON.parse(await readFile(resolve(root,"assets/makehuman-core.json"),"utf8"));
const target=resolve(root,manifest.target);
const url="https://raw.githubusercontent.com/makehumancommunity/makehuman/"+
  manifest.revision+"/"+manifest.path;
async function verify(bytes){
  if(bytes.length!==manifest.rawBytes)throw new Error("MakeHuman asset size mismatch");
  const gitHash=createHash("sha1").update("blob "+bytes.length+"\\0".replace("\\\\0","\\0")).update(bytes).digest("hex");
  if(gitHash!==manifest.gitBlobSha1)throw new Error("MakeHuman asset Git blob checksum mismatch");
  return createHash("sha256").update(bytes).digest("hex");
}
let cached;
try{cached=await readFile(target);}catch{}
if(cached){
  try{const sha256=await verify(cached);console.log("MakeHuman CC0 verified (cached): SHA256",sha256);process.exit(0);}
  catch{console.warn("Cached anatomy asset invalid; re-fetching pinned upstream");}
}
const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
if(!response.ok)throw new Error("Pinned MakeHuman download failed: HTTP "+response.status);
const bytes=Buffer.from(await response.arrayBuffer());
const sha256=await verify(bytes);
await mkdir(dirname(target),{recursive:true});
await writeFile(target,bytes);
console.log("MakeHuman CC0 pinned asset verified:",bytes.length,"bytes; SHA256",sha256);
