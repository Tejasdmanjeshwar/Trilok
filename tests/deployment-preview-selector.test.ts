import {afterEach,describe,expect,it} from "vitest";
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";

const script=resolve("scripts/resolve-netlify-preview.mjs");
const repository="Tejasdmanjeshwar/Trilok";
const sha="a".repeat(40);
const branch="feat/example-preview";
const dirs:string[]=[];
function runSelector(options:{
  head?:string,prNumber?:number,prState?:string,fork?:boolean,
  runs?:Record<string,unknown>[],branch?:string,
}={}){
  const dir=mkdtempSync(join(tmpdir(),"trilok-preview-selector-")); dirs.push(dir);
  const number=options.prNumber??112;
  const head=options.head??sha;
  const ref=options.branch??branch;
  const pr={
    number,state:options.prState??"open",
    head:{sha:head,ref,repo:{full_name:options.fork?"another/repo":repository}},
    base:{ref:"main",repo:{full_name:repository}},
  };
  const valid={
    id:345,run_number:11,name:"Verify",workflow_id:777,
    status:"completed",conclusion:"success",event:"pull_request",
    repository:{full_name:repository},head_sha:head,head_branch:ref,
    pull_requests:[{number}],
  };
  const paths = [join(dir,"pr.json"),join(dir,"workflow.txt"),join(dir,"runs.json")] as const;
  writeFileSync(paths[0],JSON.stringify(pr));
  writeFileSync(paths[1],"777");
  writeFileSync(paths[2],JSON.stringify({workflow_runs:options.runs??[valid]}));
  const envPath=join(dir,"env");
  const result=spawnSync(process.execPath,[script,...paths],{
    encoding:"utf8",timeout:5000,
    env:{...process.env,PREVIEW_PR_NUMBER:String(number),
      GITHUB_REPOSITORY:repository,GITHUB_ENV:envPath},
  });
  return {...result, output:result.status===0?readFileSync(envPath,"utf8"):""};
}
afterEach(()=>{for(const path of dirs.splice(0))rmSync(path,{recursive:true,force:true});});
describe("Netlify latest-verified PR auto-selection",()=>{
  it("resolves current PR SHA and successful Verify run without user hashes or run IDs",()=>{
    const result=runSelector();
    expect(result.status).toBe(0);
    expect(result.output).toContain("APPROVED_SOURCE_SHA="+sha+"\n");
    expect(result.output).toContain("APPROVED_VERIFY_RUN=345\n");
    expect(result.output).toContain("APPROVED_PR_NUMBER=112\n");
  });
  it("refuses a previous passing run after PR head moves",()=>{
    const old="b".repeat(40);
    const result=runSelector({runs:[{id:345,run_number:10,name:"Verify",workflow_id:777,
      status:"completed",conclusion:"success",event:"pull_request",
      repository:{full_name:repository},head_sha:old,head_branch:branch,
      pull_requests:[{number:112}]}]});
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("no successful exact-SHA Verify run");
  });
  it("refuses forked or closed PRs",()=>{
    expect(runSelector({fork:true}).status).not.toBe(0);
    expect(runSelector({prState:"closed"}).status).not.toBe(0);
  });
  it("rejects unrelated or unsuccessful Verify runs",()=>{
    expect(runSelector({runs:[{id:345,run_number:11,name:"Verify",workflow_id:778,
      status:"completed",conclusion:"success",event:"pull_request",
      repository:{full_name:repository},head_sha:sha,head_branch:branch,
      pull_requests:[{number:112}]}]}).status).not.toBe(0);
    expect(runSelector({runs:[]}).status).not.toBe(0);
  });
  it("selects the latest successful Verify for a matching current PR head",()=>{
    const matching=(id:number,sequence:number)=>({
      id,run_number:sequence,name:"Verify",workflow_id:777,
      status:"completed",conclusion:"success",event:"pull_request",
      repository:{full_name:repository},head_sha:sha,head_branch:branch,
      pull_requests:[{number:112}],
    });
    const result=runSelector({runs:[matching(201,7),matching(302,10),matching(102,5)]});
    expect(result.status).toBe(0);
    expect(result.output).toContain("APPROVED_VERIFY_RUN=302\n");
  });
});
