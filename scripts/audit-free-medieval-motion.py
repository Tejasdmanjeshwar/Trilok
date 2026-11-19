#!/usr/bin/env python3
"""Private-temporary acquisition probe for four free Kevin Iglesias animations.

Official itch.io no-payment flow; this deliberately stores NO source files
in Git history, GitHub Actions artifacts or public site output. Prints
only archive integrity and safe inventory. No cookies, signed URLs, email,
credentials, or third-party animation bytes are logged.
"""
import argparse
import hashlib
import http.cookiejar
import json
import os
import re
import shutil
import sys
import urllib.parse
import urllib.request
import urllib.error
import zipfile
from pathlib import Path

PACKS = {
    "human-archer": "https://kevdev.itch.io/human-archer-animations-free",
    "human-melee": "https://kevdev.itch.io/human-melee-animatons-free",
    "dwarf-melee": "https://kevdev.itch.io/dwarf-melee-animations-free",
    "human-throwing": "https://kevdev.itch.io/human-throwing-animations-free",
}
MAX_BYTES = 70 * 1024 * 1024
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36"

def token(html):
    pats=[
        r'<input[^>]*name=["\']csrf_token["\'][^>]*value=["\']([^"\']+)',
        r'csrf_token["\']?\s+value=["\']([^"\']+)',
    ]
    for p in pats:
        m=re.search(p,html,re.I)
        if m: return m.group(1)
    return None

def uploads(html):
    found=[]
    for m in re.finditer(r'data-upload_id=["\'](\d+)["\']',html):
        row=html[max(0,m.start()-300):m.start()+700]
        desc=re.sub("<[^>]+>"," ",row)
        desc=" ".join(desc.split())[:180]
        found.append({"id":m.group(1),"desc":desc})
    return list({row["id"]:row for row in found}.values())

def open_url(opener,url,data=None,referer=None,timeout=35):
    req=urllib.request.Request(url,data=data,headers={
        "User-Agent":UA,"Accept":"*/*",
        **({"Content-Type":"application/x-www-form-urlencoded",
            "X-Requested-With":"XMLHttpRequest"} if data is not None else {}),
        **({"Referer":referer} if referer else {}),
    })
    return opener.open(req,timeout=timeout)

def fetch_bytes(opener,url,limit=4_000_000,**kwargs):
    with open_url(opener,url,**kwargs) as r:
        body=r.read(limit+1)
        if len(body)>limit: raise RuntimeError("response exceeds size limit")
        return body

