#!/usr/bin/env python3
"""Render the ONE definitive PPW Undertaker pilot card using an authentic photo.

Photo: Steve Wright Jr., "The Undertaker" (30 Jan 2012), CC BY 2.0.
Source: https://commons.wikimedia.org/wiki/File:The_Undertaker.jpg
Licence: https://creativecommons.org/licenses/by/2.0/
Derivative: cropped, colour graded, laid out as an original PPW card.
Wrestler publicity/likeness rights are separate from copyright permission.
"""
from __future__ import annotations
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen
from PIL import Image, ImageOps, ImageDraw, ImageFont, ImageEnhance, ImageFilter
import math

SOURCE = "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/The_Undertaker.jpg/960px-The_Undertaker.jpg"
BACKUP = "https://upload.wikimedia.org/wikipedia/commons/7/77/The_Undertaker.jpg"
DEST = Path("public/assets/legends/undertaker-immortal-card.webp")
W,H = 960,1440
def load_photo():
    for url in (SOURCE,BACKUP):
        try:
            req=Request(url,headers={"User-Agent":"PPW-Legends-Card-Test/1.0 (Wikimedia Commons CC BY 2.0 photo attribution)"})
            with urlopen(req,timeout=30) as f:
                raw=f.read(14_000_000)
            photo=Image.open(BytesIO(raw)).convert("RGB")
            if photo.width<600 or photo.height<900:
                raise ValueError("Source resolution is too small")
            return photo
        except Exception as e:
            print(f"Photo source unavailable: {type(e).__name__}: {e}")
    raise RuntimeError("The real licensed photograph could not be retrieved; NEVER substitute an AI likeness.")

def font(name,size):
    paths={
        "serif":"/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "serifregular":"/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "sans":"/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "small":"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    }
    return ImageFont.truetype(paths[name],size)

def center(draw, y, label, f, fill, stroke=0):
    draw.text((W//2,y),label,font=f,anchor="mm",fill=fill,
              stroke_width=stroke,stroke_fill=(5,2,13,245) if stroke else None)

def render():
    photo=ImageEnhance.Contrast(load_photo()).enhance(1.19)
    photo=ImageEnhance.Color(photo).enhance(.76)
    photo=ImageOps.fit(photo,(W-36,H-36),method=Image.Resampling.LANCZOS,
                       centering=(.50,.44)).convert("RGBA")
    colour=Image.new("RGBA",photo.size,(88,42,128,40))
    photo=Image.alpha_composite(photo,colour)
    art=Image.new("RGBA",(W,H),(6,3,16,255))
    art.alpha_composite(photo,(18,18))
    veil=Image.new("RGBA",(W,H),(0,0,0,0))
    px=veil.load()
    for y in range(H):
        v=y/H
        for x in range(W):
            h=abs((x-W/2)/(W/2))
            shade=min(236,int(
                175*max(0,(v-.64)/.36)**1.45
                +155*max(0,(.22-v)/.22)
                +55*h*h
            ))
            px[x,y]=(6,2,18,shade)
    art=Image.alpha_composite(art,veil)
    draw=ImageDraw.Draw(art,"RGBA")
    lilac=(213,182,242,255)
    violet=(147,93,185,255)
    silver=(238,221,249,255)
    muted=(188,153,207,255)
    # Distinctive double metal frame, inset gothic filigree, no external logo.
    for i,col in [(3,(192,151,221,255)),(8,(50,26,74,255)),
                  (14,(207,164,237,225)),(29,(197,159,221,153))]:
        draw.rounded_rectangle((i,i,W-i-1,H-i-1),radius=24,
                               outline=col,width=3 if i in (3,14) else 2)
    for x,y,s in [(64,67,30),(W-64,67,30),(64,H-66,24),(W-64,H-66,24)]:
        draw.line((x-s,y,x+s,y),fill=violet,width=3)
        draw.line((x,y-s,x,y+s),fill=violet,width=3)
        draw.ellipse((x-5,y-5,x+5,y+5),fill=lilac)
    draw.rounded_rectangle((140,56,W-140,124),radius=9,
        fill=(10,4,25,219),outline=(184,129,220,245),width=2)
    center(draw,91,"P P W   /   L E G E N D S",font("sans",30),silver)
    # Personal iconography: hourglass/cemetery spire plus purple halo.
    draw.arc((W//2-64,144,W//2+64,272),170,370,fill=lilac,width=6)
    draw.line((W//2,163,W//2,252),fill=silver,width=6)
    draw.line((W//2-33,193,W//2+33,193),fill=lilac,width=5)
    draw.ellipse((W//2-7,153,W//2+7,167),fill=silver)
    # Controlled dark title plate over bottom of genuine original photograph.
    draw.rounded_rectangle((69,1034,W-69,1347),radius=13,
        fill=(9,4,24,207),outline=(191,146,222,225),width=3)
    draw.line((105,1081,W-105,1081),fill=violet,width=2)
    center(draw,1057,"T H E   P H E N O M",font("sans",24),lilac)
    center(draw,1159,"THE UNDERTAKER",font("serif",71),silver,2)
    draw.line((136,1222,W-136,1222),fill=violet,width=2)
    center(draw,1264,"I M M O R T A L",font("serif",43),lilac)
    center(draw,1319,"TOMBSTONE PILEDRIVER  •  THE DEADMAN",font("sans",17),muted)
    # Attribution lives on the graphic AND in the adjacent in-game source link.
    center(draw,1381,"001  /  IMMORTAL COLLECTION  /  ONE WORLD, ONE ARRIVAL",
           font("sans",17),silver)
    center(draw,1411,"PHOTO © STEVE WRIGHT JR.  ·  CC BY 2.0  ·  CROPPED",
           font("small",14),muted)
    DEST.parent.mkdir(parents=True,exist_ok=True)
    art.convert("RGB").save(DEST,"WEBP",quality=91,method=6)
    print("Wrote",DEST,DEST.stat().st_size,"bytes")

if __name__=="__main__":
    render()
