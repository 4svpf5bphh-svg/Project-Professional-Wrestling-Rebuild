#!/usr/bin/env python3
"""Synthetic pixels test cropping without downloading wrestlers or using Neon."""
from pathlib import Path
from tempfile import TemporaryDirectory
from PIL import Image,ImageDraw
from build_legend_portraits import build,SIZE
with TemporaryDirectory() as folder:
 root=Path(folder);assets=root/"assets";assets.mkdir()
 manifest=root/"manifest.json"
 manifest.write_text('{"images":[{"id":"tester","name":"Tester","tier":"CULT"}]}')
 for slug,tier in [("tester","cult"),("undertaker","immortal")]:
  image=Image.new("RGB",(960,1440),(222,15,22));draw=ImageDraw.Draw(image)
  draw.rectangle((55,164,905,1061) if slug=="tester" else (95,290,865,1000),fill=(40,135,185))
  image.save(assets/(slug+"-"+tier+"-card.webp"))
 registry=root/"registry.ts"
 report=build(manifest,assets,root/"cache",registry,root/"audit.json")
 assert report["portraitsRegistered"]==2,report
 assert not report["failed"],report
 assert "legend:undertaker:0" in registry.read_text()
 for slug in ["tester","undertaker"]:
  with Image.open(assets/(slug+"-0-portrait.webp")) as photo:
   assert photo.size==SIZE
   r,g,b=photo.getpixel((240,312))
   assert abs(r-40)<10 and abs(g-135)<10 and abs(b-185)<10,(r,g,b)
print("All source-matched portrait crops and registry checks passed.")
