import {test} from "node:test";
import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {LEGEND_PORTRAIT_ASSETS,legendPortraitSource} from "../src/ui/legend-portrait-assets.js";
import {LEGENDS_CATALOGUE} from "../src/domain/legends-catalogue.js";
import {portraitSource} from "../src/ui/wrestler-portrait.js";

test("static Legend photographs follow immutable person IDs across roster transfers",()=>{
 for(const [id,source] of Object.entries(LEGEND_PORTRAIT_ASSETS)){
  assert.match(id,/^legend:[a-z0-9-]+:\d+$/);
  assert.ok(LEGENDS_CATALOGUE.some(x=>x.id===id.split(":")[1]));
  assert.match(source,/^\/assets\/legends\/[a-z0-9-]+-\d+-portrait\.webp$/);
  assert.ok(existsSync("apps/web/public"+source),id+" must reference a real file");
  assert.equal(legendPortraitSource(id),source);
  assert.equal(portraitSource("Changed Ring Name",220,id),source);
 }
 assert.equal(legendPortraitSource("unrelated-id"),null);
 assert.equal(legendPortraitSource("legend:unknown:0"),null);
});
test("a two-person Road Warriors original produces two distinct identities together",()=>{
 const hawk=legendPortraitSource("legend:road-warriors:0");
 const animal=legendPortraitSource("legend:road-warriors:1");
 assert.equal(Boolean(hawk),Boolean(animal),"never register only one team member");
 if(hawk&&animal)assert.notEqual(hawk,animal,"each wrestler needs their own crop");
});

test("48 real-photo cards and 49 wrestler portraits are bundled, without paid activation",()=>{
 assert.equal(LEGENDS_CATALOGUE.length,48);
 assert.equal(Object.keys(LEGEND_PORTRAIT_ASSETS).length,49);
 const files=LEGENDS_CATALOGUE.map(item=>
  "apps/web/public/assets/legends/"+item.id+"-"+item.tier.toLowerCase()+"-card.webp");
 assert.ok(files.every(file=>existsSync(file)),"all real-photo card drafts must exist");
 assert.equal(LEGENDS_CATALOGUE.filter(x=>x.cardAsset!==null).length,1,
  "unreviewed artwork cannot become an automatically purchasable collectible");
});
test("rejected sign and venue snapshots are replaced with individual source citations",()=>{
 const images=JSON.parse(readFileSync("data/legend-approved-photo-sources.json","utf8")).images;
 for(const id of ["taz","william-regal","sabu","stan-hansen"]){
  const entry=images.find((image:{id:string})=>image.id===id);
  assert.equal(entry?.artRevision,1,id+" must force a source-correct replacement");
  assert.match(entry.sourceUrl,/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//);
  assert.ok(entry.previousSource?.sourcePage);
 }
});
