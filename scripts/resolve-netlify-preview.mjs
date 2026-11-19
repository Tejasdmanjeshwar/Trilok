#!/usr/bin/env node
/**
 * Select the newest successful Verify run for an explicitly selected, current PR.
 * This is a pure GitHub metadata gate: no build, Netlify token or network needed.
 *
 * Usage:
 *   PREVIEW_PR_NUMBER=112 GITHUB_REPOSITORY=owner/repo GITHUB_ENV=/path/env \
 *     node scripts/resolve-netlify-preview.mjs pr.json workflow-id.txt runs.json
 */
import { appendFileSync, readFileSync } from "node:fs";

const [prPath, workflowIdPath, runsPath] = process.argv.slice(2);
if (!prPath || !workflowIdPath || !runsPath) throw Error("Expected PR, Verify workflow ID and run-list JSON paths");

const repo = process.env.GITHUB_REPOSITORY ?? "";
const requested = Number(process.env.PREVIEW_PR_NUMBER);
if (!/^[^/\s]+\/[^/\s]+$/.test(repo) ||
    !Number.isSafeInteger(requested) || requested < 1 ||
    String(requested) !== process.env.PREVIEW_PR_NUMBER) {
  throw Error("A valid repository and positive PR number are required");
}
const pr = JSON.parse(readFileSync(prPath, "utf8"));
const workflowId = Number(readFileSync(workflowIdPath, "utf8").trim());
const response = JSON.parse(readFileSync(runsPath, "utf8"));
const sha = pr.head?.sha;
if (pr.number !== requested || pr.state !== "open" ||
    !/^[0-9a-f]{40}$/.test(sha ?? "") ||
    pr.head?.repo?.full_name !== repo || pr.base?.repo?.full_name !== repo ||
    pr.base?.ref !== "main" || typeof pr.head?.ref !== "string") {
  throw Error("Selected PR must be open, non-fork, target main and have a current exact SHA");
}
if (!Number.isSafeInteger(workflowId) || workflowId < 1 ||
    !Array.isArray(response.workflow_runs)) throw Error("Invalid Verify workflow listing");

const matching = response.workflow_runs.filter(run =>
  run.workflow_id === workflowId &&
  run.name === "Verify" &&
  run.status === "completed" &&
  run.conclusion === "success" &&
  run.event === "pull_request" &&
  run.repository?.full_name === repo &&
  run.head_sha === sha &&
  run.head_branch === pr.head.ref &&
  Array.isArray(run.pull_requests) &&
  run.pull_requests.some(ref => ref.number === requested));
matching.sort((a,b) => Number(b.run_number) - Number(a.run_number));
const chosen = matching[0];
if (!chosen || !Number.isSafeInteger(chosen.id) || chosen.id < 1) {
  throw Error("Latest PR head has no successful exact-SHA Verify run; do not deploy a stale artifact");
}
const variables = {
  APPROVED_PR_NUMBER: String(requested),
  APPROVED_SOURCE_SHA: sha,
  APPROVED_VERIFY_RUN: String(chosen.id),
};
if (process.env.GITHUB_ENV) {
  appendFileSync(process.env.GITHUB_ENV,
    Object.entries(variables).map(([key,value]) => key + "=" + value + "\n").join(""));
}
console.log(JSON.stringify({pr: requested, sourceSha:sha,
  verifyRun:chosen.id, workflowId, branch:pr.head.ref}));
