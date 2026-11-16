#!/usr/bin/env python3
"""Obtain and audit the ACTUAL CC0 MakeHuman archer BVH poses for Trilok C5.4.

Temporary research harness: no Blender/Maya dependency. Does not import
unverified animations into runtime or alter source skin and combat systems.
"""
from __future__ import annotations
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
from urllib.request import Request, urlopen
from zipfile import ZipFile, BadZipFile

PACKS = {
    "poses02": ("callharvey3d_archer_hero", "callharvey3d_archer_square_stance"),
    "poses05": ("callharvey3d_archer_leap",),
}
ROOT = Path("test-results/c54-makehuman-reference")
ROOT.mkdir(parents=True, exist_ok=True)

def download(pack: str) -> tuple[bytes, str]:
    file = f"{pack}_cc0.zip"
    errors = []
    for host in ("files2.makehumancommunity.org", "files.makehumancommunity.org"):
        url = f"https://{host}/asset_packs/{pack}/{file}"
        try:
            with urlopen(Request(url, headers={"User-Agent": "Trilok-MakeHuman-source-audit/1.0"}), timeout=65) as resp:
                data = resp.read(16 * 1024 * 1024 + 1)
            if len(data) > 16 * 1024 * 1024 or not data.startswith(b"PK"):
                raise ValueError("Not a valid limited-size ZIP")
            with ZipFile(io.BytesIO(data)) as zipped:
                _ = zipped.namelist()
            print(f"RETRIEVED {url} size={len(data)} sha256={hashlib.sha256(data).hexdigest()}", flush=True)
            return data,url
        except Exception as error:
            print(f"DOWNLOAD FAILED {url}: {type(error).__name__}: {error}",flush=True)
            errors.append(f"{url}: {error}")
    raise RuntimeError(f"No accessible {pack} archive; errors: {errors}")

def analyze_bvh(data: bytes) -> dict:
    text = data.decode("utf-8-sig", errors="replace")
    header, sep, motion = text.partition("MOTION")
    if not sep: raise ValueError("BVH missing MOTION")
    # Preserve hierarchical names and channel order for compatibility review.
    blocks = re.findall(r"(?m)^\s*(?:ROOT|JOINT)\s+([^\s{]+)", header)
    channels = []
    for line in header.splitlines():
        line = line.strip()
        if line.startswith("CHANNELS "):
            items = line.split()
            channels.append({"count": int(items[1]), "channels":items[2:]})
    frame_match = re.search(r"Frames:\s*(\d+)",motion)
    time_match = re.search(r"Frame Time:\s*([0-9.eE+-]+)",motion)
    rotations = [ch["channels"] for ch in channels if any("rotation" in s.lower() for s in ch["channels"])]
    digit_bones=[joint for joint in blocks if re.search("thumb|index|middle|ring|pinky|little|finger",joint,re.I)]
    return {"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest(),
            "root":blocks[0] if blocks else None,"jointCount":len(blocks),"joints":blocks,
            "digitJointCount":len(digit_bones),"digitJoints":digit_bones,
            "channelBlockCount":len(channels),"channelCount":sum(x["count"] for x in channels),
            "channelLayouts":channels,"rotationOrders":sorted(set(" ".join(o) for o in rotations)),
            "frames":int(frame_match.group(1)) if frame_match else None,
            "frameTime":float(time_match.group(1)) if time_match else None,
            "motionFirstLines":motion.splitlines()[:5]}

