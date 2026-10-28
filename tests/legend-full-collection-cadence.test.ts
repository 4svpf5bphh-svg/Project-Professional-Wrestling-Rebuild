import test from "node:test";
import assert from "node:assert/strict";
import {LEGENDS_CATALOGUE,type LegendMetric} from "../src/domain/legends-catalogue.js";
import {LEGEND_RELEASE_INTERVAL_WEEKS,LEGEND_TIER_EARLIEST_WEEK,
 planCertifiedLegendReleases,type LegendArrivalRecord}
 from "../src/domain/legend-release-cadence.js";

test("129 fully earned Legends cannot flood a two-player World: 260-week release rehearsal",()=>{
 const all=LEGENDS_CATALOGUE;
 assert.equal(all.length,129);
 assert.equal(new Set(all.map(x=>x.id)).size,129);
 const history:LegendArrivalRecord[]=[];
 const total=Object.fromEntries(
  all.filter(x=>x.metric!==null).map(x=>[x.metric!,100000])
 ) as Partial<Record<LegendMetric,number>>;
 const firstByTier=new Map<string,number>();
 for(let index=0;index<260;index++){
  const year=Math.floor(index/52)+1,week=index%52+1;
  const remaining=all.filter(x=>!history.some(h=>h.id===x.id));
  const a=planCertifiedLegendReleases(remaining,history,year,week,total);
  const b=planCertifiedLegendReleases([...remaining].reverse(),history,year,week,total);
  assert.deepEqual(a.selected.map(x=>x.id),b.selected.map(x=>x.id),
   "Two managers must see the same release regardless of query order");
  assert.ok(a.selected.length<=1,"Never reveal more than one Legend in a certified week");
  for(const item of a.selected){
   assert.ok(index>=LEGEND_TIER_EARLIEST_WEEK[item.tier],
    item.name+" would arrive before its tier gate");
   firstByTier.set(item.tier,Math.min(index,firstByTier.get(item.tier)??Infinity));
   const last=history.at(-1);
   if(last){
    assert.ok(index-((last.year-1)*52+last.week-1)>=LEGEND_RELEASE_INTERVAL_WEEKS,
     "Releases must be at least three certified weeks apart");
   }
   history.push({id:item.id,year,week});
  }
 }
 assert.equal(history.length,87,"Five years permit only 87 of 129 releases, never a weekly flood");
 assert.equal(firstByTier.get("CULT"),0);
 assert.ok((firstByTier.get("LEGEND")??-1)>=12);
 assert.ok((firstByTier.get("ICON")??-1)>=52);
 assert.ok((firstByTier.get("IMMORTAL")??-1)>=104);
 assert.equal(new Set(history.map(x=>x.id)).size,87);
});
