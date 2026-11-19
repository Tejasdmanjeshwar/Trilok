#!/usr/bin/env python3
"""Read bone hierarchies from legitimately obtained FBX animation archives.

Strict, bounded, metadata-only FBX binary reader. Never exports animation
curves, source asset bytes, copied skeleton transforms or proprietary files.
No source assets are committed, uploaded, or served to users.
"""
from __future__ import annotations
import hashlib
import json
import re
import struct
import sys
import zipfile
from pathlib import Path

MAX_FBX = 50 * 1024 * 1024
MAX_LEVEL = 15
PACKS=("human-archer","human-melee","dwarf-melee","human-throwing")
HEADER=b"Kaydara FBX Binary  \x00\x1a\x00"
KNOWN_HASHES={
  "human-archer":"87565026f3a3b0aa8aeaadbcc155533ee58d927f5c443a6b2a11f396a461c904",
  "human-melee":"bcd47d323e40419d4dda188d51bd5d91021e6ca42d8dc0c30f1e5053401244f5",
  "dwarf-melee":"735bd248eeb00e90a258b79a5ca8f1618a91c0393f4c117bc6e63a02b4bb9446",
  "human-throwing":"0d04fca026bd870c0348566e8c3e17208ab0de1593e38c5bf337e2598857f1cf",
}
INTERESTING={"Objects","Connections","Model","Properties70","P","C","AnimationStack","Pose"}
class InvalidFBX(Exception):pass

def little(data,start,fmt):
    return struct.unpack_from("<"+fmt,data,start)

def prop(data,pos):
    if pos>=len(data):raise InvalidFBX("truncated property")
    t=chr(data[pos]);pos+=1
    simple={"Y":"h","C":"?","I":"i","F":"f","D":"d","L":"q"}
    if t in simple:
        fmt=simple[t]; size=struct.calcsize("<"+fmt)
        return little(data,pos,fmt)[0],pos+size
    if t in "SR":
        length=little(data,pos,"I")[0];pos+=4
        if length>len(data)-pos:raise InvalidFBX("property overflow")
        value=data[pos:pos+length] if t=="R" else data[pos:pos+length].decode("utf8","replace")
        return (None if t=="R" else value),pos+length
    if t in "fdbilc":
        length,codec,bytes_len=little(data,pos,"III");pos+=12
        if bytes_len>len(data)-pos or length>10_000_000:
            raise InvalidFBX("array overflow")
        return {"array_count":length,"compressed":codec==1},pos+bytes_len
    raise InvalidFBX("Unknown FBX property type: "+repr(t))

def read_nodes(data):
    if not data.startswith(HEADER):raise InvalidFBX("not a binary FBX")
    ver=little(data,len(HEADER),"I")[0]
    hdr="QQQB" if ver>=7500 else "IIIB"
    length=struct.calcsize("<"+hdr)
    def recurse(at,depth,allow=True):
        if at+length>len(data):return None,len(data)
        end,nprops,propsize,namelen=little(data,at,hdr)
        if end==0:return None,at+length
        if end>len(data) or end<=at or nprops>500000 or propsize>len(data):
            raise InvalidFBX("invalid FBX node boundary")
        name=data[at+length:at+length+namelen].decode("utf8","replace")
        pos=at+length+namelen
        should_read=depth==0 or allow
        if not should_read:
            return None,end
        values=[]
        p_end=pos+propsize
        if p_end>end:raise InvalidFBX("invalid property boundary")
        for i in range(nprops):
            v,pos=prop(data,pos)
            if i<10:values.append(v)
        if pos!=p_end:raise InvalidFBX("property length mismatch")
        children=[]
        if depth<MAX_LEVEL and name in INTERESTING:
            pos=p_end
            while pos+length<=end:
                if little(data,pos,hdr)[0]==0:break
                child,newpos=recurse(pos,depth+1,name in INTERESTING)
                if newpos<=pos:raise InvalidFBX("invalid child advancement")
                if child is not None:children.append(child)
                pos=newpos
        return (name,values,children),end
    nodes=[];p=len(HEADER)+4
    while p+length<len(data):
        if little(data,p,hdr)[0]==0:break
        node,nextp=recurse(p,0,True)
        if node: nodes.append(node)
        p=nextp
    return ver,nodes

