/** A small, saved annual PPV commitment within the original owner-calendaring
 * command boundary. Only identities/weeks are stored, never match cards.
 * Existing uncommitted years retain their original recurrence untouched.
 */
import {withSqlClient} from "./postgres.js";
import {applyWorldCommand} from "./world-commands.js";
import type {SqlRows} from "./world-operations.js";
import type {TransactionPool} from "./transaction.js";
import {defaults,weekIndex,type ShowSeries}
 from "../domain/show-calendar.js";
import {premiumPolicy,projectYearEvents,validateAnnualPremiumEvents,
 type AnnualPremiumEvent,type PremiumPlans}
 from "../domain/annual-premium-plan.js";
import type {StandingTier} from "../domain/annual-promotion-standing.js";

export interface AnnualPremiumScope{worldId:string;promotionId:string;playerId:string}
export interface AnnualPremiumMutation extends AnnualPremiumScope{
 requestId:string;expectedRevision:number;year:number;
 events:AnnualPremiumEvent[];
}
export interface StoredAnnualPremiumPlan {
 year:number;tierAtCommit:StandingTier;events:AnnualPremiumEvent[];
 confirmedWeekIndex:number;
}
const validId=(s:unknown)=>typeof s==="string"&&s.trim().length>0&&s.length<=200;
type YearRow={year:number;events:unknown;tier_at_commit:StandingTier;
 confirmed_week_index:number};
const validYears=(year:number)=>Number.isSafeInteger(year)&&year>=1&&year<=10000;
function validatedEvents(raw:unknown):AnnualPremiumEvent[]{
 if(!Array.isArray(raw)||raw.length>52)throw new Error("Invalid stored yearly event plan");
 return raw.map((x:unknown)=>{
  if(!x||typeof x!=="object"||Array.isArray(x))throw new Error("Invalid annual event");
  const e=x as Record<string,unknown>;
  if(!validId(e.seriesId)||!Number.isSafeInteger(e.week)||
   (e.week as number)<1||(e.week as number)>52)
   throw new Error("Invalid yearly event week or identity");
  return {seriesId:e.seriesId as string,week:e.week as number};
 });
}
export async function readAnnualPremiumPlans(tx:SqlRows,worldId:string,
 promotionId:string,firstYear:number,lastYear:number):Promise<StoredAnnualPremiumPlan[]>{
 if(!validId(worldId)||!validId(promotionId)||!validYears(firstYear)||
  !validYears(lastYear)||lastYear<firstYear||lastYear-firstYear>2)
  throw new Error("Invalid annual plan read horizon");
 const rows=await tx.query<YearRow>(`
  SELECT year,events,tier_at_commit,confirmed_week_index
  FROM ppw_annual_premium_plans
  WHERE world_id=$1 AND promotion_id=$2 AND year BETWEEN $3 AND $4
  ORDER BY year LIMIT 4`,[worldId,promotionId,firstYear,lastYear]);
 if(rows.length>3)throw new Error("Annual plan row budget exceeded");
 return rows.map(row=>({year:row.year,events:validatedEvents(row.events),
  tierAtCommit:row.tier_at_commit,confirmedWeekIndex:row.confirmed_week_index}));
}
export function plansMap(rows:readonly StoredAnnualPremiumPlan[]):PremiumPlans{
 return new Map(rows.map(p=>[p.year,p.events]));
}
/** One indexed annual-plan JSON aggregate can ride on the existing owner
 * snapshot query, avoiding an extra Neon network round-trip on page view. */
