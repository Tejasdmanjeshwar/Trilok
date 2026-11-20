import {describe,expect,it} from "vitest";
import {deflateRawSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {
  KEVIN_ARCHIVE_SHA256,KEVIN_INITIAL_FBX,extractKevinZipMembers,importOwnedKevinZip,
} from "../apps/web/src/characters/animation/KevinLocalZip";
const first=KEVIN_INITIAL_FBX[0]![1];
const expected=new Uint8Array(35);
const encoder=new TextEncoder();
expected.set(encoder.encode("Kaydara FBX Binary  \0"),0);
new DataView(expected.buffer).setUint32(23,7700,true);
function crc32(data:Uint8Array):number{
  let x=0xffffffff;
  for(const b of data){
    x^=b;
    for(let i=0;i<8;i++)x=(x>>>1)^((x&1)?0xedb88320:0);
  }
  return (x^0xffffffff)>>>0;
}
function zip(path:string,original=expected,method:0|8=8,corrupt=false):ArrayBuffer {
  const name=encoder.encode(path);
  const compressed=method===8?deflateRawSync(original):original;
  const local=new Uint8Array(30+name.length+compressed.length);
  const l=new DataView(local.buffer);
  l.setUint32(0,0x04034b50,true);
  l.setUint16(4,20,true);l.setUint16(8,method,true);
  l.setUint32(14,corrupt?1:crc32(original),true);
  l.setUint32(18,compressed.length,true);l.setUint32(22,original.length,true);
  l.setUint16(26,name.length,true);
  local.set(name,30);local.set(compressed,30+name.length);
  const central=new Uint8Array(46+name.length);
  const c=new DataView(central.buffer);
  c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);
  c.setUint16(6,20,true);c.setUint16(10,method,true);
  c.setUint32(16,corrupt?1:crc32(original),true);
  c.setUint32(20,compressed.length,true);c.setUint32(24,original.length,true);
  c.setUint16(28,name.length,true);
  central.set(name,46);
  const end=new Uint8Array(22);const e=new DataView(end.buffer);
  e.setUint32(0,0x06054b50,true);e.setUint16(8,1,true);
  e.setUint16(10,1,true);e.setUint32(12,central.length,true);
  e.setUint32(16,local.length,true);
  const bytes=new Uint8Array(local.length+central.length+end.length);
  bytes.set(local);bytes.set(central,local.length);
  bytes.set(end,local.length+central.length);
  return bytes.buffer;
}
describe("C6.3 private local ZIP decoder",()=>{
  it("never accepts a different ZIP even when it contains a plausible FBX",async()=>{
    const mock=new File([zip(first)],"Human Basic Motions FREE.zip");
    await expect(importOwnedKevinZip(mock,[first])).rejects.toThrow(/not the verified/);
    expect(KEVIN_ARCHIVE_SHA256)
      .toBe("063d5e1822f85549d14035ef342b1feae45bac37962499a8b478c7eb997200cd");
  });
  it("extracts only requested FBX paths with real deflate+CRC verification",async()=>{
    const archive=zip(first);
    const result=await extractKevinZipMembers(archive,[first]);
    expect(result.size).toBe(1);
    expect(new Uint8Array(result.get(first)!)).toEqual(expected);
    await expect(extractKevinZipMembers(zip(first,expected,8,true),[first]))
      .rejects.toThrow(/checksum/);
  });
  it("rejects traversal, unapproved source paths, missing bones and invalid version",async()=>{
    await expect(extractKevinZipMembers(zip(first),["../secrets.fbx"]))
      .rejects.toThrow(/member request/);
    await expect(extractKevinZipMembers(zip(first),[KEVIN_INITIAL_FBX[1]![1]]))
      .rejects.toThrow(/missing required/);
    const wrong=expected.slice();
    new DataView(wrong.buffer).setUint32(23,7300,true);
    await expect(extractKevinZipMembers(zip(first,wrong),[first]))
      .rejects.toThrow(/version/);
  });
  it("tracks exact user-provided source paths but no committed Kevin motion curves",()=>{
    expect(KEVIN_INITIAL_FBX.map(([id])=>id)).toEqual([
      "human-kevin-idle","human-kevin-walk","human-kevin-run",
    ]);
    const library=readFileSync("apps/web/src/studio/StudioAnimationLibrary.ts","utf8");
    expect(library).not.toContain("human-kevin-idle");
    expect(library).not.toContain("human-kevin-walk");
    expect(library).not.toContain("human-kevin-run");
  });
});