def locate(node,name):
    for child in node[2]:
        if child[0]==name:yield child

def normname(name):
    raw=str(name).split("\x00",1)[0].split("::")[-1].split(":")[-1]
    return re.sub(r"[^A-Za-z0-9]","",raw).lower()

def parse_fbx(data):
    ver,nodes=read_nodes(data)
    objects=next((n for n in nodes if n[0]=="Objects"),None)
    connections=next((n for n in nodes if n[0]=="Connections"),None)
    if objects is None:raise InvalidFBX("missing Objects section")
    models={}
    for node in locate(objects,"Model"):
        values=node[1]
        if len(values)<3:continue
        uid=values[0]
        if not isinstance(uid,int):continue
        properties={}
        for p70 in locate(node,"Properties70"):
            for item in locate(p70,"P"):
                if len(item[1])>=5 and isinstance(item[1][0],str):
                    properties[item[1][0]]=[v for v in item[1][4:] if isinstance(v,(float,int))]
        models[uid]={"name":normname(values[1]),"kind":str(values[2]),
           "properties":properties,"parent":None}
    if connections:
        for c in locate(connections,"C"):
            v=c[1]
            if len(v)<3 or v[0]!="OO":continue
            child,parent=v[1:3]
            if child in models and parent in models:
                models[child]["parent"]=parent
    limbs=[(uid,m) for uid,m in models.items() if "LimbNode" in m["kind"] or "Limb"==m["kind"]]
    if not limbs:
        limbs=[(uid,m) for uid,m in models.items() if "bone" in m["name"] or "hip" in m["name"]]
    shape=[]
    for uid,m in limbs:
        parent=models.get(m["parent"],{})
        shape.append([m["name"],parent.get("name",""),m["kind"]])
    shape.sort()
    blob=json.dumps(shape,sort_keys=True).encode()
    hierarchy_blob=json.dumps([[row[0],row[1]] for row in shape],sort_keys=True).encode()
    # Distinct from bind-pose matching: a signature means only naming/parent
    # topology matches, not guaranteed identical anatomical rest transforms.
    rest={}
    for uid,m in limbs:
        rest[m["name"]]={"parent":models.get(m["parent"],{}).get("name",""),
            **{key:[round(x,6) for x in m["properties"][key][:3]]
               for key in ("Lcl Translation","Lcl Rotation","PreRotation","PostRotation")
               if key in m["properties"]}}
    pose=json.dumps(rest,sort_keys=True).encode()
    names=set(x[0] for x in shape)
    # Iglesias FBX uses "bShoulder_L", "bForearm_L" and "bIndexFinger01_L",
    # not Mixamo-style LeftArm; normalize names for anatomical coverage only.
    names_norm=set(n[1:] if n.startswith("b") else n for n in names)
    anchor_groups={
      "pelvis":["hips","pelvis"],
      "spine":["spine","spineproxy","chest"],
      "head":["head"],
      "left_shoulder":["shoulderl","upperarml"],
      "right_shoulder":["shoulderr","upperarmr"],
      "left_elbow":["forearml"],
      "right_elbow":["forearmr"],
      "left_hand":["handl"],
      "right_hand":["handr"],
      "left_hip":["thighl"],
      "right_hip":["thighr"],
      "left_knee":["shinl"],
      "right_knee":["shinr"],
      "left_foot":["footl"],
      "right_foot":["footr"],
    }
    anchors={k:any(n in names_norm for n in vals) for k,vals in anchor_groups.items()}
    fingers={side:sum(n.endswith(side) and any(
        d in n for d in ("thumb","indexfinger","middlefinger","ringfinger","pinky"))
        for n in names_norm) for side in ("l","r")}
    stacks=[n[1][1] if len(n[1])>1 else "unknown" for n in locate(objects,"AnimationStack")]
    return {
      "fbx_version":ver,"bone_count":len(limbs),"model_count":len(models),
      "topology_sha256":hashlib.sha256(blob).hexdigest(),
      "hierarchy_sha256":hashlib.sha256(hierarchy_blob).hexdigest(),
      "hierarchy_parent_pairs":[[n,p] for n,p,k in shape if n in ("bhips","bspine","bshoulderl","bupperarml","bforearml","bhandl","bthighl","bshinl","bfootl")],
      "rest_local_property_sha256":hashlib.sha256(pose).hexdigest(),
      "bone_names":[row[0] for row in shape],
      "anchors":anchors,"finger_bones":fingers,
      "animation_stacks_count":len(stacks),
      "animation_names":stacks[:3],
      "source_local_sample":{k:rest[k] for k in ("bhips","bspine","bupperarml","bforearml","bhandl","bthighl","bshinl") if k in rest},
    }

