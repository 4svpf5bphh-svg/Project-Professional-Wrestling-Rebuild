import test from "node:test";
import assert from "node:assert/strict";
import {LEGENDS_CATALOGUE,LIVE_LEGENDS,LEGEND_TIER_PRICES,findLegend,legendUnlockEligible}
 from "../src/domain/legends-catalogue.js";
import {validateKpAction} from "../src/db/kayfabe-points.js";
import {LEGEND_CARD_PHOTO_CREDITS} from "../src/content/legend-card-photo-credits.js";
import {computeCertifiedLegendMatchMetrics} from "../src/db/legends-settlement.js";

const match=(match_id:string,stars:number|null,cast:string[],overrides:{
 booking_class?:string;last_position?:number;position?:number;family?:string;
 stipulation?:string;finish?:string;crowd?:number
}={})=>({
 match_id,position:overrides.position??1,last_position:overrides.last_position??1,
 rating_stars:stars===null?null:String(stars),
 booking_class:overrides.booking_class??"REGULAR",
 actual_finish:overrides.finish??"CLEAN_PIN",crowd_response:overrides.crowd??75,
 payload:{stipulation:overrides.stipulation??"STANDARD",
  participants:cast.map(personId=>({personId,contractId:"contract:"+personId}))},
 evidence_json:{booking:{family:overrides.family??"INDIVIDUAL"}}
});
test("four curated tiers, real team and women's legends, authentic named cards not fabricated",()=>{
 const original=LEGENDS_CATALOGUE.slice(0,48);
 assert.equal(LEGENDS_CATALOGUE.length,129);
 assert.deepEqual(new Set(LEGENDS_CATALOGUE.map(x=>x.id)).size,129);
 assert.deepEqual(new Set(LEGENDS_CATALOGUE.map(x=>x.name.toLowerCase())).size,129);
 assert.deepEqual([...new Set(LEGENDS_CATALOGUE.map(x=>x.tier))].sort(),
  ["CULT","ICON","IMMORTAL","LEGEND"]);
 assert.ok(LEGENDS_CATALOGUE.filter(x=>x.division==="WOMEN").length>=5);
 assert.equal(LIVE_LEGENDS.length,129);
 assert.equal(LIVE_LEGENDS.every(x=>x.hints?.length===2),true);
 assert.equal(findLegend("road-warriors")?.roster.length,2);
 assert.equal(findLegend("road-warriors")?.roster[0]?.name,"Road Warrior Hawk");
 assert.equal(LIVE_LEGENDS.every(x=>x.metric&&x.target&&x.roster.length),true);
 assert.equal(findLegend("undertaker")?.cardAsset,
  "/assets/legends/undertaker-immortal-card.webp");
 assert.equal(original.filter(x=>x.id!=="undertaker").every(x=>x.cardAsset===null),true);
 assert.equal(LIVE_LEGENDS.every(x=>x.roster.length>=1&&x.roster.length<=4),true);
 assert.equal(LIVE_LEGENDS.every(x=>x.clue!=="A chapter of wrestling history awaits its moment."),true);
 assert.ok(new Set(LIVE_LEGENDS.map(x=>x.metric)).size>=18);
 assert.equal(LEGENDS_CATALOGUE.filter(x=>x.status==="PLANNED").length,0);
 assert.equal(Object.keys(LEGEND_CARD_PHOTO_CREDITS).length,48);
 assert.equal(LEGENDS_CATALOGUE.filter(x=>x.cardAsset!==null).length,82);
 assert.ok(original.filter(x=>x.cardAsset!==null).every(x=>
  LEGEND_CARD_PHOTO_CREDITS[x.id]?.sourcePage.startsWith("https://commons.wikimedia.org/wiki/File:")));
 assert.ok(Object.values(LEGEND_CARD_PHOTO_CREDITS).every(x=>
  /^(CC BY(?:-SA)? [234]\.0|CC0|Unverified - hobby draft)$/.test(x.license)&&
  x.author.trim().length>2&&x.sourcePage.startsWith("https://")));
 for(const id of ["mr-perfect","road-warriors","el-santo"]){
  assert.equal(LEGEND_CARD_PHOTO_CREDITS[id].license,"Unverified - hobby draft");
  assert.equal(findLegend(id)?.cardAsset,null);
 }
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
 assert.equal(legendUnlockEligible(findLegend("bret-hart")!,{MASTERPIECES:49}),false);
 assert.equal(legendUnlockEligible(findLegend("bret-hart")!,{MASTERPIECES:50}),true);
 assert.equal(legendUnlockEligible(findLegend("sabu")!,{HARDCORE_CLASSICS:7}),false);
 assert.equal(legendUnlockEligible(findLegend("sabu")!,{HARDCORE_CLASSICS:8}),true);
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
 assert.deepEqual({CLASSICS:metrics.CLASSICS,MASTERPIECES:metrics.MASTERPIECES,
  WOMENS_CLASSICS:metrics.WOMENS_CLASSICS,TAG_CLASSICS:metrics.TAG_CLASSICS,
  PREMIUM_MAIN_EVENTS:metrics.PREMIUM_MAIN_EVENTS},{
  CLASSICS:3,MASTERPIECES:2,WOMENS_CLASSICS:2,TAG_CLASSICS:1,PREMIUM_MAIN_EVENTS:1
 });
 assert.equal(metrics.WOMENS_MASTERPIECES,1);
 assert.equal(metrics.PREMIUM_CLASSICS,2);
 assert.equal(metrics.WEEKLY_CLASSICS,2);
 assert.equal(metrics.MAIN_EVENT_CLASSICS,2);
 assert.equal(metrics.FIVE_STARS,1);
 assert.equal(metrics.HARDCORE_MATCHES,0);
});

test("certified stipulations, real submissions and crowd responses power distinct Legends challenges",()=>{
 const divisions=new Map([["a","MEN"],["b","MEN"],["w","WOMEN"],["x","WOMEN"]]);
 const values=computeCertifiedLegendMatchMetrics([
  match("hardcore",4.25,["a","b"],{stipulation:"HARDCORE",finish:"CLEAN_PIN",crowd:91}),
  match("submission",3.5,["a","b"],{stipulation:"SUBMISSION",finish:"SUBMISSION",crowd:96}),
  match("ladder",4.8,["w","x"],{stipulation:"LADDER",finish:"RETRIEVAL",crowd:94,family:"TEAMS"}),
  match("incomplete",null,["a","b"],{stipulation:"HARDCORE",finish:"SUBMISSION",crowd:99})
 ],divisions);
 assert.equal(values.HARDCORE_MATCHES,2);
 assert.equal(values.HARDCORE_CLASSICS,2);
 assert.equal(values.STIPULATED_CLASSICS,2);
 assert.equal(values.SUBMISSIONS,1);
 assert.equal(values.BIG_REACTIONS,3);
 assert.equal(values.WOMENS_MASTERPIECES,1);
 assert.equal(values.TAG_MASTERPIECES,1);
});
