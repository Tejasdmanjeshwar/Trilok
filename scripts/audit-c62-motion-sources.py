#!/usr/bin/env python3
"""Compare actual acquired UAL/ACCAD skeletons with pinned MakeHuman landmarks.

Offline, standard-library only. No runtime dependencies, generated vertices, or
subjectively invented pose metrics. Audit scores describe rest-rig alignment,
NOT motion naturalness. Source archives are external CI inputs, never bundled.
"""
from __future__ import annotations
import hashlib
import json
import math
import re
import struct
import sys
import zipfile
from pathlib import Path

SHA = {
    "UAL1-Standard.zip": "cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724",
    "UAL2-Standard.zip": "4008ea208a604773a2b2177d965f0f5d3195498b5bf838c3f5785d68e95f2a68",
    "ACCAD-quickwalk.zip": "5d6093360ace16d873f96c43be822bd88ea09e8a7f65b3e9df78b9f4be174e3c",
    "ACCAD-female.zip": "84543297a24fe9900449675837b5b7758c5208d0f56b699d10a3eb362a46530a",
}
# The fixed source hash for Female1 is defined in the repository source audit.
SHA["ACCAD-female.zip"] = "84543297a24fe9900449675837b5b7758c5208d0f56b699d10a3eb362a46530a"
# Audited here as metadata-only if archive hash differs from documented source.

def vec_add(a,b): return tuple(a[i]+b[i] for i in range(3))
def vec_sub(a,b): return tuple(a[i]-b[i] for i in range(3))
def norm(a): return math.sqrt(sum(x*x for x in a))
def unit(a):
    n=norm(a)
    return tuple(x/n for x in a) if n>1e-9 else (0.,0.,0.)
def angle(a,b):
    u,v=unit(a),unit(b)
    return round(math.degrees(math.acos(max(-1.,min(1.,sum(u[i]*v[i] for i in range(3)))))),1)
def qmul(a,b):
    x,y,z,w=a; X,Y,Z,W=b
    return (w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z)
def qrot(q,v):
    x,y,z,w=q
    # rot unit q, avoid multiplying quaternions for every vector
    cx=y*v[2]-z*v[1];cy=z*v[0]-x*v[2];cz=x*v[1]-y*v[0]
    tx,ty,tz=2*cx,2*cy,2*cz
    return (v[0]+w*tx+(y*tz-z*ty),v[1]+w*ty+(z*tx-x*tz),v[2]+w*tz+(x*ty-y*tx))
def glb(path):
    with zipfile.ZipFile(path) as z:
        name=next(n for n in z.namelist() if n.endswith("/Unreal-Godot/"+path.stem.replace("-Standard","")+"_Standard.glb"))
        data=z.read(name)
    if data[:4]!=b"glTF" or struct.unpack_from("<I",data,4)[0]!=2:raise ValueError("Invalid GLB")
    length,t=struct.unpack_from("<II",data,12)
    if t!=0x4e4f534a:raise ValueError("Missing JSON chunk")
    return json.loads(data[20:20+length]),hashlib.sha256(data).hexdigest()

def makehuman_landmarks(obj_file,rig_file):
    rig=json.loads(rig_file.read_text())
    vertices=[]
    for row in obj_file.read_text().splitlines():
        if row.startswith("v "):
            fields=row.split()
            vertices.append(tuple(float(x) for x in fields[1:4]))
    points={}
    for bone_name,bone in rig["bones"].items():
        ids=rig["joints"][bone["head"]]
        if not ids:raise ValueError("Missing official joint vertices")
        points[bone_name]=tuple(sum(vertices[i][j] for i in ids)/len(ids) for j in range(3))
    return points

