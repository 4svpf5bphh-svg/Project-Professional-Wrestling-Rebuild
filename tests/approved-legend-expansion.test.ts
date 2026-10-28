import test from "node:test";
import assert from "node:assert/strict";
import {APPROVED_LEGEND_EXPANSION,EXCLUDED_LEGENDS}
 from "../src/domain/approved-legend-expansion.js";
import {LEGENDS_CATALOGUE} from "../src/domain/legends-catalogue.js";
import {APPROVED_LEGEND_MILESTONES}
 from "../src/domain/approved-legend-milestones.js";
const key=(v:string)=>v.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g,"");
test("approved expansion has 81 genuinely new unlocks, the agreed tiers and no duplicate personalities",()=>{
 const original=LEGENDS_CATALOGUE.slice(0,48);
 assert.equal(LEGENDS_CATALOGUE.length,129);
 assert.equal(APPROVED_LEGEND_EXPANSION.length,81);
 const tierCounts=Object.fromEntries(["CULT","LEGEND","ICON","IMMORTAL"].map(t=>
  [t,original.filter(x=>x.tier===t).length+
   APPROVED_LEGEND_EXPANSION.filter(x=>x.tier===t).length]));
 assert.deepEqual(tierCounts,{CULT:20,LEGEND:57,ICON:34,IMMORTAL:18});
 const women=APPROVED_LEGEND_EXPANSION.filter(x=>x.division==="WOMEN");
 assert.equal(women.length,12);
 const teams=APPROVED_LEGEND_EXPANSION.filter(x=>x.members);
 assert.equal(teams.length,11);
 assert.ok(teams.every(t=>t.members!.length>=2&&t.members!.length<=3));
 const ids=new Set(original.map(x=>key(x.name)));
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

test("all 81 new Legends have a single planning-only certified achievement with staggered thresholds",()=>{
 assert.equal(APPROVED_LEGEND_MILESTONES.length,81);
 assert.equal(new Set(APPROVED_LEGEND_MILESTONES.map(x=>x.name)).size,81);
 const actual=new Set(APPROVED_LEGEND_EXPANSION.map(x=>x.name));
 assert.deepEqual(new Set(APPROVED_LEGEND_MILESTONES.map(x=>x.name)),actual);
 const original=LEGENDS_CATALOGUE.slice(0,48);
 const metrics=new Set(original.map(x=>x.metric).filter(Boolean));
 const milestones=new Set(
  original.filter(x=>x.metric!==null&&x.target!==null)
   .map(x=>x.metric+":"+x.target));
 for(const item of APPROVED_LEGEND_MILESTONES){
  assert.ok(metrics.has(item.metric),"Unsupported fact metric for "+item.name);
  assert.ok(Number.isSafeInteger(item.target)&&item.target>=1&&item.target<=500);
  const milestoneKey=item.metric+":"+item.target;
  assert.ok(!milestones.has(milestoneKey),
   "Shared threshold would bundle new Legends: "+item.name+" "+milestoneKey);
  milestones.add(milestoneKey);
 }
 const teams=APPROVED_LEGEND_EXPANSION.filter(x=>x.members);
 for(const team of teams){
  const m=APPROVED_LEGEND_MILESTONES.find(x=>x.name===team.name)!;
  assert.ok(["TAG_CLASSICS","TAG_MASTERPIECES"].includes(m.metric),
   "A team must be revealed by certified team evidence: "+team.name);
 }
 const women=APPROVED_LEGEND_EXPANSION.filter(x=>x.division==="WOMEN");
 for(const wrestler of women){
  const m=APPROVED_LEGEND_MILESTONES.find(x=>x.name===wrestler.name)!;
  assert.ok(m.metric.startsWith("WOMENS_")||m.metric==="HOT_ANGLES",
   "Women's Legends require relevant wrestling or creative evidence");
 }
 // The reviewed additions are present once in the active catalogue.
 assert.equal(LEGENDS_CATALOGUE.length,129);
 assert.ok(APPROVED_LEGEND_EXPANSION.every(x=>LEGENDS_CATALOGUE.slice(48).some(
  y=>key(x.name)===key(y.name))));
});
