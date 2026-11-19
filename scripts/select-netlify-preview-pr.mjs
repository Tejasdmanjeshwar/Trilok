#!/usr/bin/env node
/**
 * Resolve an optional PR number for a manually requested Netlify draft.
 *
 * Blank input selects the uniquely most recently active, same-repository PR
 * targeting main. Multiple PRs modified within 24 hours of the newest are
 * considered ambiguous, so the owner must explicitly choose a PR.
 *
 * The existing resolve-netlify-preview.mjs independently validates the
 * selected PR and requires successful Verify for its exact current head.
 *
 * Usage:
 *   PREVIEW_PR_NUMBER= GITHUB_REPOSITORY=owner/repo \
 *     node scripts/select-netlify-preview-pr.mjs open-pr-pages.json
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
const VALID_NUMBER = /^[1-9][0-9]{0,7}$/;
const VALID_SHA = /^[0-9a-f]{40}$/;

export function selectPreviewPr(input, { repository, requested = "" } = {}) {
  if (typeof repository !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw Error("Expected a valid repository");
  }
  const choice = String(requested ?? "").trim();
  if (choice) {
    if (!VALID_NUMBER.test(choice) || !Number.isSafeInteger(Number(choice))) {
      throw Error("PR number must be a positive integer or left blank for automatic selection");
    }
    return Number(choice);
  }
  // gh api --paginate --slurp yields an array of pages. Accept a flat fixture
  // as well, but reject malformed or missing API responses rather than guessing.
  if (!Array.isArray(input)) throw Error("Open PR listing is missing");
  const pages = input.every(Array.isArray) ? input : [input];
  if (!pages.every(Array.isArray)) throw Error("Open PR listing is malformed");
  const candidates = pages.flat().filter(pr =>
    pr && pr.state === "open" &&
    Number.isSafeInteger(pr.number) && pr.number > 0 &&
    pr.base?.ref === "main" &&
    pr.base?.repo?.full_name === repository &&
    pr.head?.repo?.full_name === repository &&
    typeof pr.head?.ref === "string" && pr.head.ref.length > 0 &&
    VALID_SHA.test(pr.head?.sha ?? "") &&
    typeof pr.updated_at === "string" &&
    Number.isFinite(Date.parse(pr.updated_at))
  );
  const distinct = new Set(candidates.map(pr => pr.number));
  if (distinct.size !== candidates.length) {
    throw Error("Duplicate PR records in paginated GitHub response");
  }
  candidates.sort((a, b) =>
    Date.parse(b.updated_at) - Date.parse(a.updated_at) || b.number - a.number);
  if (!candidates.length) {
    throw Error("No open, non-fork PR targeting main is available for preview");
  }
  const newest = candidates[0];
  const runnerUp = candidates[1];
  if (runnerUp && Date.parse(newest.updated_at) - Date.parse(runnerUp.updated_at) < ACTIVE_WINDOW_MS) {
    throw Error("Multiple recently active PRs (#" + newest.number +
      ", #" + runnerUp.number + "); enter an explicit PR number to avoid deploying the wrong work");
  }
  return newest.number;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const requested = process.env.PREVIEW_PR_NUMBER ?? "";
    const input = requested.trim() ? [] : JSON.parse(readFileSync(process.argv[2], "utf8"));
    const number = selectPreviewPr(input, {
      repository: process.env.GITHUB_REPOSITORY,
      requested,
    });
    console.error("Selected preview PR #" + number +
      (requested.trim() ? " (explicit)" : " (unique latest active)"));
    console.log(number);
  } catch (error) {
    console.error("::error::Preview PR selection failed: " + error.message);
    process.exitCode = 1;
  }
}
