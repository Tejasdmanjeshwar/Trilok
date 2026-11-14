#!/usr/bin/env node
/**
 * One-shot, audited branch housekeeping on the ORIGINAL Trilok repository.
 * GitHub's normal "Automatically delete head branches" setting should handle
 * future merges; this script cleans historical leftovers only.
 *
 * Dry-run default: node scripts/cleanup-merged-branches.mjs
 * Apply (manual Actions workflow only):
 *   TRILOK_BRANCH_CLEANUP_MODE=apply node scripts/cleanup-merged-branches.mjs
 *
 * A merged branch qualifies ONLY when its current tip matches the PR's
 * recorded head SHA. Closed/unmerged C3.5 prototypes require a separate flag,
 * and their exact names are allowlisted. Open PRs, unknown and protected refs
 * are always excluded. This does not purge Git history or PR discussions.
 */
import {appendFileSync} from "node:fs";

const repo=process.env.GITHUB_REPOSITORY;
const token=process.env.GITHUB_TOKEN;
if(!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
  throw new Error("GITHUB_REPOSITORY must be a valid owner/repo");
if(!token)throw new Error("GITHUB_TOKEN is required");
const mode=process.env.TRILOK_BRANCH_CLEANUP_MODE??"dry-run";
if(mode!=="apply"&&mode!=="dry-run")throw new Error("Unsupported cleanup mode");
const retireRejected=process.env.TRILOK_RETIRE_REJECTED==="true";
if(mode==="apply" && process.env.TRILOK_BRANCH_CLEANUP_CONFIRM!=="DELETE_VERIFIED_BRANCHES")
  throw new Error("Missing explicit deletion confirmation");
const rejectedAllowlist=new Set([
  "feature/c3-5-continuous-private-reference-morph",
  "feature/c3-5-facial-topology-controls",
  "feature/c3-5-hanuman-face-reference-reconstruction",
  "feature/c3-5-licensed-hanuman-face-atlas",
  "feature/c3-5-scan-backed-head-replacement",
  // Superseded C2 research PR #13 (closed after accepting C2 on main).
  "feat/character-studio-c2-skinned-human",
]);
// This rejected branch was advanced to a main-ancestor after the PR closed.
// Its exact present SHA is pinned separately; never infer safety from PR #53.
const retargetedRejectedTips=new Map([
  ["feature/c3-5-facial-topology-controls","7bcaf77b4be5b70e5fa055a1189ae0cdd84ff211"],
]);
const orphanAllowlist=new Map([
  // Abandoned experimental C2.4 attempt, replaced by merged PR #24.
  ["feat/c2-4-distributed-forearm-twist","f4fe7660308ec7ced4f41907d5f81736c9bbc858"],
]);
const api="https://api.github.com/repos/"+repo;
const headers={
  Authorization:"Bearer "+token,
  Accept:"application/vnd.github+json",
  "X-GitHub-Api-Version":"2022-11-28",
};
async function request(path,method="GET"){
  const response=await fetch(api+path,{method,headers,signal:AbortSignal.timeout(30000)});
  if(method==="DELETE"&&response.status===204)return null;
  if(!response.ok)throw new Error(method+" "+path+" HTTP "+response.status+" "+
    (await response.text()).slice(0,300));
  return response.json();
}
async function allPages(path){
  const result=[];
  for(let page=1;page<=30;page++){
    const list=await request(path+(path.includes("?")?"&":"?")+"per_page=100&page="+page);
    if(!Array.isArray(list))throw new Error("Unexpected GitHub pagination result");
    result.push(...list);
    if(list.length<100)return result;
  }
  throw new Error("Pagination limit reached: inspect repository");
}
const [repoInfo,branches,prs]=await Promise.all([
  request(""),allPages("/branches"),allPages("/pulls?state=all"),
]);
const openHead=new Set(prs.filter(pr=>pr.state==="open").map(pr=>pr.head.ref));
const outcomes=[];
for(const branch of branches.sort((a,b)=>a.name.localeCompare(b.name))){
  const name=branch.name;
  if(name===repoInfo.default_branch || branch.protected || openHead.has(name))continue;
  const matching=prs.filter(pr=>pr.head.ref===name&&
    pr.head.repo?.full_name===repo).sort((a,b)=>b.number-a.number);
  const latest=matching[0];
  const matchingTip=latest?.head.sha===branch.commit.sha;
  let reason="";
  if(matchingTip&&latest?.merged_at)reason="verified merged PR #"+latest.number;
  else if(matchingTip&&retireRejected&&rejectedAllowlist.has(name)&&
          latest?.state==="closed"&&!latest.merged_at)
    reason="allowlisted rejected PR #"+latest.number;
  else if(retireRejected && latest?.state==="closed" && !latest.merged_at &&
          rejectedAllowlist.has(name) && retargetedRejectedTips.get(name)===branch.commit.sha)
    reason="allowlisted rejected ref with separately pinned current tip (PR #"+latest.number+")";
  else if(retireRejected && !latest && orphanAllowlist.get(name)===branch.commit.sha)
    reason="explicitly approved superseded standalone C2.4 commit";
  if(!reason)continue;
  // Re-read the ref immediately before deletion. Skip any concurrently updated
  // branch even if its original snapshot was eligible.
  const encoded=name.split("/").map(encodeURIComponent).join("/");
  const current=await request("/git/ref/heads/"+encoded);
  if(current.object.sha!==branch.commit.sha){
    outcomes.push({name,reason,result:"SKIP_MOVED"});continue;
  }
  if(mode==="apply"){
    await request("/git/refs/heads/"+encoded,"DELETE");
    outcomes.push({name,reason,result:"DELETED"});
  }else outcomes.push({name,reason,result:"WOULD_DELETE"});
}
const counts={candidate:outcomes.length,deleted:outcomes.filter(x=>x.result==="DELETED").length};
const report=[
  "# Trilok branch cleanup ("+mode+")",
  "",
  "Repository: "+repo,
  "Default branch: "+repoInfo.default_branch,
  "Rejected branch retirement: "+retireRejected,
  "Verified candidates: "+counts.candidate,
  "Deleted refs: "+counts.deleted,
  "",
  "| Ref | Reason | Result |","|---|---|---|",
  ...outcomes.map(x=>"| `"+x.name+"` | "+x.reason+" | "+x.result+" |"),
  "",
  "Deleting a ref does not remove historical commits, PR discussions or downloaded copies.",
].join("\n");
console.log(report);
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,report+"\n");
