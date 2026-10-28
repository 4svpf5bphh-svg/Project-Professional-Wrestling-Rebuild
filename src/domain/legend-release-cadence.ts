/** Legend release cadence. Only the existing certified World Lock calls this
 * planner: no new schedule, cron, time-based unlock, DB query or client polling.
 * Achievements remain earned from immutable World receipts, with at most one
 * ordinary market arrival per three in-game weeks across the whole World.
 */
import type {LegendDefinition,LegendMetric,LegendTier} from "./legends-catalogue.js";
export const LEGEND_RELEASE_INTERVAL_WEEKS=3;
/** Earliest zero-based certified World week index by rarity. */
export const LEGEND_TIER_EARLIEST_WEEK:Readonly<Record<LegendTier,number>>=Object.freeze({
 CULT:0,LEGEND:12,ICON:52,IMMORTAL:104
});
export type LegendArrivalRecord={id:string;year:number;week:number};
export interface LegendReleasePlan {
 selected:readonly LegendDefinition[];
 reason:"PILOT"|"INTERVAL"|"TIER_GATE"|"NOT_ELIGIBLE"|"READY";
}
/** Deterministic: the existing challenge threshold is still authoritative.
 * A one-time explicitly armed operator pilot may bypass the rarity wait and
 * ordinary cooldown, but consumes this week's only slot and cannot repeat.
 * Waiting achievements remain eligible in later certified weeks.
 */
export function planCertifiedLegendReleases(
 candidates:readonly LegendDefinition[],
 alreadyUnlocked:readonly LegendArrivalRecord[],
 year:number,week:number,
 totals:Readonly<Partial<Record<LegendMetric,number>>>,
 pilotLegendId:string|null=null,
):LegendReleasePlan {
 if(!Number.isSafeInteger(year)||year<1||!Number.isSafeInteger(week)||week<1||week>52)
  throw new Error("Invalid World week for legend pacing");
 const currentIndex=(year-1)*52+week-1;
 const lastIndex=alreadyUnlocked.reduce((max,r)=>Math.max(max,(r.year-1)*52+r.week-1),-1);
 // The operator's one-time, authenticated pilot remains a testing instrument
 // and must not create a mass unlock alongside normally earned arrivals.
 const pilot=pilotLegendId?candidates.find(c=>c.id===pilotLegendId):null;
 if(pilot&&lastIndex!==currentIndex)
  return {selected:[pilot],reason:"PILOT"};
 if(lastIndex===currentIndex||
   lastIndex>=0&&currentIndex-lastIndex<LEGEND_RELEASE_INTERVAL_WEEKS)
  return {selected:[],reason:"INTERVAL"};
 if(!candidates.length)return {selected:[],reason:"NOT_ELIGIBLE"};
 const permitted=candidates.filter(c=>currentIndex>=LEGEND_TIER_EARLIEST_WEEK[c.tier]);
 if(!permitted.length)return {selected:[],reason:"TIER_GATE"};
 // Award the strongest *verified challenge completion*, capped to prevent
 // a shared high-volume metric from indefinitely monopolising the queue.
 // Stable tie-breaks mean World Lock retries and two managers see one winner.
 const strength=(c:LegendDefinition)=>c.metric&&c.target&&c.target>0?
  Math.min(1.5,Number(totals[c.metric]??0)/c.target):0;
 const tierWeight:Readonly<Record<LegendTier,number>>={
  CULT:0,LEGEND:1,ICON:2,IMMORTAL:3
 };
 const ranked=[...permitted].sort((a,b)=>
  strength(b)-strength(a)||tierWeight[b.tier]-tierWeight[a.tier]||
  (a.target??0)-(b.target??0)||a.id.localeCompare(b.id));
 return {selected:ranked.slice(0,1),reason:"READY"};
}
