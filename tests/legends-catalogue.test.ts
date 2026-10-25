import test from "node:test";
import assert from "node:assert/strict";
import {LEGENDS_CATALOGUE,LIVE_LEGENDS,LEGEND_TIER_PRICES,findLegend,legendUnlockEligible}
 from "../src/domain/legends-catalogue.js";
import {validateKpAction} from "../src/db/kayfabe-points.js";
import {computeCertifiedLegendMatchMetrics} from "../src/db/legends-settlement.js";

const match=(match_id:string,stars:number|null,cast:string[],overrides:{
 booking_class?:string;last_position?:number;position?:number;family?:string
}={})=>({
 match_id,position:overrides.position??1,last_position:overrides.last_position??1,
 rating_stars:stars===null?null:String(stars),
 booking_class:overrides.booking_class??"REGULAR",
 payload:{participants:cast.map(personId=>({personId,contractId:"contract:"+personId}))},
 evidence_json:{booking:{family:overrides.family??"INDIVIDUAL"}}
});
test("four curated tiers, real team and women's legends, authentic named cards not fabricated",()=>{
 assert.equal(LEGENDS_CATALOGUE.length,48);
 assert.deepEqual(new Set(LEGENDS_CATALOGUE.map(x=>x.id)).size,48);
 assert.deepEqual(new Set(LEGENDS_CATALOGUE.map(x=>x.name.toLowerCase())).size,48);
 assert.deepEqual([...new Set(LEGENDS_CATALOGUE.map(x=>x.tier))].sort(),
  ["CULT","ICON","IMMORTAL","LEGEND"]);
 assert.ok(LEGENDS_CATALOGUE.filter(x=>x.division==="WOMEN").length>=5);
 assert.equal(LIVE_LEGENDS.length,9);
 assert.equal(findLegend("road-warriors")?.roster.length,2);
 assert.equal(findLegend("road-warriors")?.roster[0]?.name,"Road Warrior Hawk");
 assert.equal(LIVE_LEGENDS.every(x=>x.metric&&x.target&&x.roster.length&&x.cardAsset===null),true);
 assert.equal(LEGENDS_CATALOGUE.filter(x=>x.status==="PLANNED")
  .every(x=>x.metric===null&&x.target===null),true);
 assert.ok(LEGEND_TIER_PRICES.IMMORTAL>LEGEND_TIER_PRICES.ICON);
 assert.ok(LEGEND_TIER_PRICES.CULT>500);
});
test("real achievement evidence, never speculative or tier-based match advantage",()=>{
 const eddie=findLegend("eddie-guerrero")!;
 assert.equal(legendUnlockEligible(eddie,{DIRTY_FINISHES:11}),false);
 assert.equal(legendUnlockEligible(eddie,{DIRTY_FINISHES:12}),true);
 const trish=findLegend("trish-stratus")!;
 assert.equal(legendUnlockEligible(trish,{CLASSICS:900,WOMENS_CLASSICS:9}),false);
 assert.equal(legendUnlockEligible(trish,{WOMENS_CLASSICS:10}),true);
 assert.equal(legendUnlockEligible(findLegend("bret-hart")!,{MASTERPIECES:1000}),false);
 for(const wrestler of LIVE_LEGENDS.flatMap(x=>x.roster)){
  assert.ok(wrestler.ring>=0&&wrestler.ring<=100);
  assert.ok(wrestler.age>=20&&wrestler.age<=45);
 }
 assert.equal(validateKpAction({kind:"COLLECT_LEGEND",legendId:"sting",
  requestId:"r1"}).kind,"COLLECT_LEGEND");
 assert.throws(()=>validateKpAction({kind:"COLLECT_LEGEND",legendId:"invented",
  requestId:"r1"}),/Unknown/);
});
test("verified ratings and divisions never count bogus or incomplete accomplishments",()=>{
 const divisions=new Map([["a","WOMEN"],["b","WOMEN"],
  ["c","MEN"],["d","MEN"]]);
 const metrics=computeCertifiedLegendMatchMetrics([
  match("a",4.8,["a","b"],{booking_class:"PREMIUM"}),
  match("b",4.3,["c","d"],{family:"TEAMS",booking_class:"PREMIUM",
   position:1,last_position:3}),
  match("c",4,["a","b"]),
  match("d",5,["a","c"],{booking_class:"REGULAR"}),
  match("e",null,["c","d"]),
  match("f",5,["c"])
 ],divisions);
 assert.deepEqual(metrics,{
  CLASSICS:3,MASTERPIECES:2,WOMENS_CLASSICS:2,TAG_CLASSICS:1,PREMIUM_MAIN_EVENTS:1
 });
});
