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
  const gitHash=createHash("sha1").update("blob "+bytes.length+String.fromCharCode(0)).update(bytes).digest("hex");
  if(gitHash!==manifest.gitBlobSha1)throw new Error("MakeHuman asset Git blob checksum mismatch");
  const sha256=createHash("sha256").update(bytes).digest("hex");
  if(sha256!==manifest.sha256)throw new Error("MakeHuman asset SHA-256 mismatch");
  return sha256;
}
let cached;
try{cached=await readFile(target);}catch{}
let cacheVerified=false;
if(cached){
  try{const sha256=await verify(cached);console.log("MakeHuman CC0 verified (cached): SHA256",sha256);cacheVerified=true;}
  catch{console.warn("Cached anatomy asset invalid; re-fetching pinned upstream");}
}
if(!cacheVerified){
const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
if(!response.ok)throw new Error("Pinned MakeHuman download failed: HTTP "+response.status);
const bytes=Buffer.from(await response.arrayBuffer());
const sha256=await verify(bytes);
await mkdir(dirname(target),{recursive:true});
await writeFile(target,bytes);
console.log("MakeHuman CC0 pinned asset verified:",bytes.length,"bytes; SHA256",sha256);
}

/**
 * C2.2: the matching official MakeHuman default skeleton and vertex weights
 * are CC0 data from the same immutable revision as base.obj. Verify Git blob
 * identity and exact byte counts before copying into public anatomy assets.
 * Never download from third-party rigs or execute MakeHuman application code.
 */
for(const data of [
  {path:"makehuman/data/rigs/default.mhskel",target:"apps/web/public/anatomy/makehuman-default.mhskel",
   bytes:117790,gitBlobSha1:"b02cbecae00143856410d7561adf006d83bf9b3e"},
  {path:"makehuman/data/rigs/default_weights.mhw",target:"apps/web/public/anatomy/makehuman-default_weights.mhw",
   bytes:897521,gitBlobSha1:"66185806afacf87749be8e5cf6dbf66496b2a6b0"},
]){
  const file=resolve(root,data.target);
  function verifySource(bytes){
    if(bytes.length!==data.bytes)throw new Error("Official rig size mismatch: "+data.path);
    const git=createHash("sha1").update("blob "+bytes.length+String.fromCharCode(0))
      .update(bytes).digest("hex");
    if(git!==data.gitBlobSha1)throw new Error("Official rig Git checksum mismatch: "+data.path);
    const parsed=JSON.parse(bytes.toString("utf8"));
    if(parsed.license!=="CC0")throw new Error("Official rig is not labeled CC0: "+data.path);
    return true;
  }
  let existing;
  try{existing=await readFile(file);}catch{}
  try{if(existing&&verifySource(existing))continue;}catch{}
  const pinnedUrl="https://raw.githubusercontent.com/makehumancommunity/makehuman/"+
    manifest.revision+"/"+data.path;
  const sourceResponse=await fetch(pinnedUrl,{signal:AbortSignal.timeout(45000)});
  if(!sourceResponse.ok)throw new Error("Official rig download failed: "+data.path+
    " ("+sourceResponse.status+")");
  const bytes=Buffer.from(await sourceResponse.arrayBuffer());
  verifySource(bytes);
  await mkdir(dirname(file),{recursive:true});
  await writeFile(file,bytes);
  console.log("MakeHuman CC0 official rig verified:",data.path,bytes.length,"bytes");
}

// Fetch and compile original CC0 facial targets from the same pinned revision.
await import("./fetch-makehuman-facial.mjs");
