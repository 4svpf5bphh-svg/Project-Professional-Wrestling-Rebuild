#!/usr/bin/env python3
"""Reproducible PPW Legends card draft rendering from manually identified real photos.

No synthetic faces, stylised lookalikes or auto-matched photo identities.
For a private hobby build, prioritise authentic era-appropriate wrestling imagery.
Keep source provenance; editorial photography is NOT commercially cleared.
Creative Commons photo licences and wrestler likeness rights are separate.
Keep badge, text and decorations OUTSIDE the photograph.
"""
from __future__ import annotations
import concurrent.futures
import io
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from PIL import Image, ImageOps, ImageDraw, ImageFont, ImageEnhance

SOURCE = Path("data/legend-approved-photo-sources.json")
DEST = Path("apps/web/public/assets/legends")
PHOTO_CACHE = Path("data/.legend-photo-cache")
BATCH = int(os.environ.get("PPW_LEGEND_BATCH","-1"))
AUDIT = Path("data/legend-render-audit"+("-batch-"+str(BATCH) if BATCH>=0 else "")+".json")
PREVIEW = Path("data/legend-card-contact-sheet"+("-batch-"+str(BATCH) if BATCH>=0 else "")+".webp")
W,H=960,1440
PALETTE={
 "CULT": ((124,166,202),(29,48,66)),
 "LEGEND": ((241,187,90),(63,41,14)),
 "ICON": ((88,211,246),(13,53,67)),
 "IMMORTAL": ((207,148,250),(55,28,78)),
}

