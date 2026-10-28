import test from "node:test";
import assert from "node:assert/strict";
import {APPROVED_LEGEND_EXPANSION,EXCLUDED_LEGENDS}
 from "../src/domain/approved-legend-expansion.js";
import {LEGENDS_CATALOGUE} from "../src/domain/legends-catalogue.js";
const key=(v:string)=>v.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g,"");
test("approved expansion has 83 genuinely new unlocks, the agreed tiers and no duplicate personalities",()=>{
 assert.equal(LEGENDS_CATALOGUE.length,48);
 assert.equal(APPROVED_LEGEND_EXPANSION.length,83);
 const tierCounts=Object.fromEntries(["CULT","LEGEND","ICON","IMMORTAL"].map(t=>
  [t,LEGENDS_CATALOGUE.filter(x=>x.tier===t).length+
   APPROVED_LEGEND_EXPANSION.filter(x=>x.tier===t).length]));
 assert.deepEqual(tierCounts,{CULT:20,LEGEND:57,ICON:36,IMMORTAL:18});
 const women=APPROVED_LEGEND_EXPANSION.filter(x=>x.division==="WOMEN");
 assert.equal(women.length,12);
 const teams=APPROVED_LEGEND_EXPANSION.filter(x=>x.members);
 assert.equal(teams.length,11);
 assert.ok(teams.every(t=>t.members!.length>=2&&t.members!.length<=3));
 const ids=new Set(LEGENDS_CATALOGUE.map(x=>key(x.name)));
 const members=new Set<string>();
 for(const entry of APPROVED_LEGEND_EXPANSION){
  const name=key(entry.name);
  assert.ok(!ids.has(name),"duplicate active or proposed legend "+entry.name);
  ids.add(name);
  for(const member of entry.members??[entry.name]){
   const id=key(member);
   assert.ok(!members.has(id),"wrestler appears twice "+member);
   members.add(id);
  }
 }
 for(const excluded of EXCLUDED_LEGENDS){
  assert.ok(!ids.has(key(excluded)),"excluded legend returned "+excluded);
  assert.ok(!members.has(key(excluded)),"excluded wrestler returned "+excluded);
 }
 for(const existingWorldTalent of ["The Young Bucks","Matthew Jackson","Nicholas Jackson"]){
  assert.ok(!ids.has(key(existingWorldTalent)));
  assert.ok(!members.has(key(existingWorldTalent)));
 }
 assert.ok(APPROVED_LEGEND_EXPANSION.some(x=>x.name==="Doink the Clown"&&x.tier==="CULT"));
 assert.ok(APPROVED_LEGEND_EXPANSION.some(x=>x.name==="Brodie Lee"));
 assert.ok(APPROVED_LEGEND_EXPANSION.some(x=>x.name==="PAC"));
});
