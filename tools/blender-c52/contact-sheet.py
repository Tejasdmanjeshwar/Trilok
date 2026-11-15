#!/usr/bin/env python3
"""Emit a compact inspectable montage from Blender headless reference screenshots.
Print bounded base64 chunks to GitHub Actions logs for independent image inspection.
"""
import base64
import io
from pathlib import Path
from PIL import Image, ImageDraw

root=Path("test-results/blender-c52")
views=("front","side","three-quarter","closeup")
cases=("longsword-right","longsword-left","staff-right","staff-left")
tile_w,tile_h=240,285
canvas=Image.new("RGB",(tile_w*len(views),tile_h*len(cases)),(31,35,41))
draw=ImageDraw.Draw(canvas)
for y,case in enumerate(cases):
    for x,view in enumerate(views):
        path=root/(case+"-"+view+".png")
        source=Image.open(path).convert("RGB")
        source.thumbnail((tile_w-8,tile_h-35),Image.Resampling.LANCZOS)
        canvas.paste(source,(x*tile_w+(tile_w-source.width)//2,y*tile_h+27))
        draw.text((x*tile_w+7,y*tile_h+6),case+" "+view,fill=(245,245,245))
output=io.BytesIO()
canvas.save(output,format="JPEG",quality=63,optimize=True)
(root/"contact-sheet.jpg").write_bytes(output.getvalue())
encoded=base64.b64encode(output.getvalue()).decode("ascii")
print("C52_CONTACT_SHEET_BEGIN",len(encoded),flush=True)
for i in range(0,len(encoded),1500):
    print("C52_IMAGE_CHUNK "+encoded[i:i+1500],flush=True)
print("C52_CONTACT_SHEET_END",flush=True)
