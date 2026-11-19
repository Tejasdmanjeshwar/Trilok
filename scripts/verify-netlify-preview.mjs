#!/usr/bin/env node
/**
 * Confirm an immutable draft deploy, preserving private Netlify visibility.
 *
 * Public preview: compare served build identity and both HTML entrypoints.
 * Private preview: verify the exact deploy/site through Netlify's authenticated
 * management API and confirm all three CDN paths are access-protected. The
 * latter is a metadata/readiness check, NOT a browser-content smoke test.
 * The complete static bundle has already passed verify-static-release.mjs
 * before the Netlify CLI uploaded the same directory.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ID = /^[0-9a-f]{24}$/;
const SHA = /^[0-9a-f]{40}$/;

export function parsePreviewUrl(value) {
  const url = new URL(value);
  const match = /^([0-9a-f]{24})--([a-z0-9-]+)\.netlify\.app$/.exec(url.hostname);
  if (url.protocol !== "https:" || !match || url.pathname !== "/" ||
      url.search || url.hash || url.username || url.password || url.port) {
    throw Error("Expected a unique HTTPS Netlify draft URL");
  }
  return { origin: url.origin, deployId: match[1] };
}

export function confirmDeploy(deploy, { deployId, siteId, origin }) {
  if (!ID.test(deployId) || !siteId || !deploy || typeof deploy !== "object" ||
      deploy.id !== deployId || deploy.site_id !== siteId ||
      deploy.state !== "ready" || deploy.locked === true) {
    throw Error("Netlify API did not confirm the exact ready draft deploy and site");
  }
  if (typeof deploy.deploy_url !== "string" ||
      new URL(deploy.deploy_url).origin !== origin) {
    throw Error("Netlify API deploy URL does not match draft URL");
  }
  if (deploy.published_at && deploy.published_at !== null) {
    throw Error("Expected a non-published draft, not a published deployment");
  }
}

export async function verifyPreview({ previewUrl, siteId, token, expectedSha, staticDir, request = fetch }) {
  if (!SHA.test(expectedSha ?? "") || typeof token !== "string" || !token ||
      typeof siteId !== "string" || !siteId || typeof staticDir !== "string" ||
      !staticDir.startsWith("/")) {
    throw Error("Missing authenticated site, verified checkout SHA or static directory");
  }
  const parsed = parsePreviewUrl(previewUrl);
  const local = JSON.parse(readFileSync(join(staticDir,"build-info.json"),"utf8"));
  if (local.commitSha !== expectedSha) throw Error("Local immutable build identity mismatch");
  for (const file of ["index.html","studio/index.html","release-manifest.json"]) {
    const content = readFileSync(join(staticDir,file),"utf8");
    if (!content.length) throw Error("Missing static preview entrypoint: " + file);
    if (file.endsWith(".html") && !/<html/i.test(content)) {
      throw Error("Invalid static preview HTML: " + file);
    }
  }
  // Never pass Netlify's management token to the preview CDN.
  const api = await request("https://api.netlify.com/api/v1/deploys/" + parsed.deployId, {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!api.ok) throw Error("Authenticated Netlify deploy API returned HTTP " + api.status);
  const deploy = await api.json();
  confirmDeploy(deploy, { ...parsed, siteId });

  const paths = ["/build-info.json", "/", "/studio/"];
  const responses = [];
  for (const path of paths) {
    const response = await request(parsed.origin + path, {
      redirect: "follow", signal: AbortSignal.timeout(20000),
      headers: { "Cache-Control": "no-cache" },
    });
    responses.push(response);
  }
  if (responses.every(resp => resp.status === 200)) {
    const identity = JSON.parse(await responses[0].text());
    if (identity.commitSha !== expectedSha) throw Error("HTTP-served preview SHA mismatch");
    for (const i of [1,2]) {
      if (!/<html/i.test(await responses[i].text())) {
        throw Error("HTTP-served HTML entrypoint missing: " + paths[i]);
      }
    }
    return { status:"public-content-verified", previewUrl:parsed.origin, deployId:parsed.deployId };
  }
  if (responses.every(resp => resp.status === 401 || resp.status === 403)) {
    return { status:"private-api-ready", previewUrl:parsed.origin, deployId:parsed.deployId };
  }
  throw Error("Preview CDN returned unexpected/mixed statuses: " + responses.map(r=>r.status).join(","));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await verifyPreview({
      previewUrl: process.env.PREVIEW_URL,
      siteId: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_AUTH_TOKEN,
      expectedSha: process.env.APPROVED_CHECKOUT_SHA,
      staticDir: process.argv[2],
    });
    const protectedPreview = result.status === "private-api-ready";
    const description = protectedPreview
      ? "Authenticated Netlify API confirms the exact draft/site is ready; CDN returned login-required responses. Live HTML content was not inspected by CI."
      : "Public CDN served the exact expected build SHA and both Game/Studio HTML entrypoints.";
    console.log("Preview validation: " + description);
    console.log("Studio review URL: " + result.previewUrl + "/studio/");
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        "## Trilok Netlify draft deployment\n" +
        "- C6.2 or selected PR source SHA: \`" + process.env.APPROVED_SOURCE_SHA + "\`\n" +
        "- Exact build checkout SHA: \`" + process.env.APPROVED_CHECKOUT_SHA + "\`\n" +
        "- Netlify draft: " + result.previewUrl + "/studio/\n" +
        "- Validation: " + description + "\n" +
        "- Character motion/visual quality requires independent human review.\n");
    }
  } catch (error) {
    console.error("::error::Netlify preview verification failed: " + error.message);
    process.exitCode = 1;
  }
}
