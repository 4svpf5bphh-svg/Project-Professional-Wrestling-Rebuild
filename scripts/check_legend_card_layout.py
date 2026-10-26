#!/usr/bin/env python3
"""Check photo-safe layout without external network or wrestler likeness files."""
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parent))
import build_curated_legend_cards as renderer

with TemporaryDirectory() as work:
 renderer.DEST=Path(work)
 renderer.obtain=lambda url,width,identity:Image.new("RGB",(1200,1200),(100,145,190))
 for tier in renderer.PALETTE:
  card=renderer.draw_card({
   "id":"layout-probe-"+tier.lower(),
   "name":"A Very Long Legendary Tag Team Name",
   "author":"Test","license":"Unverified",
   "sourcePage":"https://example.org/photo",
   "sourceUrl":"https://example.org/photo.jpg",
   "width":1200
  },tier,48)
  with Image.open(card["file"]) as img:
   assert img.size==(960,1440)
   for x,y in ((180,275),(480,600),(720,880),(480,1010)):
    rgb=img.getpixel((x,y))
    assert all(abs(v-t)<=9 for v,t in zip(rgb,(100,145,190))),(
      tier,x,y,rgb,"label or shading obstructs photo")
   assert img.getpixel((480,1200))!=(100,145,190), "Name panel missing"
 print("All four tiers pass unobstructed-photo regression.")
