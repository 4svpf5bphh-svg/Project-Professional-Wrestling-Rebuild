#!/usr/bin/env python3
"""Offline Legend portrait derivatives: same photograph as the associated card.

Previous draft cards have an unobstructed image window. A recovered crop is
preferable to an unrelated source photo or an AI likeness. Portraits are keyed
by immutable World person IDs and served as static bundled PWA assets.
"""
import json
from pathlib import Path
from PIL import Image, ImageOps

SIZE=(480,624)
ROOT=Path("apps/web/public/assets/legends")
MANIFEST=Path("data/legend-approved-photo-sources.json")
CACHE=Path("data/.legend-photo-cache")
REGISTRY=Path("src/ui/legend-portrait-assets.ts")
AUDIT=Path("data/legend-portrait-audit.json")

def build(manifest=MANIFEST, root=ROOT, cache=CACHE, registry=REGISTRY, audit=AUDIT):
 records=json.loads(Path(manifest).read_text())["images"]
 records.append({"id":"undertaker","name":"The Undertaker","tier":"IMMORTAL"})
 urls={}
 results=[]
 for entry in records:
  slug=entry["id"]
  card=next(iter(Path(root).glob(slug+"-*-card.webp")),None)
  if not card:
   results.append({"id":slug,"status":"missing-card"})
   continue
  master=Path(cache)/(slug+".webp")
  original=master if master.is_file() else card
  try:
   with Image.open(original) as photo:
    photo.load()
    photo=photo.convert("RGB")
    if original==card:
     if photo.size!=(960,1440):raise ValueError("Unexpected card dimensions")
     # Image-safe window: no badges, panels or text over the wrestler.
     photo=photo.crop((95,290,865,1000) if slug=="undertaker" else (55,164,905,1061))
    count=2 if slug=="road-warriors" else 1
    derived=[]
    for index in range(count):
     output=Path(root)/(slug+"-"+str(index)+"-portrait.webp")
     if not output.is_file() or output.stat().st_size<6000 or output.stat().st_mtime<original.stat().st_mtime:
      fx=float(entry.get("focalX",.5))
      fy=float(entry.get("focalY",.36))
      if count==2:fx=float(entry.get("memberFocalX",[.24,.76])[index])
      if not 0<=fx<=1 or not 0<=fy<=1:raise ValueError("Focal point outside 0..1")
      crop=ImageOps.fit(photo,SIZE,method=Image.Resampling.LANCZOS,centering=(fx,fy))
      output.parent.mkdir(parents=True,exist_ok=True)
      crop.save(output,"WEBP",quality=85,method=6)
     with Image.open(output) as check:
      if check.size!=SIZE:raise ValueError("Wrong portrait size")
     derived.append(str(output))
     # Tag team identity and framing require separate manual review.
     if count==1:urls["legend:"+slug+":"+str(index)]="/assets/legends/"+output.name
    results.append({"id":slug,"status":"draft","files":derived,
      "source":"cached-original" if original==master else "card-photo-window",
      "memberReviewRequired":count==2})
  except Exception as exc:results.append({"id":slug,"status":"failed","reason":str(exc)})
 lines=[
  "/** Generated from actual static source-backed Legend portraits.",
  " * Person IDs survive changes of employer, roster and ring name. */",
  "export const LEGEND_PORTRAIT_ASSETS: Readonly<Record<string,string>> = Object.freeze({",
  *["  "+json.dumps(key)+": "+json.dumps(url)+"," for key,url in sorted(urls.items())],
  "});",
  "export function legendPortraitSource(personId?:string|null):string|null {",
  "  return personId ? LEGEND_PORTRAIT_ASSETS[personId] ?? null : null;",
  "}",""]
 Path(registry).parent.mkdir(parents=True,exist_ok=True)
 Path(registry).write_text("\n".join(lines))
 report={"cardsFound":len([r for r in results if r["status"]=="draft"]),
   "portraitsRegistered":len(urls),
   "missing":[r["id"] for r in results if r["status"]=="missing-card"],
   "failed":[r for r in results if r["status"]=="failed"],"details":results}
 Path(audit).write_text(json.dumps(report,indent=2)+"\n")
 print(json.dumps({k:report[k] for k in ("cardsFound","portraitsRegistered","missing","failed")}))
 return report

if __name__=="__main__":build()