def acquire(pack,url,folder):
    jar=http.cookiejar.CookieJar()
    opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    try:
        page=fetch_bytes(opener,url).decode("utf8","replace")
        csrf=token(page)
        ids=uploads(page)
        print(pack, "PAGE_HTTP_OK", "csrf",bool(csrf),"visible_uploads",len(ids),flush=True)
        if not csrf:
            return {"status":"blocked","reason":"missing session CSRF","page_uploads":len(ids)}
        post=urllib.parse.urlencode({"csrf_token":csrf,
            **({"upload_id":ids[0]["id"]} if ids else {})}).encode()
        try:
            reply=json.loads(fetch_bytes(opener,url+"/download_url",data=post,referer=url).decode())
        except (ValueError,urllib.error.HTTPError) as e:
            return {"status":"blocked","reason": "download_url "+type(e).__name__+" "+str(getattr(e,"code",""))}
        next_url=reply.get("url")
        if not isinstance(next_url,str) or not next_url.startswith("https://"):
            return {"status":"blocked","reason":"no free download page returned"}
        download_page=fetch_bytes(opener,next_url,referer=url).decode("utf8","replace")
        csrf2=token(download_page) or csrf
        uploads2=uploads(download_page)
        print(pack,"DOWNLOAD_PAGE_OK","uploads",len(uploads2),"csrf",bool(csrf2),flush=True)
        if not uploads2:
            return {"status":"blocked","reason":"no downloadable uploads in free page"}
        # itch.io provides more than one variant (often a Godot/FBX zip
        # and a Unity .unitypackage). Upload order can change between runs.
        # Require an actual ZIP magic header, not "first available upload".
        choices=sorted(uploads2,key=lambda x:(
            0 if "Godot" in x["desc"] or "Unreal" in x["desc"] else 1,x["id"]))
        chosen=None;out=None;n=0;digest=hashlib.sha256()
        skipped=0
        for candidate in choices:
            fileurl=url+"/file/"+candidate["id"]
            try:
                answer=json.loads(fetch_bytes(opener,fileurl,
                    data=urllib.parse.urlencode({"csrf_token":csrf2}).encode(),
                    referer=next_url).decode())
                cdn=answer.get("url")
                if not isinstance(cdn,str) or not cdn.startswith("https://"):
                    skipped+=1;continue
                with open_url(opener,cdn,referer=next_url,timeout=90) as response:
                    head=response.read(4)
                    if head not in (b"PK\\x03\\x04", b"PK\\x05\\x06"):
                        skipped+=1;continue
                    folder.mkdir(parents=True,exist_ok=True)
                    out=folder/(pack+".download")
                    digest=hashlib.sha256()
                    n=4;digest.update(head)
                    with open(out,"wb") as f:
                        f.write(head)
                        while True:
                            chunk=response.read(2*1024*1024)
                            if not chunk:break
                            n+=len(chunk)
                            if n>MAX_BYTES:raise RuntimeError("free archive exceeds cap")
                            digest.update(chunk)
                            f.write(chunk)
                chosen=candidate
                break
            except (ValueError,urllib.error.HTTPError) as exc:
                skipped+=1
        if chosen is None:
            return {"status":"blocked","reason":"no free ZIP variant accessible",
              "variants_skipped":skipped}
        report={"status":"acquired","archive_sha256":digest.hexdigest(),"archive_bytes":n,
            "upload_id":chosen["id"]}
        if zipfile.is_zipfile(out):
            with zipfile.ZipFile(out) as z:
                files=[x for x in z.infolist() if not x.is_dir()]
                report["archive_type"]="zip"
                report["file_count"]=len(files)
                report["unpacked_total_bytes"]=sum(x.file_size for x in files)
                report["file_types"]={}
                for x in files:
                    ext=Path(x.filename).suffix.lower()
                    report["file_types"][ext]=report["file_types"].get(ext,0)+1
                report["sample_animation_paths"]=[x.filename for x in files
                    if x.filename.lower().endswith((".fbx",".bvh",".glb",".blend"))][:30]
                report["zip_bomb_risk"]=report["unpacked_total_bytes"]>2*1024*1024*1024
        else:report["archive_type"]="unknown"
        print(pack,"ACQUIRED",n,"bytes, SHA256",digest.hexdigest(),
            "file-types",report.get("file_types",{}),flush=True)
        return report
    except Exception as e:
        print(pack,"ERROR",type(e).__name__,str(e)[:140],flush=True)
        return {"status":"blocked","reason":type(e).__name__+": "+str(e)[:140]}

def main():
    cli=argparse.ArgumentParser()
    cli.add_argument("--output",default="/tmp/trilok-free-motion")
    cli.add_argument("--report",default="docs/character-studio-c6-2-free-motion-acquisition.json")
    args=cli.parse_args()
    folder=Path(args.output)
    report={"schemaVersion":1,"publisher":"Kevin Iglesias",
      "distribution":"NO SOURCE ASSET REDISTRIBUTION; temporary audit only",
      "packs":{}}
    for pack,url in PACKS.items():
        report["packs"][pack]=dict(url=url,**acquire(pack,url,folder))
    Path(args.report).parent.mkdir(parents=True,exist_ok=True)
    Path(args.report).write_text(json.dumps(report,sort_keys=True,indent=2)+"\n")
    print("Acquired",sum(p["status"]=="acquired" for p in report["packs"].values()),"of 4",flush=True)
    # The workflow succeeds with recorded access limitations; it is a diagnostic,
    # not a fake claim of acquiring all four packs.
if __name__=="__main__":main()
