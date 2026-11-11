/** A 52-week PPV commitment is a small list of identities and week numbers,
 * NOT 52 generated fixtures. Existing television recurrences remain untouched.
 * An absent plan means the old calendar is grandfathered until the manager
 * explicitly commits the year. AI planning uses the same tier policy.
 */
import {seriesDue,weekIndex,type ShowSeries} from "./show-calendar.js";
import type {StandingTier} from "./annual-promotion-standing.js";
export interface AnnualPremiumEvent {seriesId:string;week:number}
export interface AnnualPremiumPlan {year:number;events:AnnualPremiumEvent[]}
export type PremiumPlans=ReadonlyMap<number,readonly AnnualPremiumEvent[]>;
export interface PremiumPolicy {minimum:number;maximum:number;recommended:number;minGap:number}
const policies:Record<StandingTier,PremiumPolicy>={
 LOCAL:{minimum:2,maximum:4,recommended:3,minGap:8},
 INDEPENDENT:{minimum:2,maximum:4,recommended:4,minGap:8},
 RISING:{minimum:4,maximum:8,recommended:6,minGap:4},
 NATIONAL:{minimum:10,maximum:12,recommended:10,minGap:3},
 GLOBAL:{minimum:10,maximum:12,recommended:11,minGap:3}
};
export function premiumPolicy(tier:StandingTier):PremiumPolicy{
 if(!Object.hasOwn(policies,tier))throw new Error("Unknown promotion size");
 return policies[tier];
}
export function projectYearEvents(series:readonly ShowSeries[],
 year:number,plans?:PremiumPlans):AnnualPremiumEvent[]{
 if(!Number.isSafeInteger(year)||year<1||year>10000)
  throw new Error("Invalid PPW calendar year");
 const active=series.filter(s=>s.active&&s.eventType==="MAJOR");
 const overrides=plans?.get(year);
 if(overrides)return [...overrides].map(e=>({seriesId:e.seriesId,week:e.week}))
   .sort((a,b)=>a.week-b.week||a.seriesId.localeCompare(b.seriesId));
 const first=weekIndex(year,1);
 return Array.from({length:52},(_,i)=>active.filter(s=>seriesDue(s,first+i))
  .map(s=>({seriesId:s.seriesId,week:i+1}))).flat()
  .sort((a,b)=>a.week-b.week||a.seriesId.localeCompare(b.seriesId));
}
export function scheduledSeriesOnWeek(series:readonly ShowSeries[],year:number,
 week:number,plans?:PremiumPlans):ShowSeries[]{
 if(!Number.isSafeInteger(week)||week<1||week>52)
  throw new Error("Invalid PPW calendar week");
 const index=weekIndex(year,week),plan=plans?.get(year);
 return series.filter(s=>s.active&&(
  s.eventType==="REGULAR"?seriesDue(s,index):
   plan!==undefined?plan.some(e=>e.week===week&&e.seriesId===s.seriesId):
    seriesDue(s,index)
 ));
}
const fixedWeeks:Record<number,readonly number[]>={
 3:[12,29,46],4:[7,20,33,46],6:[5,14,23,32,41,50],
 10:[3,8,13,18,23,28,33,38,43,48],
 11:[3,8,13,18,23,28,33,38,43,48,51]
};
export function suggestedAnnualPremiumEvents(series:readonly ShowSeries[],
 tier:StandingTier,year:number,promotionName:string):AnnualPremiumEvent[]{
 const eligible=series.filter(s=>s.active&&s.eventType==="MAJOR");
 if(!eligible.length)return [];
 const policy=premiumPolicy(tier),legacy=projectYearEvents(series,year);
 // Protect recognisable real-life identities, including WWE / AEW recurring
 // annual event names. Never manufacture renamed versions of their shows.
 const original=promotionName.trim().toUpperCase();
 if((original==="WWE"||original==="AEW")&&legacy.length<=policy.maximum)
  return legacy;
 const dates=fixedWeeks[policy.recommended]??fixedWeeks[3]!;
 return dates.map((week,i)=>({week,seriesId:eligible[i%eligible.length]!.seriesId}));
}
export function validateAnnualPremiumEvents(input:{
 year:number;tier:StandingTier;events:readonly AnnualPremiumEvent[];
 series:readonly ShowSeries[];previous?:readonly AnnualPremiumEvent[];
 grandfathered?:readonly {week:number;seriesId:string|null}[];
 originalName?:string;
}):void{
 const {year,events,series}=input;
 if(!Number.isSafeInteger(year)||year<1||year>10000||
  !Array.isArray(events)||events.length>52)
  throw new Error("Invalid annual PPV plan");
 const policy=premiumPolicy(input.tier);
 const eligible=new Set(series.filter(s=>s.active&&s.eventType==="MAJOR")
  .map(s=>s.seriesId));
 const occupied=new Set<number>();
 for(const e of events){
  if(!e||typeof e.seriesId!=="string"||!eligible.has(e.seriesId)||
   !Number.isSafeInteger(e.week)||e.week<1||e.week>52)
   throw new Error("Choose an existing active premium event and World week");
  if(occupied.has(e.week))throw new Error("Only one PPV or special per World week");
  occupied.add(e.week);
 }
 const locked=input.grandfathered??[];
 for(const e of locked){
  if(!Number.isSafeInteger(e.week)||e.week<1||e.week>52)
   throw new Error("Invalid existing show commitment");
  if(!events.some(x=>x.week===e.week&&
    (e.seriesId===null||x.seriesId===e.seriesId)))
   throw new Error("Booked or certified premium events cannot be cancelled or moved");
 }
 if(events.length>Math.max(policy.maximum,locked.length))
  throw new Error("This promotion cannot schedule more than "+
   policy.maximum+" premium events per year");
 // An original official WWE/AEW anniversary date may be two weeks from the
 // next one. Preserve only the *unchanged* original landmarks, not arbitrary
 // newly added close-together dates.
 const original=(input.originalName??"").trim().toUpperCase();
 const protectedLegacy=(original==="WWE"||original==="AEW")?
  projectYearEvents(series,year):[];
 const unchanged=(a:AnnualPremiumEvent,b:AnnualPremiumEvent)=>
  a.week===b.week&&a.seriesId===b.seriesId;
 const sorted=[...events].sort((a,b)=>a.week-b.week);
 for(let i=1;i<sorted.length;i++){
  const left=sorted[i-1]!,right=sorted[i]!;
  if(right.week-left.week<policy.minGap&&
    !(protectedLegacy.some(x=>unchanged(x,left))&&
      protectedLegacy.some(x=>unchanged(x,right))))
   throw new Error("Leave at least "+policy.minGap+
    " weeks between premium events at this promotion size");
 }
 if(input.previous?.length&&sorted.length){
  const last=[...input.previous].sort((a,b)=>b.week-a.week)[0]!;
  const first=sorted[0]!;
  const gap=52-last.week+first.week;
  if(gap<policy.minGap)
   throw new Error("Leave at least "+policy.minGap+
    " weeks after the previous year's final PPV");
 }
}
