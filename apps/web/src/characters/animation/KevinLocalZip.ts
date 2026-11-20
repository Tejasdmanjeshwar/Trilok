/**
 * Private, memory-only import of the OWNER'S licensed Basic Motions ZIP.
 * No asset bytes, decoded keys, profile, or ZIP member are sent to a server.
 * Extract only explicitly requested FBX entries; refuse bombs, traversal and
 * unknown archive versions. Works in Chromium (DecompressionStream deflate-raw).
 */
export const KEVIN_ARCHIVE_SHA256 =
  "063d5e1822f85549d14035ef342b1feae45bac37962499a8b478c7eb997200cd";
export const KEVIN_INITIAL_FBX = [
  ["human-kevin-idle", "Animations/Male/Idles/HumanM@Idle01.fbx", "locked"],
  ["human-kevin-walk", "Animations/Male/Movement/Walk/HumanM@Walk01_Forward.fbx", "visual_only"],
  ["human-kevin-run", "Animations/Male/Movement/Run/HumanM@Run01_Forward.fbx", "visual_only"],
] as const;

const MAX_ARCHIVE_BYTES=32*1024*1024;
const MAX_MEMBER_BYTES=8*1024*1024;
const decoder=new TextDecoder("utf-8",{fatal:true});

export function kevinHex(bytes:ArrayBuffer):Promise<string> {
  return crypto.subtle.digest("SHA-256",bytes).then(value=>
    Array.from(new Uint8Array(value),x=>x.toString(16).padStart(2,"0")).join(""));
}
async function inflateDeflateRaw(source:Uint8Array<ArrayBuffer>,size:number):Promise<Uint8Array<ArrayBuffer>> {
  if(typeof DecompressionStream!=="function")
    throw Error("Browser does not support ZIP deflate decompression");
  const reader=new Blob([source]).stream()
    .pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  let n=0;
  const parts:Uint8Array<ArrayBuffer>[]=[];
  try {
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      n+=value.byteLength;
      if(n>size||n>MAX_MEMBER_BYTES)throw Error("Oversized ZIP decompression output");
      parts.push(new Uint8Array(value));
    }
    if(n!==size)throw Error("Truncated ZIP member");
    const result=new Uint8Array(n);
    let at=0;
    for(const chunk of parts){result.set(chunk,at);at+=chunk.length;}
    return result;
  }finally{reader.releaseLock();}
}
function crc32(data:Uint8Array):number {
  let crc=0xffffffff;
  for(const b of data){
    crc^=b;
    for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
/** ZIP central-directory extraction with exact path allowlist. No filesystem. */
export async function extractKevinZipMembers(
  bytes:ArrayBuffer,requested:readonly string[],
):Promise<ReadonlyMap<string,ArrayBuffer>> {
  if(bytes.byteLength<22||bytes.byteLength>MAX_ARCHIVE_BYTES)
    throw Error("Kevin ZIP outside permitted size range");
  const data=new DataView(bytes),raw=new Uint8Array(bytes);
  const read16=(at:number)=>data.getUint16(at,true);
  const read32=(at:number)=>data.getUint32(at,true);
  let eocd=-1;
  const minimum=Math.max(0,bytes.byteLength-65557);
  for(let i=bytes.byteLength-22;i>=minimum;i--)
    if(read32(i)===0x06054b50){eocd=i;break;}
  if(eocd<0||read16(eocd+4)!==0||read16(eocd+6)!==0)
    throw Error("Invalid ZIP end record / multi-disk ZIP");
  const count=read16(eocd+10);
  const centralSize=read32(eocd+12),centralOffset=read32(eocd+16);
  if(count>2048||centralOffset+centralSize>eocd||
    read16(eocd+20)+eocd+22!==bytes.byteLength)
    throw Error("Invalid ZIP central directory bounds");
  const wanted=new Set(requested);
  if(wanted.size!==requested.length||wanted.size>12||
    requested.some(p=>!p.startsWith("Animations/Male/")||
      p.split("/").some(segment=>segment===".."||segment===".") ||
      p.includes("\\\\") ||
      !/^Animations\/Male\/[a-zA-Z0-9_@.\-/ ]+\.fbx$/.test(p)))
    throw Error("Unexpected Kevin archive member request");
  const extracted=new Map<string,ArrayBuffer>();
  let cursor=centralOffset;
  for(let i=0;i<count;i++){
    if(cursor+46>bytes.byteLength||read32(cursor)!==0x02014b50)
      throw Error("Damaged ZIP central entry");
    const flags=read16(cursor+8),method=read16(cursor+10);
    const expectedCRC=read32(cursor+16);
    const compressed=read32(cursor+20),uncompressed=read32(cursor+24);
    const nameLength=read16(cursor+28),extraLength=read16(cursor+30);
    const commentLength=read16(cursor+32),localOffset=read32(cursor+42);
    const next=cursor+46+nameLength+extraLength+commentLength;
    if(next>centralOffset+centralSize)throw Error("Invalid ZIP central filename");
    const name=decoder.decode(raw.subarray(cursor+46,cursor+46+nameLength));
    cursor=next;
    if(!wanted.has(name))continue;
    if(extracted.has(name)||uncompressed===0||uncompressed>MAX_MEMBER_BYTES||
      compressed>MAX_MEMBER_BYTES||(flags&1)!==0||
      (method!==0&&method!==8))
      throw Error("Invalid or duplicate Kevin FBX ZIP member "+name);
    if(localOffset+30>bytes.byteLength||read32(localOffset)!==0x04034b50)
      throw Error("Damaged ZIP local header "+name);
    const localNameLength=read16(localOffset+26),localExtraLength=read16(localOffset+28);
    const fileOffset=localOffset+30+localNameLength+localExtraLength;
    if(fileOffset+compressed>centralOffset)
      throw Error("ZIP member overlaps central directory "+name);
    const localName=decoder.decode(raw.subarray(localOffset+30,localOffset+30+localNameLength));
    if(localName!==name)throw Error("ZIP local/central name mismatch");
    const dataBytes=new Uint8Array(bytes.slice(fileOffset,fileOffset+compressed));
    const output=method===0?dataBytes:
      await inflateDeflateRaw(dataBytes,uncompressed);
    if(output.byteLength!==uncompressed||crc32(output)!==expectedCRC)
      throw Error("ZIP member checksum mismatch "+name);
    if(decoder.decode(output.subarray(0,0))!=="" ||
      output.byteLength<27||new TextDecoder().decode(output.subarray(0,18))!=="Kaydara FBX Binary")
      throw Error("Kevin archive member is not binary FBX "+name);
    const fbxVersion=new DataView(output.buffer,output.byteOffset,output.byteLength).getUint32(23,true);
    if(fbxVersion!==7700)throw Error("Unexpected Kevin regular FBX version "+fbxVersion);
    extracted.set(name,output.buffer.slice(output.byteOffset,output.byteOffset+output.byteLength));
  }
  if(extracted.size!==wanted.size)
    throw Error("Kevin ZIP missing required FBX members: "+
      [...wanted].filter(x=>!extracted.has(x)).join(", "));
  return extracted;
}
export async function importOwnedKevinZip(
  file:File,requested:readonly string[]=KEVIN_INITIAL_FBX.map(x=>x[1]),
):Promise<{readonly archiveSha256:string;readonly members:ReadonlyMap<string,ArrayBuffer>}> {
  if(file.size>MAX_ARCHIVE_BYTES)throw Error("Owner ZIP too large");
  const bytes=await file.arrayBuffer();
  const digest=await kevinHex(bytes);
  if(digest!==KEVIN_ARCHIVE_SHA256)
    throw Error("This is not the verified regular Human Basic Motions FREE ZIP. No clips imported.");
  return {archiveSha256:digest,members:await extractKevinZipMembers(bytes,requested)};
}
