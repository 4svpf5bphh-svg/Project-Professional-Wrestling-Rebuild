import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

type Rect=[number,number,number,number];
type Contract={version:string;reference:string;referenceExistingCardCount:number;
 width:number;height:number;photo:Rect;header:Rect;footer:Rect;
 badge:Rect;nameplate:Rect;sharedCardAcross:string[];
 tierPalette:Record<string,string>;badgePlacement:string;activation:string;};
const design=JSON.parse(readFileSync(new URL("../data/legend-card-layout-contract.json",import.meta.url),"utf8")) as Contract;
const legacy=readFileSync(new URL("../scripts/build_curated_legend_cards.py",import.meta.url),"utf8");

test("new 81-card design reuses frame coordinates and palette from the 48 delivered cards",()=>{
 assert.equal(design.referenceExistingCardCount,48);
 assert.equal(design.reference,"scripts/build_curated_legend_cards.py");
 assert.deepEqual([design.width,design.height],[960,1440]);
 assert.deepEqual(design.photo,[53,162,907,1063]);
 assert.deepEqual(design.header,[54,46,906,143]);
 assert.deepEqual(design.footer,[53,1081,907,1370]);
 assert.match(legacy,/photo_box=\(53,162,W-53,1063\)/);
 assert.match(legacy,/\(54,46,W-54,143\)/);
 assert.match(legacy,/\(53,1081,W-53,1370\)/);
 assert.deepEqual(design.tierPalette,{
  CULT:"#7CA6CA",LEGEND:"#F1BB5A",ICON:"#58D3F6",IMMORTAL:"#CF94FA"});
});
test("rarity badge is ALWAYS below photo and immediately ABOVE nameplate",()=>{
 const p=design.photo,b=design.badge,n=design.nameplate;
 assert.equal(design.badgePlacement,"IN_FOOTER_BELOW_PHOTO_ABOVE_NAMEPLATE");
 assert.ok(b[1]>p[3],"badge starts inside photograph: would cover wrestler");
 assert.ok(b[3]<n[1],"badge enters nameplate");
 assert.ok(b[0]>=p[0]&&b[2]<=p[2],"badge extends outside safe artwork window");
 assert.ok(b[1]-p[3]>=16,"badge needs breathing room below photo");
 assert.ok(n[1]-b[3]>=12,"badge/nameplate separation must remain legible");
 assert.equal(design.version,"LEGACY_48_FRAME_SEPARATE_RARITY_BADGE_V1");
});
test("each collectible uses a single identical card across market/reveal/album",()=>{
 assert.deepEqual(design.sharedCardAcross,["unlockReveal","vault","collectedAlbum"]);
 assert.equal(design.activation,"BLOCKED_PENDING_PHOTO_AND_ARTWORK_REVIEW");
});
