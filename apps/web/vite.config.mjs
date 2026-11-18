import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const version = JSON.parse(readFileSync(new URL("./build-version.json", import.meta.url), "utf8"));
const thirdPartyNotices = readFileSync(new URL("../../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8");

function gitRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const revision = [
  process.env.TRILOK_COMMIT_SHA,
  process.env.CF_PAGES_COMMIT_SHA,
  process.env.GITHUB_SHA,
  process.env.COMMIT_SHA,
  gitRevision(),
].find((sha) => /^[0-9a-f]{40}$/i.test(sha ?? "")) ?? "unknown";
// The superseded C2 Character Lab stays available only to diagnostic
// builds until its unique anatomical source tests migrate to Studio.
const includeDiagnosticLab = process.env.TRILOK_INCLUDE_LAB === "1";
const builtAtUtc = new Date().toISOString();
const token = builtAtUtc.replace(/[-:.]/g, "");
const build = Object.freeze({
  playableVersion: version.playableVersion,
  combatEngineVersion: version.combatEngineVersion,
  channel: version.channel,
  commitSha: revision,
  builtAtUtc,
  buildId: revision.slice(0, 8) + "-" + token,
});

// One object is embedded in the UI and emitted as an inspectable manifest.
export default defineConfig({
  // Production ships Game and Studio; diagnostic builds opt in to the old Lab.
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        studio: fileURLToPath(new URL("./studio/index.html", import.meta.url)),
        ...(includeDiagnosticLab ? {
          c2Lab: fileURLToPath(new URL("./c2-lab.html", import.meta.url)),
        } : {}),
      },
    },
  },
  define: {
    __TRILOK_BUILD_INFO__: JSON.stringify(build),
  },
  plugins: [{
    name: "trilok-build-identity",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build-info.json",
        source: JSON.stringify(build, null, 2) + "\n",
      });
      // Attribution accompanies the exact compiled browser output even when
      // public landing documentation is deliberately minimal.
      this.emitFile({
        type: "asset",
        fileName: "THIRD_PARTY_NOTICES.txt",
        source: thirdPartyNotices,
      });
    },
  }],
});
