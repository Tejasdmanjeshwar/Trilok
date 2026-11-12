import { readFileSync } from "node:fs";

// Shared by fast PR CI and manual phase acceptance. Both must verify the
// actual checkout SHA, not a remembered phase or deployment identifier.
const metadata = JSON.parse(readFileSync("apps/web/dist/build-info.json", "utf8"));
if (!process.env.GITHUB_SHA || metadata.commitSha !== process.env.GITHUB_SHA) {
  throw new Error("Build commit does not match checked-out GitHub SHA");
}
const expected = JSON.parse(readFileSync("apps/web/build-version.json", "utf8"));
if (metadata.playableVersion !== expected.playableVersion ||
    metadata.combatEngineVersion !== expected.combatEngineVersion ||
    metadata.channel !== expected.channel) {
  throw new Error("Unexpected playable or engine version");
}
if (!/^.{8}-\d{8}T\d{9}Z$/.test(metadata.buildId)) {
  throw new Error("Invalid generated build ID");
}
console.log("Verified Trilok build:", metadata.buildId);