def gltf_rig(data):
    nodes=data["nodes"]; world=[None]*len(nodes)
    parents={}
    for i,n in enumerate(nodes):
        for child in n.get("children",[]): parents[child]=i
    def at(i):
        if world[i] is not None:return world[i]
        node=nodes[i]
        local_pos=tuple(node.get("translation",(0,0,0)))
        local_rot=tuple(node.get("rotation",(0,0,0,1)))
        if i in parents:
            pp,pr=at(parents[i])
            world[i]=(vec_add(pp,qrot(pr,local_pos)),qmul(pr,local_rot))
        else:world[i]=(local_pos,local_rot)
        return world[i]
    positions={n["name"]:at(i)[0] for i,n in enumerate(nodes) if "name" in n}
    return positions

def pairs(src,dst):
    # Two source suffix orientations are checked rather than guessing which
    # skeleton calls positive X 'left'. The best correspondence is reported.
    pairings=[("upperarm","lowerarm","upperarm01","lowerarm01"),
        ("lowerarm","hand","lowerarm01","wrist"),
        ("thigh","calf","upperleg01","lowerleg01"),
        ("calf","foot","lowerleg01","foot")]
    options=[]
    for reversed_side in (False,True):
        rows=[]
        for side in ("l","r"):
            tgt=("R" if side=="l" else "L") if reversed_side else side.upper()
            for sourceA,sourceB,targetA,targetB in pairings:
                k1,k2=sourceA+"_"+side,sourceB+"_"+side
                t1,t2=targetA+"."+tgt,targetB+"."+tgt
                if any(k not in src for k in (k1,k2)) or any(k not in dst for k in (t1,t2)):
                    continue
                sd=vec_sub(src[k2],src[k1]);td=vec_sub(dst[t2],dst[t1])
                rows.append({"segment":sourceA+"-"+sourceB,
                    "source_side":side,"target_side":tgt,
                    "angle_degrees":angle(sd,td),
                    "source_length":round(norm(sd),5),
                    "makehuman_length_source_units":round(norm(td),5)})
        mean=round(sum(x["angle_degrees"] for x in rows)/max(1,len(rows)),1)
        options.append((mean,reversed_side,rows))
    mean,reversed_side,rows=min(options,key=lambda x:x[0])
    return {"mean_rest_segment_axis_gap_degrees":mean,
        "source_to_makehuman_side_swapped":reversed_side,
        "segments":rows}

def clip_inventory(gltf):
    nodes=gltf["nodes"]; accessors=gltf["accessors"]
    clips=[]
    for clip in gltf["animations"]:
        channels=clip.get("channels",[])
        ids=[c["target"]["node"] for c in channels if c["target"]["path"]=="rotation"]
        finger_count=sum(any(t in nodes[i].get("name","").lower() for t in (
            "index","middle","ring","pinky","thumb")) for i in ids)
        durations=[accessors[clip["samplers"][c["sampler"]]["input"]].get("max",[0])[0] for c in channels]
        frames=[accessors[clip["samplers"][c["sampler"]]["input"]]["count"] for c in channels]
        clips.append({"name":clip["name"],"seconds":round(max(durations,default=0),3),
            "keyframes":max(frames,default=0),"rotation_bones":len(ids),
            "finger_rotation_bones":finger_count,
            "translation_tracks":sum(c["target"]["path"]=="translation" for c in channels)})
    return clips

