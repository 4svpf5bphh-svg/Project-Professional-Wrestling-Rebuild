import test from "node:test";
import assert from "node:assert/strict";
import {LEGENDS_CATALOGUE,findLegend,type LegendMetric}
 from "../src/domain/legends-catalogue.js";
import {pacedWorldLegendTarget,worldLegendAchievement}
 from "../src/domain/legend-progression.js";
import {planCertifiedLegendReleases,type LegendArrivalRecord}
 from "../src/domain/legend-release-cadence.js";

test("single-World targets reflect the live Week 21 volume, not fresh Worlds",()=>{
 assert.ok(findLegend("jerry-lynn")!.target!>102);
 assert.ok(findLegend("d-lo-brown")!.target!>123);
 assert.equal(findLegend("taz")!.target,90);
 assert.match(findLegend("taz")!.achievement,/90 certified matches ending by submission/);
 assert.equal(findLegend("bruno-sammartino")!.target,52);
 assert.equal(pacedWorldLegendTarget("LONGEST_REIGN",52,"IMMORTAL"),52);
 assert.equal(worldLegendAchievement("LONGEST_REIGN",52),
  "A single uninterrupted championship reign of 52 World weeks");
 assert.ok(LEGENDS_CATALOGUE.every(d=>d.metric&&d.target&&
  d.achievement===worldLegendAchievement(d.metric,d.target)));
 assert.equal(new Set(LEGENDS_CATALOGUE.map(d=>d.metric+":"+d.target)).size,
  LEGENDS_CATALOGUE.length,
  "Whole-World pacing must not bundle multiple Legends on the same receipt");
});

test("World achievements are feasible within one uninterrupted five-season save",()=>{
 // Scenario rates, not a claim about unmeasured real World metrics.
 // CLASSICS 5.1/week and WEEKLY_CLASSICS 6.15/week derive from the
 // observed opening 20 certified weeks of the owner's World.
 const rates:Record<LegendMetric,number>={
  CLASSICS:5.1,WEEKLY_CLASSICS:6.15,SUBMISSIONS:2.8,
  HOT_ANGLES:2.4,DIRTY_FINISHES:2.8,MASTERPIECES:1.7,
  WOMENS_CLASSICS:2.2,TAG_CLASSICS:2.2,TITLE_CHANGES:1.5,
  LONGEST_REIGN:1,PREMIUM_MAIN_EVENTS:1.8,HARDCORE_CLASSICS:1.1,
  HARDCORE_MATCHES:2,BIG_REACTIONS:3,TAG_MASTERPIECES:.6,
  WOMENS_MASTERPIECES:.65,PREMIUM_CLASSICS:2,
  MAIN_EVENT_CLASSICS:1.8,FIVE_STARS:.25,STIPULATED_CLASSICS:1.5
 };
 const released:LegendArrivalRecord[]=[];
 const checkpoints:number[]=[];
 for(let index=0;index<260;index++){
  const year=Math.floor(index/52)+1,week=index%52+1;
  const totals=Object.fromEntries(
   Object.entries(rates).map(([key,value])=>[key,Math.floor(value*(index+1))]));
  const ready=LEGENDS_CATALOGUE.filter(d=>!released.some(r=>r.id===d.id)&&
   d.metric!==null&&d.target!==null&&Number(totals[d.metric])>=d.target);
  const result=planCertifiedLegendReleases(ready,released,year,week,totals);
  const otherManager=planCertifiedLegendReleases([...ready].reverse(),released,year,week,totals);
  assert.deepEqual(result.selected.map(x=>x.id),otherManager.selected.map(x=>x.id));
  for(const choice of result.selected)released.push({id:choice.id,year,week});
  if(week===52)checkpoints.push(released.length);
 }
 assert.equal(checkpoints.length,5);
 assert.ok(checkpoints[0]!<12,"First season should not exhaust the initial roster");
 assert.ok(checkpoints[4]!>checkpoints[0]!,"Later seasons remain rewarding");
 assert.ok(checkpoints[4]!<95,"Five years cannot release all 129 Legends");
 assert.ok(released.some(r=>r.id==="taz"),"Taz's submission goal remains achievable in one World");
 assert.equal(new Set(released.map(r=>r.id)).size,released.length);
});

test("seven previously unlocked World Legends remain permanent even after target changes",()=>{
 const names=["jerry-lynn","taz","raven","sabu","d-lo-brown","steve-corino","super-crazy"];
 const legacy=names.map((id,i)=>({id,year:1,week:1+i*3}));
 const totals:Partial<Record<LegendMetric,number>>={CLASSICS:102,WEEKLY_CLASSICS:123,SUBMISSIONS:30};
 const candidates=LEGENDS_CATALOGUE.filter(x=>x.metric&&x.target&&
  Number(totals[x.metric]??0)>=x.target&&!legacy.some(d=>d.id===x.id));
 const plan=planCertifiedLegendReleases(candidates,legacy,1,21,totals);
 assert.equal(plan.selected.length,0);
 assert.equal(legacy.length,7);
 assert.equal(legacy[1]!.id,"taz");
});
