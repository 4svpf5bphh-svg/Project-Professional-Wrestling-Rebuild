import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {APPROVED_LEGEND_EXPANSION,EXCLUDED_LEGENDS} from "../src/domain/approved-legend-expansion.js";
import {LEGENDS_CATALOGUE} from "../src/domain/legends-catalogue.js";

type IntakeEntry={position:number;approvedChecklistRow:number;subject:string;unlock:string;
 tier:string;role:string;sha256:string;width:number;height:number;
 lowResolutionReview:boolean;cardAsset:string|null;portraitAsset:string|null;
 verification:string};
type Intake={status:string;totalPhotos:number;approvedUnlocks:number;
 plannedNewCards:number;plannedNewPortraits:number;existingActiveCards:number;
 plannedTotalCards:number;rightsStatus:string;positions:IntakeEntry[]};
const intake=JSON.parse(readFileSync(new URL("../data/owner-legend-photo-intake.json",import.meta.url),"utf8")) as Intake;
const sort=(a:readonly string[])=>[...a].sort();
const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

test("owner photo intake contains all 104 unique source slots and preserves archive provenance",()=>{
 assert.equal(intake.totalPhotos,104);
 assert.equal(intake.positions.length,104);
 assert.deepEqual(intake.positions.map(x=>x.position),Array.from({length:104},(_,i)=>i+1));
 assert.equal(new Set(intake.positions.map(x=>x.sha256)).size,104);
 assert.equal(new Set(intake.positions.map(x=>x.subject)).size,104);
 assert.ok(intake.positions.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
 assert.ok(intake.positions.every(x=>x.width>0&&x.height>0));
 assert.ok(intake.positions.every(x=>x.lowResolutionReview===(Math.min(x.width,x.height)<500)));
 assert.ok(intake.positions.every(x=>x.verification==="POSITION_MAPPED_OWNER_LIKENESS_REVIEW_PENDING"));
 assert.ok(intake.status.includes("NOT_LIKENESS_VERIFIED"));
 assert.ok(intake.rightsStatus.includes("NOT_CLEARED"));
});

test("all 81 approved unlocks have one card and 93 individually mapped portrait images",()=>{
 assert.equal(intake.plannedNewCards,81);
 assert.equal(intake.plannedNewPortraits,93);
 assert.equal(intake.existingActiveCards,48);
 assert.equal(intake.plannedTotalCards,129);
 const cards=intake.positions.filter(x=>x.cardAsset!==null);
 const portraits=intake.positions.filter(x=>x.portraitAsset!==null);
 assert.equal(cards.length,81);
 assert.equal(portraits.length,93);
 assert.equal(new Set(cards.map(x=>x.cardAsset)).size,81);
 assert.equal(new Set(portraits.map(x=>x.portraitAsset)).size,93);
 assert.deepEqual(sort(cards.map(x=>x.unlock)),sort(APPROVED_LEGEND_EXPANSION.map(x=>x.name)));
 const subjects=sort(portraits.map(x=>x.subject));
 assert.deepEqual(subjects,sort(APPROVED_LEGEND_EXPANSION.flatMap(x=>x.members??[x.name])));
 for(const entry of APPROVED_LEGEND_EXPANSION){
  const card=cards.find(x=>x.unlock===entry.name);
  assert.ok(card,"Missing card source for "+entry.name);
  assert.equal(card.tier,entry.tier);
  assert.equal(card.cardAsset,"/assets/legends/"+slug(entry.name)+"-"+entry.tier.toLowerCase()+"-card.webp");
  for(const name of entry.members??[entry.name]){
   const portrait=portraits.find(x=>x.subject===name);
   assert.ok(portrait,"Missing roster portrait source for "+name);
   assert.equal(portrait.unlock,entry.name);
   assert.equal(portrait.portraitAsset,"/assets/legends/"+slug(name)+"-portrait.webp");
  }
 }
 assert.equal(APPROVED_LEGEND_EXPANSION.filter(x=>x.members).length,11);
 assert.equal(APPROVED_LEGEND_EXPANSION.reduce((n,x)=>n+(x.members?.length??1),0),93);
});

test("owner-declared late inserts and removed nominees cannot shift the 104 image mapping",()=>{
 const find=(name:string)=>intake.positions.find(x=>x.subject===name);
 assert.equal(find("Stan Lane")?.position,81);
 assert.equal(find("The British Bulldogs")?.position,82);
 assert.equal(find("APA")?.position,91);
 assert.equal(find("The Natural Disasters")?.position,97);
 assert.equal(find("The Fabulous Freebirds")?.position,100);
 assert.equal(find("Michael Hayes")?.position,101);
 assert.equal(find("Terry Gordy")?.position,102);
 assert.equal(find("Buddy Roberts")?.position,103);
 assert.equal(find("Terry Funk")?.position,104);
 for(const x of ["Tiger Mask I","Big Daddy"]){
  assert.equal(find(x),undefined);
  assert.ok(EXCLUDED_LEGENDS.includes(x));
 }
 // No PREVIEW or OWNER photo mapping silently activates a new wrestler.
 assert.equal(LEGENDS_CATALOGUE.length,48);
 assert.ok(APPROVED_LEGEND_EXPANSION.every(x=>!LEGENDS_CATALOGUE.some(y=>y.name===x.name)));
});