def alternate(name: str) -> tuple[bytes,str]:
    # Exact known redistribution: original MakeHuman BVH from a public
    # synthesis_data/mpfb/poses directory. Verify SHA, hierarchy and metadata
    # before treating it as compatible with Trilok.
    revision="5917810cd4983e9fd757fc44efd39b3dd7648ee0"
    urls=[
        f"https://huggingface.co/datasets/lsmpp/omni-refiner-video/resolve/{revision}/synthesis_data/mpfb/poses/{name}/{name}.bvh",
        f"https://huggingface.co/datasets/lsmpp/omni-refiner-video/resolve/main/synthesis_data/mpfb/poses/{name}/{name}.bvh",
    ]
    errors=[]
    for url in urls:
        try:
            with urlopen(Request(url,headers={"User-Agent":"Trilok-Reference-Audit/1.0"}),timeout=30) as response:
                payload=response.read(2*1024*1024)
            if b"HIERARCHY" not in payload[:100]:
                raise ValueError("Not a BVH hierarchy")
            print("ALTERNATE BVH",name,url,"bytes",len(payload),flush=True)
            return payload,url
        except Exception as e:
            print("ALTERNATE FETCH FAILED",name,url,str(e),flush=True)
            errors.append(str(e))
    raise RuntimeError(f"BVH {name} unavailable from redistribution: {errors}")

def main() -> int:
    report={}
    for pack,names in PACKS.items():
        try:
            data,url=download(pack)
        except Exception as e:
            print("OFFICIAL PACK UNAVAILABLE",pack,str(e),flush=True)
            report[pack]={"sourceUrl":None,"archiveSha256":None,"archiveFiles":0,"selected":[],"officialDownloadError":str(e)}
            for name in names:
                try:
                    raw,origin=alternate(name)
                    path=ROOT/pack/(name+".bvh")
                    path.parent.mkdir(parents=True,exist_ok=True)
                    path.write_bytes(raw)
                    report[pack]["selected"].append({
                        "archivePath":None,"alternateSourceUrl":origin,"relativePath":str(path),
                        "sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw),
                        "bvh":analyze_bvh(raw)})
                except Exception as alt_error:
                    print("NO VERIFIED SOURCE FOR",name,str(alt_error),flush=True)
            continue
        with ZipFile(io.BytesIO(data)) as archive:
            matching=[]
            for entry in archive.infolist():
                lower=Path(entry.filename).name.lower()
                if not any(n in lower for n in names): continue
                if Path(entry.filename).suffix.lower() not in (".bvh",".meta",".thumb",".png",".txt"):continue
                if entry.file_size>8*1024*1024:raise ValueError("Oversized pose asset")
                matching.append(entry)
            report[pack]={"sourceUrl":url,"archiveSha256":hashlib.sha256(data).hexdigest(),
                          "archiveFiles":len(archive.namelist()),"selected":[]}
            for entry in matching:
                raw=archive.read(entry)
                name=Path(entry.filename).name
                path=ROOT/pack/name
                path.parent.mkdir(parents=True,exist_ok=True)
                path.write_bytes(raw)
                record={"archivePath":entry.filename,"relativePath":str(path),
                        "sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw)}
                if name.lower().endswith(".bvh"):
                    record["bvh"]=analyze_bvh(raw)
                elif name.lower().endswith(".meta"):
                    record["meta"]=raw.decode("utf-8",errors="replace")[:6000]
                report[pack]["selected"].append(record)
            for name in names:
                if not any(Path(i.filename).name.lower()==f"{name}.bvh" for i in matching):
                    raise RuntimeError(f"Required pose BVH missing: {name}")
    (ROOT/"source-report.json").write_text(json.dumps(report,indent=2))
    for pack in report:
        print("ARCHIVE",pack,"FILES",report[pack]["archiveFiles"])
        for item in report[pack]["selected"]:
            desc=item.get("bvh",{})
            print("ASSET",item["relativePath"],"bytes",item["bytes"],"sha256",item["sha256"],
                  "root",desc.get("root"),"jointCount",desc.get("jointCount"),
                  "digits",desc.get("digitJoints"),"rotations",desc.get("rotationOrders"),flush=True)
    print("SOURCE_REPORT_PATH", ROOT/"source-report.json",flush=True)
    return 0 if all(any(item.get("bvh") for item in report[p]["selected"]) for p in PACKS) else 1

if __name__=="__main__":
    sys.exit(main())