def enumerate_nested(z,files,depth=0):
    results=list(files)
    # Only inspect nested zip metadata, and only if present as small archives.
    if depth<1:
        for info in z.infolist():
            if info.filename.lower().endswith(".zip") and info.file_size<MAX_FBX:
                try:
                    with zipfile.ZipFile(__import__("io").BytesIO(z.read(info))) as zz:
                        results.extend([x.filename for x in zz.infolist()
                             if x.filename.lower().endswith(".fbx")])
                except Exception:pass
    return results

def process(pack,filename):
    raw=Path(filename).read_bytes()
    digest=hashlib.sha256(raw).hexdigest()
    if digest!=KNOWN_HASHES[pack]:raise RuntimeError("archive SHA mismatch: "+pack)
    with zipfile.ZipFile(filename) as z:
        animation_files=[x for x in z.infolist() if not x.is_dir()
            and x.filename.lower().endswith(".fbx")]
        # Across naming and animation types, sample neutral, combat and tail
        def priority(x):
            n=x.filename.lower()
            return (
                0 if "idle" in n or "tpose" in n else
                1 if "bow" in n or "shoot" in n or "attack" in n else
                2 if "run" in n or "walk" in n else 3,
                len(x.filename),x.filename
            )
        eligible=sorted(animation_files,key=lambda x:x.filename)
        def take(pred):
            return next((v for v in eligible if pred(v.filename.lower())),None)
        chosen=[
           take(lambda n:"/male/idles/" in n),
           take(lambda n:"/female/idles/" in n),
           take(lambda n:"/combat/" in n and
               any(k in n for k in ("shoot","attack","throw","bow"))),
           take(lambda n:"/movement/" in n and
               ("walk" in n or "run" in n)),
        ]
        chosen=[x for x in chosen if x is not None]
        if not chosen:chosen=sorted(animation_files,key=priority)[:3]
        chosen=list({x.filename:x for x in chosen}.values())
        diagnostics=[]
        for info in chosen:
            row={"path":info.filename,"bytes":info.file_size}
            if info.file_size>MAX_FBX:
                row["status"]="skipped oversized FBX"
            else:
                try:row.update({"status":"parsed",**parse_fbx(z.read(info))})
                except Exception as exc:row.update({"status":"parse_error","error":str(exc)[:160]})
            diagnostics.append(row)
        return {"archive_sha256":digest,"archive_bytes":len(raw),
          "fbx_file_count":len(animation_files),
          "sampled":diagnostics,
          "examples":[x.filename for x in sorted(animation_files,key=priority)[:16]]
        }

def main():
    folder=Path(sys.argv[1])
    report={"schemaVersion":1,"disclaimer":"Metadata-only; source rigs require different target calibration; no licensed FBX redistributed.","packs":{}}
    for pack in PACKS:
        path=folder/(pack+".download")
        try:report["packs"][pack]=process(pack,path)
        except Exception as exc:report["packs"][pack]={"status":"failed","error":str(exc)}
    for k,v in report["packs"].items():
        print("PACK",k,"fbx",v.get("fbx_file_count"),"sampled:",
            [(x.get("path"),x.get("status"),x.get("bone_count"),x.get("topology_sha256","")[:12])
              for x in v.get("sampled",[])],flush=True)
    # Emitting only structural information, no animation keys or source bytes.
    print("FBX_AUDIT_JSON_BEGIN"+json.dumps(report,separators=(",",":"))+"FBX_AUDIT_JSON_END",flush=True)

if __name__=="__main__": main()
