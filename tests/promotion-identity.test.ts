import {test} from "node:test";import assert from "node:assert/strict";
import {promotionBrand,eventDesign,originalFictionalPromotionBrands}
 from "../src/ui/broadcast-identity.js";
import {readFileSync} from "node:fs";
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

import {promotionLogoKeys,realPromotionLogoKeys,fictionalPromotionLogoSources,promotionLogoSource,createPromotionLogo}
 from "../src/ui/promotion-logo.js";
test("every original real promotion has a pinned authentic logo source",()=>{
 assert.equal(realPromotionLogoKeys.length,8);
 for(const key of realPromotionLogoKeys){
  const src=promotionLogoSource(key);
  assert.ok(src&&src.startsWith("https://"),key);
  assert.ok(src?.includes(key==="njpw"?"New_Japan_Pro_Wrestling_Logo_2":
   key==="cmll"?"8wi2qv1575807644":"Special:FilePath"),key);
 }
 for(const key of ["wwe","aew","roh","tna","nxt","stardom"]){
  assert.ok(promotionLogoSource(key)?.endsWith(".svg"),"Keep the original full-resolution vector: "+key);
  assert.equal(promotionLogoSource(key,80),promotionLogoSource(key,320),"Vector image must not downgrade into 80-pixel thumbnail");
 }
 assert.equal(promotionLogoSource("custom"),null);
 assert.equal(promotionLogoSource("not-a-promotion"),null);
});
test("logo factory requires only local information, not a server or browser fetch",()=>{
 const previous=(globalThis as {document?:unknown}).document;
 const factoryCalls:{tag:string}[]=[];
 try{
  (globalThis as {document?:unknown}).document={createElement:(tag:string)=>{
   factoryCalls.push({tag});
   return {className:"",src:"",alt:"",loading:"",decoding:"",dataset:{},title:"",width:0,height:0};
  }};
  for(const key of promotionLogoKeys){
   const logo=createPromotionLogo(key);
   assert.ok(logo?.src.startsWith("https://")||logo?.src.startsWith("/branding/"),key);
   assert.equal(logo?.dataset.promotionLogo,key);
  }
  assert.equal(createPromotionLogo("custom"),null);
  assert.equal(factoryCalls.length,13);
 }finally{(globalThis as {document?:unknown}).document=previous;}
});

test("all five exact original Genesis fictional companies have their own local artwork",()=>{
 assert.equal(Object.keys(originalFictionalPromotionBrands).length,5);
 assert.equal(Object.keys(fictionalPromotionLogoSources).length,5);
 assert.equal(promotionLogoKeys.length,13);
 for(const [name,key] of Object.entries(originalFictionalPromotionBrands)){
  assert.equal(promotionBrand(name).key,key);
  assert.equal(promotionLogoSource(key),"/branding/"+key+".svg");
  assert.equal(promotionLogoSource(key,96),"/branding/"+key+"-emblem.svg");
  const emblem=readFileSync("apps/web/public/branding/"+key+"-emblem.svg","utf8");
  assert.match(emblem,/viewBox="0 0 240 240"/);
  assert.ok(emblem.includes(name),"compact mark should belong to the correct original promotion");
  const raw=readFileSync("apps/web/public/branding/"+key+".svg","utf8");
  assert.match(raw,/^<svg /);
  assert.match(raw,/<title id="title">/);
  assert.ok(raw.includes(name),"logo must carry the actual company name");
  assert.match(raw,/<\/svg>\s*$/);
 }
 assert.equal(promotionBrand("Crown Wrestling Unlimited").key,"custom",
  "a promotion rebrand must not retain the previous logo");
 assert.equal(promotionBrand("Revolution Pro UK").key,"custom");
 assert.equal(promotionLogoSource("custom"),null,
  "unspecified player-named companies retain generic safe fallback");
});
