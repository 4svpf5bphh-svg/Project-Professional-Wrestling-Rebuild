import {test} from "node:test";import assert from "node:assert/strict";
import {promotionBrand,eventDesign} from "../src/ui/broadcast-identity.js";
test("recognises the eight real world companies without creating identities for custom promotions",()=>{
 for(const [name,key] of Object.entries({WWE:"wwe",AEW:"aew",NJPW:"njpw",ROH:"roh",
  TNA:"tna",NXT:"nxt",STARDOM:"stardom",CMLL:"cmll"}))
  assert.equal(promotionBrand(name).key,key);
 assert.equal(promotionBrand("My Own Company").key,"custom");
});
test("show identities remain stable across seasonal occurrences and brands",()=>{
 assert.equal(eventDesign("WrestleMania","WWE",true).motif,"wrestlemania");
 assert.equal(eventDesign("AEW Dynamite","AEW",false).motif,"dynamite");
 assert.equal(eventDesign("My Original Event","PPW",true).motif,"signature");
});

import {defaults} from "../src/domain/show-calendar.js";
test("every original WWE/AEW annual event has its own broadcast palette, not a generic signature",()=>{
 const all=[...defaults("WWE",1,4),...defaults("AEW",1,4)]
  .filter(x=>x.eventType==="MAJOR");
 const items=all.map(x=>eventDesign(x.name,x.name==="All In"?"AEW":"WWE",true));
 assert.ok(all.length>=20);
 assert.ok(items.every(x=>x.motif!=="signature"));
 const unknown=all.filter(x=>!items.some(y=>y.motif));
 assert.equal(unknown.length,0);
});
