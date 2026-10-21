import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {eventDesign,promotionBrand} from "../src/ui/broadcast-identity.js";
import {beltCategory} from "../src/ui/championship-artwork.js";
test("broadcast show names remain live typography with local event identity",()=>{
 for(const [owner,name] of [["WWE","RAW"],["AEW","Dynamite"],["AEW","All In"],["Crown Wrestling","The Crown Rises"]]){
  const design=eventDesign(name,owner,name==="All In");
  assert.ok(design.brand);assert.ok(design.motif);assert.ok(promotionBrand(owner).mark);
 }
 for(const path of ["src/ui/world-calendar.ts","src/ui/show-planner.ts","src/ui/match-broadcast.ts"])
  assert.doesNotMatch(readFileSync(path,"utf8"),/eventArtworkSource|\/events\//);
});
test("title cards retain real holders and history with distinctive families",()=>{
 assert.equal(beltCategory("World Championship","SINGLES"),"world");
 assert.equal(beltCategory("Women's Championship","SINGLES"),"women");
 assert.equal(beltCategory("World Tag Championship","TAG"),"tag");
 assert.equal(beltCategory("Intercontinental Championship","SINGLES"),"secondary");
 const s=readFileSync("src/ui/championship-desk.ts","utf8");
 assert.doesNotMatch(s,/championshipArtworkSource|ppw-belt-graphic/);
 assert.match(s,/title\.holderName/);assert.match(s,/loadHistory/);
});
test("iPhone crowd flow uses responsive horizontal rows",()=>{
 const s=readFileSync("apps/web/type-led.css","utf8");
 assert.match(s,/\.ppw-crowd-flow-bars\{display:grid/);
 assert.match(s,/grid-template-columns:21px minmax\(0,1fr\)/);
});
