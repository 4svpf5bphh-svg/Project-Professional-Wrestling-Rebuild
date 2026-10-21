import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {eventArtworkSource} from "../src/ui/event-artwork.js";
import {championshipArtworkSource} from "../src/ui/championship-artwork.js";
import {defaults} from "../src/domain/show-calendar.js";

test("every shipped event asset is branded original SVG markup and all configured broadcasts resolve",()=>{
 const folder="apps/web/public/events";
 const assets=readdirSync(folder).filter(p=>p.endsWith(".svg"));
 assert.equal(assets.length,66);
 for(const file of assets){
  const content=readFileSync(folder+"/"+file,"utf8");
  assert.match(content,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(content,/<title>/);
  assert.match(content,/<\/svg>\s*$/);
  assert.ok(content.length>2500,file+" lacks an actual illustrated composition");
 }
 for(const brand of ["WWE","AEW","NJPW","NXT","ROH","TNA","STARDOM","CMLL",
  "Crown Wrestling","Revolution Pro","Frontier Wrestling","Atlas Wrestling","Titan Combat"]){
  for(const show of defaults(brand,1,4)){
   const asset=eventArtworkSource(show.name,brand,show.eventType==="MAJOR");
   assert.ok(assets.includes(asset.split("/").pop()!),brand+" "+show.name+" "+asset);
  }
 }
});
test("all championship families have a distinct branded physical plate illustration",()=>{
 const brands=["wwe","aew","njpw","nxt","roh","tna","stardom","cmll",
  "crown-wrestling","revolution-pro","frontier-wrestling","atlas-wrestling","titan-combat","custom"];
 const folders="apps/web/public/belts";
 const all=readdirSync(folders).filter(n=>n.endsWith(".svg"));
 assert.equal(all.length,56);
 for(const brand of brands){
  const paths=["world","women","tag","secondary"].map(type=>folders+"/"+brand+"-"+type+".svg");
  const illustrations=paths.map(p=>readFileSync(p,"utf8"));
  assert.equal(new Set(illustrations).size,4,brand+" must have four unique plate constructions");
  assert.ok(illustrations.every(s=>s.includes("<title>")&&s.includes("</svg>")));
 }
 assert.equal(championshipArtworkSource("World Championship","SINGLES","WWE"),"/belts/wwe-world.svg");
 assert.equal(championshipArtworkSource("Women's Championship","SINGLES","WWE"),"/belts/wwe-women.svg");
 assert.equal(championshipArtworkSource("World Tag Team Championship","TAG","WWE"),"/belts/wwe-tag.svg");
 assert.equal(championshipArtworkSource("Intercontinental Championship","SINGLES","WWE"),"/belts/wwe-secondary.svg");
});
