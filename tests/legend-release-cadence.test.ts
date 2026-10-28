import test from "node:test";
import assert from "node:assert/strict";
import {
 LEGEND_RELEASE_INTERVAL_WEEKS,LEGEND_TIER_EARLIEST_WEEK,
 planCertifiedLegendReleases
} from "../src/domain/legend-release-cadence.js";
import {findLegend,LEGENDS_CATALOGUE,type LegendMetric} from "../src/domain/legends-catalogue.js";
const take=(id:string)=>{const d=findLegend(id);assert.ok(d);return d;};
const week=(i:number)=>({year:Math.floor(i/52)+1,week:i%52+1});
test("one authentic certified challenge can only release one Legend per three World weeks",()=>{
 const earned=[take("jerry-lynn"),take("raven"),take("sabu")];
 const totals={CLASSICS:20,HOT_ANGLES:20,HARDCORE_CLASSICS:20};
 const history:{id:string;year:number;week:number}[]=[];
 const dates:number[]=[];
 for(let i=0;i<15;i++){
  const w=week(i);
  const candidates=earned.filter(d=>!history.some(h=>h.id===d.id));
  const outcome=planCertifiedLegendReleases(candidates,history,w.year,w.week,totals);
  assert.ok(outcome.selected.length<=1);
  if(outcome.selected[0]){
   dates.push(i);
   history.push({id:outcome.selected[0].id,...w});
  }
 }
 assert.equal(history.length,3);
 assert.deepEqual(dates,[0,3,6]);
 assert.equal(LEGEND_RELEASE_INTERVAL_WEEKS,3);
});
test("rarity gates protect ICON and IMMORTAL reveals even if their shared metric is already met",()=>{
 const icon=take("sting"),immortal=take("bruno-sammartino");
 const earned=[icon,immortal];
 const totals={TITLE_CHANGES:999,LONGEST_REIGN:999};
 assert.equal(planCertifiedLegendReleases(earned,[],1,1,totals).reason,"TIER_GATE");
 assert.deepEqual(planCertifiedLegendReleases(earned,[],1,52,totals).selected,[]);
 const first=planCertifiedLegendReleases(earned,[],2,1,totals);
 assert.equal(first.selected[0]?.id,icon.id);
 const second=planCertifiedLegendReleases([immortal],[{id:icon.id,year:2,week:1}],2,4,totals);
 assert.equal(second.reason,"TIER_GATE");
 assert.equal(planCertifiedLegendReleases([immortal],[{id:icon.id,year:2,week:1}],
  3,1,totals).selected[0]?.id,immortal.id);
 assert.deepEqual(LEGEND_TIER_EARLIEST_WEEK,
  {CULT:0,LEGEND:12,ICON:52,IMMORTAL:104});
});
test("operator-only Undertaker pilot consumes its week but can bypass ordinary rarity gate",()=>{
 const pilot=take("undertaker"),early=take("jerry-lynn");
 const total={CLASSICS:25};
 assert.equal(planCertifiedLegendReleases([pilot,early],[],1,1,total,"undertaker")
  .selected[0]?.id,"undertaker");
 const previous=[{id:"undertaker",year:1,week:1}];
 const blocked=planCertifiedLegendReleases([early],previous,1,2,total);
 assert.deepEqual(blocked.selected,[]);
 assert.equal(blocked.reason,"INTERVAL");
 assert.equal(planCertifiedLegendReleases([early],previous,1,4,total)
  .selected[0]?.id,"jerry-lynn");
});
test("129 approved collectible unlocks never cause a mass reveal in a certified week",()=>{
 const all=LEGENDS_CATALOGUE;
 assert.equal(all.length,129);
 const totals:Partial<Record<LegendMetric,number>>=Object.fromEntries(
  LEGENDS_CATALOGUE.filter(d=>d.metric!==null).map(d=>[d.metric!,100000])) as
  Partial<Record<LegendMetric,number>>;
 const released:{id:string;year:number;week:number}[]=[];
 const yearly:number[]=[];
 for(let i=0;i<520;i++){
  const w=week(i);
  const ready=all.filter(d=>!released.some(x=>x.id===d.id));
  const choice=planCertifiedLegendReleases(ready,released,w.year,w.week,totals);
  assert.ok(choice.selected.length<=1,"No mass reveal in week "+i);
  if(choice.selected[0])released.push({id:choice.selected[0].id,...w});
  if(w.week===52)yearly.push(released.length);
 }
 assert.deepEqual(yearly.slice(0,3),[18,35,52]);
 assert.equal(released.length,129,"Even with every challenge artificially ready, the queue stays bounded");
 assert.equal(new Set(released.map(x=>x.id)).size,129);
});