def fonts(size:int, serif=False):
 return ImageFont.truetype(
  "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf" if serif else
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",size)

def fit_text(draw, text, max_width, default_size, minimum=23, serif=False):
 for size in range(default_size,minimum-1,-2):
  f=fonts(size,serif=serif)
  if draw.textbbox((0,0),text,font=f)[2]<=max_width:return f
 return fonts(minimum,serif=serif)

def center(draw,y,text,size,max_width,fill,serif=False):
 f=fit_text(draw,text,max_width,size,serif=serif)
 draw.text((W//2,y),text,font=f,fill=fill,anchor="mm",stroke_width=0)

def obtain(url,source_width,identity):
 PHOTO_CACHE.mkdir(parents=True,exist_ok=True)
 cached=PHOTO_CACHE/(identity+".webp")
 if cached.is_file():
  with Image.open(cached) as master:
   master.load()
   if min(master.size)>=500:return master.convert("RGB")
 parsed=urlparse(url)
 if parsed.scheme!="https" or not parsed.hostname or parsed.username:
  raise ValueError("Curated source requires a public HTTPS image URL")
 if parsed.hostname=="upload.wikimedia.org" and parsed.path.startswith("/wikipedia/commons/"):
  basename=parsed.path.rsplit("/",1)[-1]
  thumb_width=960 if source_width>=960 else 500 if source_width>=500 else 330
  request_url=parsed.scheme+"://"+parsed.netloc+parsed.path.replace(
   "/commons/","/commons/thumb/",1)+"/"+str(thumb_width)+"px-"+basename
 else:
  request_url=url
 for attempt in range(2):
  try:
   time.sleep(4)
   req=Request(request_url,headers={"User-Agent":
    "PPW-Legends-Photo-Review/1.0 (non-commercial draft image curation)",
    "Accept":"image/jpeg,image/png,image/webp"})
   with urlopen(req,timeout=35) as reply:
    if reply.headers.get("Content-Type","").split(";")[0] not in (
      "image/jpeg","image/png","image/webp","application/octet-stream"):
     raise ValueError("Unexpected image content type")
    data=reply.read(26_000_000)
   if len(data)>=26_000_000: raise ValueError("Source image exceeds safe budget")
   image=Image.open(io.BytesIO(data))
   image.load()
   if image.width<500 or image.height<500:
    raise ValueError("Insufficient source image resolution")
   photo=image.convert("RGB")
   photo.save(cached,"WEBP",quality=91,method=6)
   return photo
  except Exception as exc:
   if attempt==1:raise
   print("IMAGE RETRY",type(exc).__name__,"after 10 seconds",flush=True)
   time.sleep(10)
 raise RuntimeError("Unreachable")

def title_parts(title:str):
 if len(title)<=22:return [title]
 parts=title.split()
 half=len(title)/2
 groups=["",""]
 for part in parts:
  k=0 if len(groups[0])<half else 1
  groups[k]=(groups[k]+" "+part).strip()
 return groups

def draw_card(entry, tier, position):
 out=DEST/(entry["id"]+"-"+tier.lower()+"-card.webp")
 if out.is_file() and out.stat().st_size>30_000 and not os.environ.get("PPW_LEGEND_FORCE_RENDER"):
  with Image.open(out) as old:
   if old.size==(W,H):
    return {"id":entry["id"],"name":entry["name"],"tier":tier,
     "file":str(out),"bytes":out.stat().st_size,"author":entry["author"],
     "license":entry["license"],"sourcePage":entry["sourcePage"],"cached":True}
 photo=obtain(entry["sourceUrl"],entry["width"],entry["id"])
 # Separate photographic window: no text, labels or shading atop the wrestler.
 accent,dim=PALETTE[tier]
 photo_box=(53,162,W-53,1063)
 pw,ph=photo_box[2]-photo_box[0],photo_box[3]-photo_box[1]
 focal_x=max(.1,min(.9,float(entry.get("focalX",.5))))
 focal_y=max(.1,min(.9,float(entry.get("focalY",.36))))
 photo=ImageOps.fit(photo,(pw,ph),method=Image.Resampling.LANCZOS,
                    centering=(focal_x,focal_y))
 photo=ImageEnhance.Contrast(photo).enhance(1.06).convert("RGB")
 canvas=Image.new("RGB",(W,H),(7,10,17))
 draw=ImageDraw.Draw(canvas)
 # Rarity treatment belongs exclusively to the border, header and footer.
 for i,c in ((5,accent),(15,(35,40,54)),(25,dim)):
  draw.rounded_rectangle((i,i,W-i-1,H-i-1),radius=22,outline=c,
                         width=3 if i==5 else 2)
 draw.rounded_rectangle((54,46,W-54,143),radius=16,
                        fill=(11,14,25),outline=accent,width=3)
 center(draw,76,"P P W   /   L E G E N D S",28,W-160,(247,246,252))
 center(draw,120,"THE "+tier+" COLLECTION",29,W-165,accent)
 canvas.paste(photo,(photo_box[0],photo_box[1]))
 draw.rectangle((49,158,W-49,1067),outline=accent,width=4)
 draw.rounded_rectangle((53,1081,W-53,1370),radius=18,
                        fill=(11,14,25),outline=accent,width=3)
 center(draw,1113,"A LEGEND ENTERS THE WORLD",24,W-180,accent)
 draw.line((116,1147,W-116,1147),fill=dim,width=3)
 lines=title_parts(entry["name"].upper())
 if len(lines)==1:
  center(draw,1208,lines[0],69,W-144,(250,249,252),serif=True)
 else:
  for i,line in enumerate(lines[:2]):
   center(draw,1178+57*i,line,55,W-144,(250,249,252),serif=True)
 draw.line((144,1271,W-144,1271),fill=accent,width=2)
 center(draw,1313,tier+"  /  "+str(position).zfill(3),39,W-210,accent,serif=True)
 # Source credit is confined to the footer, NOT the action photograph.
 credit=re.sub(r"<[^>]*>"," ",entry.get("author","Source not confirmed")).strip()
 license=entry.get("license","Unverified")
 center(draw,1403,"PHOTO: "+credit+"  •  "+license+"  •  ARCHIVAL EDIT",
        16,W-115,(201,204,214))
 out.parent.mkdir(parents=True,exist_ok=True)
 canvas.convert("RGB").save(out,"WEBP",quality=83,method=6)
 return {"id":entry["id"],"name":entry["name"],"tier":tier,
         "file":str(out),"bytes":out.stat().st_size,"author":credit,
         "license":license,"sourcePage":entry["sourcePage"]}

def main():
 manifest=json.loads(SOURCE.read_text())["images"]
 catalogue=Path("src/domain/legends-catalogue.ts").read_text()
 batch=[]
 for i,e in enumerate(manifest,1):
  escaped=re.escape(e["id"])
  match=re.search(r'id:"'+escaped+r'".{0,160}?tier:"(CULT|LEGEND|ICON|IMMORTAL)"',
                  catalogue,re.S)
  if not match: raise ValueError("Uncurated legend "+e["id"])
  if BATCH<0 or (i-1)//8==BATCH:
   batch.append((e,match.group(1),int(e.get("collectorNumber",i+1))))
 results=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
  pending={pool.submit(draw_card,*args):args[0]["id"] for args in batch}
  for future in concurrent.futures.as_completed(pending):
   id=pending[future]
   try: results.append(future.result());print("RENDERED",id,flush=True)
   except Exception as err:
    results.append({"id":id,"error":str(err)})
    print("FAILED",id,str(err),flush=True)
 results.sort(key=lambda x:x["id"])
 failed=[x for x in results if "error" in x]
 success=[x for x in results if "file" in x]
 # The contact sheet and status report deliberately remain external review
 # artifacts. This script NEVER activates a collectible in the game.
 if success:
  cols=6; tw=240;th=360
  rows=(len(success)+cols-1)//cols
  sheet=Image.new("RGB",(cols*tw,rows*th),(12,13,20))
  for n,item in enumerate(success):
   card=Image.open(item["file"]).convert("RGB").resize((tw,th),Image.Resampling.LANCZOS)
   sheet.paste(card,((n%cols)*tw,(n//cols)*th))
  sheet.save(PREVIEW,"WEBP",quality=79)
 AUDIT.write_text(json.dumps({"attempted":len(batch),"completed":len(success),
  "failed":failed,"cards":results,
  "batch":BATCH,
  "review":"Private hobby drafts; provenance kept, commercial rights unverified; review identities and photos before activation"},indent=2)+"\n")
 print(json.dumps({"attempted":len(batch),"completed":len(success),
                   "failed":len(failed),"totalBytes":sum(x["bytes"] for x in success)}))
 if failed:raise SystemExit(1)

if __name__=="__main__":main()