def bvh_info(text):
    lines=text.splitlines()
    if "MOTION" not in text:raise ValueError("Missing BVH motion")
    i=0;nodes=[];stack=[];pending=None;end_id=0
    while i<len(lines):
        line=lines[i].strip()
        if line=="MOTION":break
        if line.startswith(("ROOT ","JOINT ")):
            pending={"name":line.split(None,1)[1],"offset":(0,0,0),
                "parent":stack[-1] if stack else None,"channels":[]}
        elif line=="End Site":
            pending={"name":"EndSite_"+str(end_id),"offset":(0,0,0),
                "parent":stack[-1] if stack else None,"channels":[]};end_id+=1
        elif line=="{":
            if pending is None:raise ValueError("Unexpected BVH bracket")
            nodes.append(pending);stack.append(len(nodes)-1);pending=None
        elif line=="}":
            if not stack:raise ValueError("Unbalanced BVH hierarchy")
            stack.pop()
        elif line.startswith("OFFSET "):
            nodes[stack[-1]]["offset"]=tuple(float(x) for x in line.split()[1:4])
        elif line.startswith("CHANNELS "):
            nodes[stack[-1]]["channels"]=line.split()[2:]
        i+=1
    frames_line=next((x for x in lines[i:] if x.strip().startswith("Frames:")),None)
    frame_line=next((x for x in lines[i:] if x.strip().startswith("Frame Time:")),None)
    frames=int(frames_line.split(":",1)[1]) if frames_line else None
    seconds=float(frame_line.split(":",1)[1])*(frames-1) if frame_line and frames else None
    return {"joints":sum(not n["name"].startswith("EndSite") for n in nodes),
        "animated_joints":sum(bool(n["channels"]) for n in nodes),
        "fingers":sum(any(x in n["name"].lower() for x in ("finger","thumb","index","middle","pinky","ring")) for n in nodes),
        "frames":frames,"seconds":round(seconds,3) if seconds is not None else None,
        "joint_names":[n["name"] for n in nodes if not n["name"].startswith("EndSite")]}

def main():
    folder=Path(sys.argv[1]);repo=Path(sys.argv[2])
    # Check original archive bytes (previously verified by source acquisition)
    for name,expected in SHA.items():
        raw=(folder/name).read_bytes()
        got=hashlib.sha256(raw).hexdigest()
        if got!=expected:raise ValueError(f"{name} SHA mismatch: {got} vs {expected}")
    makehuman=makehuman_landmarks(
        repo/"apps/web/public/anatomy/makehuman-base.obj",
        repo/"apps/web/public/anatomy/makehuman-default.mhskel")
    out={"schemaVersion":1,"comparisonNotes":[
        "Rest axis differences are not a perceptual animation quality score",
        "BVH uses a different skeleton and conventions; no direct orientation comparison is valid without BVH coordinate conversion",
        "MakeHuman landmarks come from pinned default.mhskel and original OBJ vertices"],
        "libraries":{}}
    for name in ("UAL1-Standard.zip","UAL2-Standard.zip"):
        gltf,glb_sha=glb(folder/name)
        src=gltf_rig(gltf)
        clips=clip_inventory(gltf)
        out["libraries"][name]={"source_glb_sha256":glb_sha,
            "node_count":len(gltf["nodes"]),"skin_joint_count":len(gltf["skins"][0]["joints"]),
            "rest_fit":pairs(src,makehuman),
            "clips_count":len(clips),
            "locomotion_clips":[c for c in clips if re.search(r"idle|walk|jog|run|sprint|stand",c["name"],re.I)],
            "all_clip_names":[c["name"] for c in clips]}
    accad={}
    for name in ("ACCAD-quickwalk.zip","ACCAD-female.zip"):
        with zipfile.ZipFile(folder/name) as z:
            names=[n for n in z.namelist() if n.lower().endswith(".bvh")]
            chosen=[n for n in names if re.search(r"walk|run|stand|wait|sway",n,re.I)]
            initial=chosen[:6] or names[:1]
            accad[name]={"clip_count":len(names),"candidate_clips":chosen,
                "skeleton_samples":{n:bvh_info(z.read(n).decode("utf-8","replace")) for n in initial}}
    out["accad"]=accad
    report=repo/"docs/character-studio-c6-2-source-fit-audit.json"
    report.write_text(json.dumps(out,indent=2,sort_keys=True)+"\n")
    for name,lib in out["libraries"].items():
        print(name,"bones",lib["skin_joint_count"],"axis-gap",lib["rest_fit"]["mean_rest_segment_axis_gap_degrees"],
            "clips",lib["clips_count"],"locomotion",[(x["name"],x["seconds"]) for x in lib["locomotion_clips"]])
    for name,lib in out["accad"].items():
        print(name,"BVH clips",lib["clip_count"],"candidates",lib["candidate_clips"][:22])
    print("Saved",report)

if __name__=="__main__": main()
