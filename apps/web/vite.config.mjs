import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const version = JSON.parse(readFileSync(new URL("./build-version.json", import.meta.url), "utf8"));

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
  // Multi-page diagnostic is isolated: / still loads only combat, /c2-lab.html
  // loads the research rig and is intentionally not the future /studio route.
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        c2Lab: fileURLToPath(new URL("./c2-lab.html", import.meta.url)),
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
    },
  }],
});
