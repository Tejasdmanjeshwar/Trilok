#!/usr/bin/env python3
"""C6.3 engineering-only acquisition probe; no web-bundle dependency.

Download the individual ORIGINAL 100STYLE BVHs from links supplied on the
publisher's official page. Never use retargeted Geno motion/mesh as a proxy.
Artifacts are temporary and are not committed or published to the browser.
"""
import csv
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.request import Request, urlopen
from urllib.parse import parse_qs, urlparse

import gdown

OFFICIAL = "https://www.ianxmason.com/100style/"
FILES = ("Neutral_ID.bvh", "Neutral_FW.bvh", "Neutral_FR.bvh", "Frame_Cuts.csv")
OUT = Path("c63-100style-acquisition")
OUT.mkdir(exist_ok=True)


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.href = None
        self.label = ""
        self.matches = {}

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.href = dict(attrs).get("href")
            self.label = ""

    def handle_data(self, data):
        if self.href is not None:
            self.label += data

    def handle_endtag(self, tag):
        if tag == "a" and self.href is not None:
            label = html.unescape(self.label).strip()
            if label in FILES:
                if label in self.matches:
                    if self.matches[label] != html.unescape(self.href):
                        raise ValueError("conflicting official links " + label)
                else:
                    self.matches[label] = html.unescape(self.href)
            self.href = None

def drive_id(url):
    parsed = urlparse(url)
    if parsed.hostname not in ("drive.google.com", "drive.usercontent.google.com"):
        raise ValueError("unexpected publisher link host: " + url)
    result = parse_qs(parsed.query).get("id")
    if result and re.fullmatch(r"[A-Za-z0-9_-]{15,}", result[0]):
        return result[0]
    m = re.search(r"/file/d/([A-Za-z0-9_-]{15,})", parsed.path)
    if m:
        return m.group(1)
    raise ValueError("link has no valid drive ID: " + url)

def acquire(name, url):
    identifier = drive_id(url)
    output = OUT / name
    print("Retrieving official individual file:", name, "id=", identifier, flush=True)
    result = gdown.download(id=identifier, output=str(output), quiet=False, fuzzy=False)
    if result is None or not output.exists():
        raise RuntimeError("official Google Drive download inaccessible for " + name)
    contents = output.read_bytes()
    if len(contents) < 100 or b"<html" in contents[:200].lower():
        raise RuntimeError("official source returned HTML or empty response: " + name)
    return {
        "url": url,
        "googleDriveId": identifier,
        "bytes": len(contents),
        "sha256": hashlib.sha256(contents).hexdigest(),
    }

def inspect_bvh(name):
    text = (OUT / name).read_text(encoding="utf-8-sig")
    if not re.match(r"^\s*HIERARCHY\s", text):
        raise ValueError("not an actual BVH: " + name)
    frames = re.search(r"(?m)^Frames:\s*(\d+)\s*$", text)
    dt = re.search(r"(?m)^Frame Time:\s*([0-9.eE+-]+)\s*$", text)
    if not frames or not dt or int(frames.group(1)) < 2 or float(dt.group(1)) <= 0:
        raise ValueError("invalid motion header in " + name)
    joints = re.findall(r"(?m)^\s*(?:ROOT|JOINT)\s+(\S+)\s*$", text)
    channels = re.findall(r"(?m)^\s*CHANNELS\s+(.+)$", text)
    if len(joints) != 28 or len(channels) != len(joints):
        raise ValueError("unexpected 100STYLE hierarchy: " + name + " " + str(joints))
    print("BVH", name, "joints", joints, "frames", frames.group(1),
          "secondsPerFrame", dt.group(1), "firstChannels", channels[:4], flush=True)
    return {"frames": int(frames.group(1)), "frameTime": float(dt.group(1)),
            "joints": joints, "channels": channels}

def main():
    request = Request(OFFICIAL, headers={"User-Agent": "Trilok-C6.3-source-audit/1.0"})
    with urlopen(request, timeout=50) as response:
        page = response.read().decode("utf-8")
    links = Links()
    links.feed(page)
    missing = set(FILES) - links.matches.keys()
    if missing:
        raise ValueError("publisher site missing individual downloads: " + str(missing))
    report = {"schemaVersion": 1, "source": OFFICIAL, "license": "CC-BY-4.0",
              "files": {}, "motion": {}, "frameCutsMatches": []}
    for name in FILES:
        report["files"][name] = acquire(name, links.matches[name])
    for name in FILES[:3]:
        report["motion"][name] = inspect_bvh(name)
    bones = [report["motion"][name]["joints"] for name in FILES[:3]]
    if any(x != bones[0] for x in bones[1:]):
        raise ValueError("100STYLE neutral motions use different skeletons")
    with (OUT / "Frame_Cuts.csv").open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    for row in rows:
        if any("Neutral_" in cell for cell in row):
            report["frameCutsMatches"].append(row)
    if not report["frameCutsMatches"]:
        raise ValueError("Frame_Cuts.csv contains no Neutral entries; inspect schema")
    print("FRAME CUT ROWS", json.dumps(report["frameCutsMatches"][:20]), flush=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print("ACQUISITION VERIFIED", json.dumps({
        "files": {k: {"bytes": v["bytes"], "sha256": v["sha256"]}
                  for k, v in report["files"].items()},
        "frameCutsMatches": len(report["frameCutsMatches"])
    }), flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception as ex:
        print("SOURCE ACQUISITION BLOCKED:", type(ex).__name__, str(ex), file=sys.stderr)
        raise
