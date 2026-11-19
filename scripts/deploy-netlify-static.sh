#!/usr/bin/env bash
# Netlify CLI is deliberately launched outside the pnpm repository. It only
# uploads the SHA-verified files supplied by the manual GitHub Actions workflow.
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "::error::Usage: deploy-netlify-static.sh /absolute/static-dir /absolute/result.json" >&2
  exit 2
fi
static_dir="$1"
json_path="$2"
if [[ "$static_dir" != /* || "$json_path" != /* ||
      ! -f "$static_dir/release-manifest.json" ]]; then
  echo "::error::Deploy input must be an absolute verified static directory and JSON result path" >&2
  exit 2
fi
if [[ -z "${NETLIFY_AUTH_TOKEN:-}" || -z "${NETLIFY_SITE_ID:-}" ||
      -z "${RUNNER_TEMP:-}" ]]; then
  echo "::error::Netlify preview environment must provide site ID, token and runner temp directory" >&2
  exit 2
fi

# The CLI's project discovery must never see the Trilok pnpm workspaces,
# package.json, git metadata or netlify.toml. --site selects the existing
# development-only Netlify site, and --dir remains the exact immutable archive.
cli_workdir="$(mktemp -d "$RUNNER_TEMP/netlify-cli.XXXXXXXX")"
trap 'rm -rf -- "$cli_workdir"' EXIT
cd "$cli_workdir"
export CI=true
export NETLIFY_CLI_TELEMETRY_DISABLED=1

echo "::notice::Netlify CLI setup in a clean non-repository directory"
echo "::notice::Preparing already-verified static assets (no build step)"
echo "::notice::Checking pinned CLI availability (120s maximum)"
timeout --signal=TERM --kill-after=10s 120s \
  npx --yes netlify-cli@27.10.1 --version

echo "::notice::Starting isolated Netlify draft upload; 300s hard limit"
set +e
timeout --signal=TERM --kill-after=10s 300s \
  npx --yes netlify-cli@27.10.1 deploy \
    --no-build --dir "$static_dir" \
    --site "$NETLIFY_SITE_ID" \
    --timeout 180 --json > "$json_path"
status=$?
set -e
if [[ "$status" -eq 124 || "$status" -eq 137 ]]; then
  echo "::error::Netlify CLI did not finish within 300s after successful setup. Check Netlify service status, upload permissions and network connectivity; no preview is verified." >&2
  exit 1
fi
if [[ "$status" -ne 0 ]]; then
  echo "::error::Netlify draft upload failed (CLI exit code $status). See stderr above. No preview is verified." >&2
  exit "$status"
fi
if [[ ! -s "$json_path" ]]; then
  echo "::error::Netlify returned no deployment JSON; cannot verify a draft preview." >&2
  exit 1
fi
echo "::notice::CLI returned deployment JSON; checking URL and live build identity next"
