#!/usr/bin/env python3
"""Reproducible PPW Legends card draft rendering from explicitly curated real photos.

No synthetic faces, stylised lookalikes or auto-matched photo identities.
A Commons licence permits photo adaptation but does NOT clear wrestler likeness rights.
Creative Commons ShareAlike on source photos applies to derived card artwork.
Cards must be reviewed before enabling KP sales.
"""
from __future__ import annotations
import concurrent.futures
import io
import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from PIL import Image, ImageOps, ImageDraw, ImageFont, ImageEnhance

SOURCE = Path("data/legend-approved-photo-sources.json")
DEST = Path("apps/web/public/assets/legends")
AUDIT = Path("data/legend-render-audit.json")
PREVIEW = Path("data/legend-card-contact-sheet.webp")
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

def obtain(url,source_width):
 if not url.startswith("https://upload.wikimedia.org/wikipedia/commons/"):
  raise ValueError("Refusing non-Commons source")
 # Wikimedia explicitly asks high-volume tools to request scaled thumbnails
 # rather than full original images. Never issue parallel requests.
 parsed=urlparse(url)
 basename=parsed.path.rsplit("/",1)[-1]
 thumb_width=min(960,max(240,int(source_width)-1))
 thumb=url.replace("/commons/","/commons/thumb/",1)+"/"+str(thumb_width)+"px-"+basename
 for attempt in range(5):
  try:
   time.sleep(3)
   req=Request(thumb,headers={"User-Agent":
    "PPW-Legends-Real-Photo-Curation/1.0 (GitHub PPW source/licence attribution)"})
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
   return image.convert("RGB")
  except Exception as exc:
   if attempt==4:raise
   # Honour rate limits instead of hammering the image CDN.
   print("IMAGE RETRY",type(exc).__name__,"after",10*(attempt+1),"seconds",flush=True)
   time.sleep(10*(attempt+1))
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
 photo=obtain(entry["sourceUrl"],entry["width"])
 photo=ImageOps.fit(photo,(W-36,H-36),method=Image.Resampling.LANCZOS,
                     centering=(.5,.42))
 photo=ImageEnhance.Contrast(photo).enhance(1.13).convert("RGBA")
 accent,dim=PALETTE[tier]
 canvas=Image.new("RGBA",(W,H),(5,7,13,255))
 canvas.alpha_composite(photo,(18,18))
 shade=Image.new("RGBA",(W,H),(0,0,0,0))
 ink=ImageDraw.Draw(shade,"RGBA")
 for y in range(H):
  top=max(0,1-y/450)
  bottom=max(0,(y-720)/650)
  alpha=round(max(0,min(245,115*top+238*bottom)))
  ink.line((0,y,W,y),fill=(5,7,13,alpha))
 canvas=Image.alpha_composite(canvas,shade)
 draw=ImageDraw.Draw(canvas,"RGBA")
 # A shared collector-edition identity, customised by wrestler/tier, not
 # a different fake collectible on the reveal and collection screens.
 for i,c in ((4,accent),(11,(37,41,51)),(17,accent),(31,dim)):
  draw.rounded_rectangle((i,i,W-i-1,H-i-1),radius=22,outline=(*c,255),
                         width=3 if i in (4,17) else 2)
 for x,y in ((57,65),(W-57,65),(57,H-57),(W-57,H-57)):
  draw.line((x-17,y,x+17,y),fill=(*accent,225),width=3)
  draw.line((x,y-17,x,y+17),fill=(*accent,225),width=3)
 draw.rounded_rectangle((140,53,W-140,117),radius=12,
                        fill=(3,7,14,230),outline=(*accent,210),width=2)
 center(draw,85,"P P W  /  L E G E N D S",31,W-280,(246,245,252,255))
 draw.rounded_rectangle((120,185,W-120,243),radius=10,
                         fill=(*dim,240),outline=(*accent,255),width=2)
 center(draw,213,"THE "+tier+" COLLECTION",30,W-260,(252,251,247,255))
 draw.rounded_rectangle((55,1020,W-55,1375),radius=20,
                        fill=(3,7,14,238),outline=(*accent,235),width=4)
 draw.line((110,1087,W-110,1087),fill=(*accent,190),width=2)
 center(draw,1055,"PRIME ERA  •  HISTORIC ARRIVAL",27,W-220,(*accent,255))
 lines=title_parts(entry["name"].upper())
 if len(lines)==1:
  center(draw,1172,lines[0],68,W-152,(249,247,253,255),serif=True)
 else:
  for i,line in enumerate(lines[:2]):
   center(draw,1137+67*i,line,58,W-152,(249,247,253,255),serif=True)
 draw.line((160,1246,W-160,1246),fill=(*accent,195),width=2)
 center(draw,1297,tier+"  /  " + str(position).zfill(3),43,W-240,(*accent,255),serif=True)
 credit=re.sub(r"<[^>]*>"," ",entry["author"]).strip().replace("  "," ")
 license=entry["license"]
 center(draw,1400,"PHOTO: "+credit+"  •  "+license+"  •  CROPPED",15,W-100,
        (228,226,235,255))
 out=DEST/(entry["id"]+"-"+tier.lower()+"-card.webp")
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
  if e["license"] not in (
    "CC BY 2.0","CC BY 3.0","CC BY 4.0","CC BY-SA 2.0",
    "CC BY-SA 3.0","CC BY-SA 4.0","CC0"):
   raise ValueError("Unacceptable photo licence: "+e["id"])
  batch.append((e,match.group(1),i))
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
  "review":"Draft photo-verified card renders only; no collector/KP activation until visual and likeness-rights review"},indent=2)+"\n")
 print(json.dumps({"attempted":len(batch),"completed":len(success),
                   "failed":len(failed),"totalBytes":sum(x["bytes"] for x in success)}))
 if failed:raise SystemExit(1)

if __name__=="__main__":main()
