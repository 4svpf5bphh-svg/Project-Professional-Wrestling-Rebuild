import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {APPROVED_LEGEND_EXPANSION} from "../src/domain/approved-legend-expansion.js";
import {LEGENDS_CATALOGUE} from "../src/domain/legends-catalogue.js";
import {findPlannedLegendArtwork,PLANNED_LEGEND_ARTWORK}
 from "../src/domain/planned-legend-artwork.js";

test("planned art registry preserves one source-backed card across reveal and collectible album",()=>{
 const contract=JSON.parse(readFileSync(new URL("../data/legend-card-layout-contract.json",import.meta.url),"utf8"));
 assert.equal(LEGENDS_CATALOGUE.length,48);
 assert.equal(PLANNED_LEGEND_ARTWORK.length,81);
 assert.equal(new Set(PLANNED_LEGEND_ARTWORK.map(x=>x.id)).size,81);
 assert.deepEqual(PLANNED_LEGEND_ARTWORK.map(x=>x.name),
  APPROVED_LEGEND_EXPANSION.map(x=>x.name));
 assert.equal(PLANNED_LEGEND_ARTWORK.filter(x=>x.team).length,11);
 assert.equal(PLANNED_LEGEND_ARTWORK.reduce((sum,x)=>sum+x.members.length,0),93);
 for(const card of PLANNED_LEGEND_ARTWORK){
  assert.equal(card.revealAsset,card.cardAsset);
  assert.equal(card.albumAsset,card.cardAsset);
  assert.equal(card.activation,"BLOCKED_PENDING_PHOTO_AND_ARTWORK_REVIEW");
  assert.equal(card.cardLayoutVersion,contract.version);
  assert.equal(contract.badgePlacement,"IN_FOOTER_BELOW_PHOTO_ABOVE_NAMEPLATE");
  assert.match(card.cardAsset,/^\/assets\/legends\/[a-z0-9-]+-(cult|legend|icon|immortal)-card\.webp$/);
  assert.equal(findPlannedLegendArtwork(card.id),card);
  assert.equal(card.team,card.members.length>1);
  for(const [i,m] of card.members.entries()){
   assert.equal(m.personId,"legend:"+card.id+":"+i);
   assert.match(m.portraitAsset,/^\/assets\/legends\/[a-z0-9-]+-portrait\.webp$/);
  }
 }
 assert.equal(new Set(PLANNED_LEGEND_ARTWORK.flatMap(x=>x.members.map(p=>p.personId))).size,93);
});
