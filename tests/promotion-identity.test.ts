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

import {promotionLogoKeys,promotionLogoSource,createPromotionLogo}
 from "../src/ui/promotion-logo.js";
test("every original real promotion has a pinned authentic logo source",()=>{
 assert.equal(promotionLogoKeys.length,8);
 for(const key of promotionLogoKeys){
  const src=promotionLogoSource(key);
  assert.ok(src&&src.startsWith("https://"),key);
  assert.ok(src?.includes(key==="njpw"?"New_Japan_Pro_Wrestling_Logo_2":
   key==="cmll"?"8wi2qv1575807644":"Special:FilePath"),key);
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
   assert.ok(logo?.src.startsWith("https://"),key);
   assert.equal(logo?.dataset.promotionLogo,key);
  }
  assert.equal(createPromotionLogo("custom"),null);
  assert.equal(factoryCalls.length,8);
 }finally{(globalThis as {document?:unknown}).document=previous;}
});
