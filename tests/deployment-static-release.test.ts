import {afterEach,describe,expect,it} from "vitest";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";

const root=resolve("scripts/verify-static-release.mjs");
const sha="a".repeat(40);
const dirs:string[]=[];
function fixture(){
  const dir=mkdtempSync(join(tmpdir(),"trilok-release-"));
  dirs.push(dir);
  mkdirSync(join(dir,"studio"),{recursive:true});
  writeFileSync(join(dir,"index.html"),"<html>game</html>");
  writeFileSync(join(dir,"studio/index.html"),"<html>studio</html>");
  writeFileSync(join(dir,"THIRD_PARTY_NOTICES.txt"),"CC0 sources");
  writeFileSync(join(dir,"build-info.json"),JSON.stringify({
    commitSha:sha,builtAtUtc:"2026-11-19T00:00:00.000Z",buildId:sha.slice(0,8)+"-test",
  }));
  return dir;
}
function check(dir:string,write=false,source=sha){
  return spawnSync(process.execPath,[root,"--dir",dir,"--sha",source,...(write?["--write"]:[])],{
    encoding:"utf8",timeout:5000,
  });
}
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
describe("Immutable development release artifact gate",()=>{
  it("seals a two-entrypoint build and validates identical downloaded bytes",()=>{
    const dir=fixture();
    expect(check(dir,true).status).toBe(0);
    const before=readFileSync(join(dir,"release-manifest.json"),"utf8");
    expect(check(dir).status).toBe(0);
    expect(readFileSync(join(dir,"release-manifest.json"),"utf8")).toBe(before);
    expect(JSON.parse(before).fileCount).toBe(4);
    expect(JSON.parse(before).commitSha).toBe(sha);
  });
  it("rejects wrong source SHA and inconsistent deployed identity",()=>{
    const dir=fixture();
    expect(check(dir,true,"b".repeat(40)).status).not.toBe(0);
    expect(check(dir,true,"latest").status).not.toBe(0);
  });
  it("rejects mutation after hashing or missing the Studio route",()=>{
    const dir=fixture();
    expect(check(dir,true).status).toBe(0);
    writeFileSync(join(dir,"studio/index.html"),"tampered");
    expect(check(dir).status).not.toBe(0);
    rmSync(join(dir,"studio/index.html"));
    expect(check(dir,true).status).not.toBe(0);
  });
  it("refuses symlink artifacts",()=>{
    const dir=fixture();
    symlinkSync(join(dir,"index.html"),join(dir,"link.html"));
    expect(check(dir,true).status).not.toBe(0);
  });
});
