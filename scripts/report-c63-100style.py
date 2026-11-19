#!/usr/bin/env python3
"""Update one C6.3 experimental validation comment, not a new PR/workflow.

Run only from authorized GitHub Actions workflow; no user source files, tokens or
raw motion data are placed in the public comment. On failure it records where
the gated diagnostic stopped instead of reporting false acceptance.
"""
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

MARKER = "<!-- c63-100style-diagnostic-status -->"


def request(method, path, payload=None):
    repo = os.environ["GITHUB_REPOSITORY"]
    url = f"https://api.github.com/repos/{repo}/{path}"
    data = None if payload is None else json.dumps(payload).encode()
    req = Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + os.environ["GITHUB_TOKEN"],
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Trilok-C63-100STYLE-diagnostic",
        "Content-Type": "application/json",
    })
    with urlopen(req, timeout=20) as response:
        return json.loads(response.read())


def comment():
    report_path = Path("c63-100style-acquisition/100style-calibration-report.json")
    manifest_path = Path("c63-100style-acquisition/100style-experimental-manifest.json")
    url = (f"https://github.com/{os.environ['GITHUB_REPOSITORY']}"
           f"/actions/runs/{os.environ['GITHUB_RUN_ID']}")
    lines = [MARKER, "**C6.3 100STYLE source-to-MakeHuman diagnostic**", "",
             f"Run: {url}",
             f"Commit: \`{os.environ['GITHUB_SHA']}\`", ""]
    if report_path.exists():
        report = json.loads(report_path.read_text())
        lines += [f"Mapped canonical joints: {report['calibrationJointCount']}",
                  f"Source units to target meters: {report['sourceUnitsToMeters']:.8f}"]
        for clip in report["reports"]:
            probes = clip["sampledSourceToTargetLinks"]
            lines.append(
                f"- {clip['filename']}: T-pose mismatch "
                f"{clip['relativeTPoseMaximumDirectionDegrees']:.2f}°, "
                f"worst sampled p95 {max(p['p95Degrees'] for p in probes):.2f}°, "
                f"worst link {max(p['maxDegrees'] for p in probes):.2f}°")
    else:
        lines.append("No calibration report generated; inspect run logs for the failed gate.")
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        lines += ["", "**Experimental three-motion clips generated (not promoted):**"]
        for clip in manifest["clips"]:
            lines.append(
                f"- {clip['id']}: {clip['sourceSamples']} captured frames, "
                f"source loop seam {clip['sourceAngularSeamMaxDegrees']:.2f}°, "
                f"retarget loop seam {clip['targetAngularSeamMaxDegrees']:.2f}°")
    else:
        lines += ["", "No clip manifest generated; source/calibration/loop gate may have failed."]
    lines += ["", "**Visual acceptance: pending. Netlify preview: not deployed. Merge: blocked.**"]
    return "\n".join(lines)


def main():
    existing = request("GET", "issues/118/comments?per_page=100")
    found = next((x for x in existing if MARKER in x.get("body", "")), None)
    if found:
        request("PATCH", f"issues/comments/{found['id']}", {"body": comment()})
    else:
        request("POST", "issues/118/comments", {"body": comment()})


if __name__ == "__main__":
    main()
