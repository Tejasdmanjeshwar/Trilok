#!/usr/bin/env node
/**
 * Validates an immutable, externally deployable Vite static artifact.
 * No provider SDK, build step, network or secret required.
 *
 * Usage:
 *   node scripts/verify-static-release.mjs --dir apps/web/dist --sha <40-hex> --write
 *   node scripts/verify-static-release.mjs --dir path/to/download --sha <40-hex>
 *
 * The generated release-manifest.json describes all other files, and is
 * deliberately excluded from its own digest.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, lstat, writeFile } from "node:fs/promises";
import { resolve, join, relative, sep } from "node:path";

const argumentsMap = new Map();
for (let index = 2; index < process.argv.length; index++) {
  const key = process.argv[index];
  if (key === "--write") { argumentsMap.set(key, true); continue; }
  if (!["--dir","--sha"].includes(key) || argumentsMap.has(key) ||
      index + 1 >= process.argv.length) throw new Error("Invalid artifact argument " + key);
  argumentsMap.set(key, process.argv[++index]);
}
const sha = argumentsMap.get("--sha");
const dir = resolve(argumentsMap.get("--dir") ?? "apps/web/dist");
if (typeof sha !== "string" || !/^[a-f0-9]{40}$/.test(sha))
  throw new Error("Exact 40-character source commit SHA is mandatory");
const hash = value => createHash("sha256").update(value).digest("hex");
const required = ["index.html","studio/index.html","build-info.json","THIRD_PARTY_NOTICES.txt"];
const files = [];
let totalBytes = 0;

async function walk(folder) {
  for (const item of (await readdir(folder, { withFileTypes: true }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const absolute = join(folder, item.name);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()))
      throw new Error("Artifact contains unsupported file type " + absolute);
    if (stat.isDirectory()) { await walk(absolute); continue; }
    const name = relative(dir, absolute).split(sep).join("/");
    if (name.startsWith("../") || name === "release-manifest.json") continue;
    if (files.length >= 20_000) throw new Error("Unexpected file count");
    const bytes = await readFile(absolute);
    totalBytes += bytes.length;
    if (totalBytes > 512 * 1024 * 1024) throw new Error("Artifact too large for review");
    files.push({ path: name, bytes: bytes.length, sha256: hash(bytes) });
  }
}
await walk(dir);
files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
for (const name of required)
  if (!files.some(file => file.path === name))
    throw new Error("Missing required static release asset: " + name);
const identity = JSON.parse(await readFile(join(dir,"build-info.json"),"utf8"));
if (identity.commitSha !== sha || !/^\d{4}-\d{2}-\d{2}T/.test(identity.builtAtUtc ?? "") ||
    typeof identity.buildId !== "string" || !identity.buildId.startsWith(sha.slice(0,8)))
  throw new Error("Static artifact /build-info.json does not match exact source SHA");
const manifest = {
  schemaVersion: 1,
  commitSha: sha,
  buildId: identity.buildId,
  builtAtUtc: identity.builtAtUtc,
  fileCount: files.length,
  totalBytes,
  files,
};
const encoded = JSON.stringify(manifest,null,2) + "\n";
const path = join(dir,"release-manifest.json");
if (argumentsMap.has("--write")) {
  await writeFile(path,encoded,{flag:"w"});
} else {
  const existing = await readFile(path,"utf8");
  if (existing !== encoded) throw new Error("Release-manifest mismatch or artifact modified");
}
console.log(JSON.stringify({commitSha:sha,buildId:identity.buildId,
  fileCount:files.length,totalBytes,manifestSha256:hash(encoded)}));