export function decodeAnnualPremiumSnapshot(raw:unknown):StoredAnnualPremiumPlan[]{
 if(raw===null)return [];
 if(!Array.isArray(raw)||raw.length>3)
  throw new Error("Invalid annual planning snapshot");
 return raw.map(value=>{
  if(!value||typeof value!=="object"||Array.isArray(value))
   throw new Error("Invalid annual planning snapshot row");
  const row=value as Record<string,unknown>;
  if(!validYears(row.year as number)||typeof row.tierAtCommit!=="string"||
   !Number.isSafeInteger(row.confirmedWeekIndex)||
   (row.confirmedWeekIndex as number)<0)
   throw new Error("Invalid annual year metadata");
  return {year:row.year as number,events:validatedEvents(row.events),
   tierAtCommit:row.tierAtCommit as StandingTier,
   confirmedWeekIndex:row.confirmedWeekIndex as number};
 });
}
async function ownerSnapshot(tx:SqlRows,scope:AnnualPremiumScope){
 const rows=await tx.query<{name:string;tier:StandingTier;cadence:number;
  interval:number|null;year:number;week:number;booking_open:boolean}>(`
 SELECT p.name,p.tier,p.event_cadence_weeks AS cadence,
  w.major_event_interval_weeks AS interval,w.year,w.week,
  (w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS booking_open
 FROM ppw_worlds w
 JOIN ppw_promotions p ON p.world_id=w.world_id AND p.promotion_id=$2
 JOIN ppw_promotion_controls c ON c.world_id=w.world_id
  AND c.promotion_id=p.promotion_id AND c.player_id=$3 AND c.active
 JOIN ppw_memberships m ON m.world_id=w.world_id
  AND m.player_id=c.player_id AND m.status='ACTIVE'
 WHERE w.world_id=$1 AND p.lifecycle='ACTIVE'`,
 [scope.worldId,scope.promotionId,scope.playerId]);
 if(rows.length!==1)throw new Error("Annual PPV plan requires the promotion owner");
 return rows[0]!;
}
export async function saveAnnualPremiumPlan(pool:TransactionPool,input:AnnualPremiumMutation){
 if(![input.worldId,input.promotionId,input.playerId,input.requestId].every(validId)||
  !validYears(input.year)||!Array.isArray(input.events))
  throw new Error("Invalid annual PPV plan");
 const events=validatedEvents(input.events);
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"SAVE_ANNUAL_PREMIUM_PLAN",requiresOpenWeek:true,
  execute:async tx=>{
   const auth=await ownerSnapshot(tx,input);
   if(!auth.booking_open)throw new Error("Annual planning is closed during World Lock");
   if(input.year!==auth.year&&input.year!==auth.year+1)
    throw new Error("Choose this World year or next year");
   const configured=await tx.query<{
    series_id:string;name:string;role:ShowSeries["role"];
    event_type:ShowSeries["eventType"];cadence_weeks:number;anchor_week:number;
    importance:number;active:boolean}>(`
    SELECT series_id,name,role,event_type,cadence_weeks,
     anchor_week,importance,active FROM ppw_show_series
    WHERE world_id=$1 AND promotion_id=$2 AND active
    ORDER BY series_id LIMIT 17`,[input.worldId,input.promotionId]);
   if(configured.length>16)throw new Error("Too many active show identities");
   const series:ShowSeries[]=configured.length?configured.map(s=>({
    seriesId:s.series_id,name:s.name,role:s.role,eventType:s.event_type,
    cadenceWeeks:s.cadence_weeks,anchorWeek:s.anchor_week,
    importance:s.importance,active:s.active
   })):defaults(auth.name,auth.cadence,auth.interval??4);
   const prior=input.year>1?await readAnnualPremiumPlans(tx,input.worldId,
    input.promotionId,input.year-1,input.year-1):[];
   const previous=prior.length?prior[0]!.events:input.year>1?
    projectYearEvents(series,input.year-1):[];
   // Nothing already booked or certified can be moved by confirming a new
   // yearly plan; even an old unlinked PPV is protected at its actual week.
   const reserved=await tx.query<{week:number;series_id:string|null}>(`
    SELECT DISTINCT week,show_series_id AS series_id FROM ppw_booking_drafts
    WHERE world_id=$1 AND promotion_id=$2 AND year=$3
     AND booking_class='PREMIUM'
     AND (status IN ('DRAFT','SUBMITTED') OR
       EXISTS(SELECT 1 FROM ppw_completed_shows completed
        WHERE completed.world_id=ppw_booking_drafts.world_id
         AND completed.show_id=ppw_booking_drafts.draft_id))
    ORDER BY week,series_id LIMIT 54`,[input.worldId,input.promotionId,input.year]);
   if(reserved.length>52)throw new Error("Too many previously booked PPVs");
   const locked=reserved.map(r=>({week:r.week,seriesId:r.series_id}));
   const now=weekIndex(auth.year,auth.week);
   // No retroactive change to existing yearly dates or certified history.
   const earlier=await readAnnualPremiumPlans(tx,input.worldId,
    input.promotionId,input.year,input.year);
   if(input.year===auth.year){
    const priorEvents=earlier.length?earlier[0]!.events:
     projectYearEvents(series,input.year);
    for(const e of priorEvents.filter(e=>weekIndex(input.year,e.week)<now)){
     if(!events.some(x=>x.week===e.week&&x.seriesId===e.seriesId))
      throw new Error("Past PPV calendar dates cannot be rewritten");
    }
   }
   validateAnnualPremiumEvents({year:input.year,tier:auth.tier,
    events,series,previous,grandfathered:locked,originalName:auth.name});
   await tx.query(`
    INSERT INTO ppw_annual_premium_plans(world_id,promotion_id,year,
     events,tier_at_commit,confirmed_week_index)
    VALUES($1,$2,$3,$4::jsonb,$5,$6)
    ON CONFLICT(world_id,promotion_id,year) DO UPDATE SET
     events=EXCLUDED.events,tier_at_commit=EXCLUDED.tier_at_commit,
     confirmed_week_index=EXCLUDED.confirmed_week_index`,
    [input.worldId,input.promotionId,input.year,
     JSON.stringify([...events].sort((a,b)=>a.week-b.week||
       a.seriesId.localeCompare(b.seriesId))),auth.tier,now]);
   return {year:input.year,events,status:"CONFIRMED" as const,
    band:premiumPolicy(auth.tier)};
  }});
}
