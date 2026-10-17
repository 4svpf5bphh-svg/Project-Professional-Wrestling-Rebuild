/** Six-week show planning, retaining PPW's authored schedule and provisional
 * venue claims. One indexed controlled-promotion snapshot, never World hydration.
 * Calendar dates are PPW weeks, not real local dates or scheduler activations.
 */
import {randomUUID} from "node:crypto";
import {withSqlClient} from "./postgres.js";
import {applyWorldCommand} from "./world-commands.js";
import type {SqlRows} from "./world-operations.js";
import type {TransactionPool} from "./transaction.js";
import type {TicketStrategy} from "../domain/legacy-show-economics.js";

export type PlannedEventType="REGULAR"|"MAJOR";
export interface PlannerScope {worldId:string;promotionId:string;playerId:string}
export interface PlanWeekInput extends PlannerScope {
 requestId:string;expectedRevision:number;year:number;week:number;
 eventType:PlannedEventType;day:number;marketId:string;venueId:string;
 ticketStrategy:TicketStrategy;draftId?:string;
}
export interface PlannerVenue {
 venueId:string;marketId:string;marketName:string;name:string;capacity:number;
 weeklyHireCost:number;awareness:number;liveStrength:number;loyalty:number;
 home:boolean;
}
export interface PlannedShow {
 draftId:string;year:number;week:number;status:string;eventType:PlannedEventType;
 day:number|null;marketId:string|null;venueId:string|null;
 marketName:string|null;venueName:string|null;ticketStrategy:TicketStrategy|null;
 ready:boolean;slots:number;
}
export interface PlannerWeek {
 year:number;week:number;offset:number;required:boolean;major:boolean;
 canEdit:boolean;shows:PlannedShow[];
}
export interface PlannerView {
 worldName:string;promotionName:string;year:number;week:number;
 worldRevision:number;canEdit:boolean;homeMarketId:string|null;
 venues:PlannerVenue[];weeks:PlannerWeek[];
}
const id=(s:unknown):s is string=>typeof s==="string"&&s.trim().length>0&&s.length<=200;
function checkScope(s:PlannerScope){
 if(![s.worldId,s.promotionId,s.playerId].every(id))
  throw new Error("Invalid show planner identity");
}
const weekIndex=(year:number,week:number)=>(year-1)*52+week-1;
function dateAt(index:number){return {year:Math.floor(index/52)+1,week:index%52+1};}
type Owner={world_name:string;promotion_name:string;year:number;week:number;
 revision:string|number;booking_open:boolean;cadence:number;
 major_interval:number|null;home_market_id:string|null};
async function owner(tx:SqlRows,s:PlannerScope):Promise<Owner>{
 checkScope(s);
 const rows=await tx.query<Owner>(`
 SELECT w.name AS world_name,p.name AS promotion_name,w.year,w.week,
  w.revision,(w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS booking_open,
  p.event_cadence_weeks AS cadence,w.major_event_interval_weeks AS major_interval,
  p.home_market_id FROM ppw_worlds w
 JOIN ppw_promotions p ON p.world_id=w.world_id AND p.promotion_id=$2
 JOIN ppw_promotion_controls c ON c.world_id=w.world_id
  AND c.promotion_id=p.promotion_id AND c.player_id=$3 AND c.active
 JOIN ppw_memberships m ON m.world_id=w.world_id AND m.player_id=c.player_id
  AND m.status='ACTIVE'
 WHERE w.world_id=$1 AND p.lifecycle='ACTIVE'`,[s.worldId,s.promotionId,s.playerId]);
 if(rows.length!==1)throw new Error("Planner promotion access denied");
 return rows[0]!;
}
function major(index:number,interval:number|null){
 return interval!==null&&interval>0&&(index+1)%interval===0;
}
export async function readSixWeekPlanner(pool:TransactionPool,s:PlannerScope):Promise<PlannerView>{
 return withSqlClient(pool,async tx=>{
  const owned=await owner(tx,s),start=weekIndex(owned.year,owned.week);
  const drafts=await tx.query<{
   draft_id:string;year:number;week:number;status:string;
   event_type:PlannedEventType|null;show_day:number|null;market_id:string|null;
   venue_id:string|null;ticket_strategy:TicketStrategy|null;
   market_name:string|null;venue_name:string|null;
   lock_ready_fingerprint:string|null;slots:number;
  }>(`
 SELECT d.draft_id,d.year,d.week,d.status,d.event_type,d.show_day,
   d.market_id,d.venue_id,d.ticket_strategy,
   m.name AS market_name,v.name AS venue_name,d.lock_ready_fingerprint,
   (SELECT count(*)::integer FROM ppw_card_slots c
    WHERE c.world_id=d.world_id AND c.draft_id=d.draft_id) AS slots
 FROM ppw_booking_drafts d
 LEFT JOIN ppw_markets m ON m.world_id=d.world_id AND m.market_id=d.market_id
 LEFT JOIN ppw_venues v ON v.world_id=d.world_id AND v.venue_id=d.venue_id
 WHERE d.world_id=$1 AND d.promotion_id=$2
 AND (d.year-1)*52+d.week-1 BETWEEN $3 AND $4
 ORDER BY d.year,d.week,d.draft_id LIMIT 73`,
 [s.worldId,s.promotionId,start,start+5]);
 if(drafts.length>72)throw new Error("Planner show count exceeds safe limit");
 const venues=await tx.query<{
  venue_id:string;market_id:string;market_name:string;name:string;
  capacity:number;weekly_hire_cost:string|number;
  awareness:number;live_strength:number;loyalty:number;
 }>(`
 SELECT v.venue_id,v.market_id,m.name AS market_name,v.name,v.capacity,
  v.weekly_hire_cost,local.awareness,local.live_strength,local.loyalty
 FROM ppw_venues v
 JOIN ppw_markets m ON m.world_id=v.world_id AND m.market_id=v.market_id
 JOIN ppw_promotion_market_states local ON local.world_id=v.world_id
  AND local.market_id=v.market_id AND local.promotion_id=$2
 WHERE v.world_id=$1 AND v.status='ACTIVE'
 AND v.capacity IS NOT NULL AND v.weekly_hire_cost IS NOT NULL
 ORDER BY m.name,v.name,v.venue_id LIMIT 101`,[s.worldId,s.promotionId]);
 if(venues.length>100)throw new Error("Planner venue choices exceed safe limit");
 return {
  worldName:owned.world_name,promotionName:owned.promotion_name,
  year:owned.year,week:owned.week,worldRevision:Number(owned.revision),
  canEdit:owned.booking_open,homeMarketId:owned.home_market_id,
  venues:venues.map(v=>({venueId:v.venue_id,marketId:v.market_id,
   marketName:v.market_name,name:v.name,capacity:v.capacity,
   weeklyHireCost:Number(v.weekly_hire_cost),awareness:v.awareness,
   liveStrength:v.live_strength,loyalty:v.loyalty,
   home:v.market_id===owned.home_market_id})),
  weeks:Array.from({length:6},(_,offset)=>{
   const index=start+offset,when=dateAt(index);
   return {...when,offset,required:index%Math.max(1,owned.cadence)===0,
    major:major(index,owned.major_interval),canEdit:owned.booking_open,
    shows:drafts.filter(d=>d.year===when.year&&d.week===when.week).map(d=>({
     draftId:d.draft_id,year:d.year,week:d.week,status:d.status,
     eventType:d.event_type??(major(index,owned.major_interval)?"MAJOR":"REGULAR"),
     day:d.show_day,marketId:d.market_id,venueId:d.venue_id,
     marketName:d.market_name,venueName:d.venue_name,
     ticketStrategy:d.ticket_strategy,ready:d.lock_ready_fingerprint!==null,
     slots:d.slots
    }))}
  })
 };
 });
}
/** Plan or edit exactly one standard weekly show. Other promotions' venue
 * claims are not used to reject a player; World resource arbitration is fair.
 * No wrestler is committed until a valid authored card is confirmed.
 */
export async function planShowWeek(pool:TransactionPool,input:PlanWeekInput){
 checkScope(input);
 if(!Number.isSafeInteger(input.year)||input.year<1||
  !Number.isSafeInteger(input.week)||input.week<1||input.week>52||
  !Number.isSafeInteger(input.day)||input.day<1||input.day>7||
  !id(input.venueId)||!id(input.marketId)||
  (input.draftId!==undefined&&!id(input.draftId))||
  !["REGULAR","MAJOR"].includes(input.eventType)||
  !["ACCESSIBLE","STANDARD","PREMIUM","PRESTIGE"].includes(input.ticketStrategy))
  throw new Error("Invalid show planning selection");
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"PLAN_SHOW_WEEK",requiresOpenWeek:true,execute:async tx=>{
   const auth=await owner(tx,input);
   if(!auth.booking_open)throw new Error("Show planning is closed at World Lock");
   const current=weekIndex(auth.year,auth.week),target=weekIndex(input.year,input.week);
   if(target<current||target>current+5)
    throw new Error("Show must be planned in the current six-week window");
   const event:PlannedEventType=major(target,auth.major_interval)?"MAJOR":"REGULAR";
   if(input.eventType!==event)
    throw new Error("Event importance follows the World calendar");
   const eligible=await tx.query<{venue_id:string}>(`
    SELECT v.venue_id FROM ppw_venues v
    JOIN ppw_promotion_market_states local ON local.world_id=v.world_id
     AND local.market_id=v.market_id AND local.promotion_id=$2
    WHERE v.world_id=$1 AND v.venue_id=$3 AND v.market_id=$4
     AND v.status='ACTIVE' AND v.capacity IS NOT NULL
     AND v.weekly_hire_cost IS NOT NULL`,
    [input.worldId,input.promotionId,input.venueId,input.marketId]);
   if(eligible.length!==1)throw new Error("Choose an available venue in that market");
   const existing=await tx.query<{draft_id:string;status:string}>(`
    SELECT draft_id,status FROM ppw_booking_drafts
    WHERE world_id=$1 AND promotion_id=$2 AND year=$3 AND week=$4
    ORDER BY draft_id LIMIT 3`,
    [input.worldId,input.promotionId,input.year,input.week]);
   if(existing.length>1)throw new Error("Multiple show drafts need reconciliation");
   if(input.draftId){
    if(existing.length!==1||existing[0]!.draft_id!==input.draftId||
     existing[0]!.status!=="DRAFT")
     throw new Error("Only your existing draft can be rescheduled");
    const rows=await tx.query<{draft_id:string}>(`
     UPDATE ppw_booking_drafts
     SET show_day=$4,market_id=$5,venue_id=$6,ticket_strategy=$7,
       lock_ready_by_player_id=NULL,lock_ready_fingerprint=NULL,
       booking_expected_demand=NULL,booking_ticket_yield=NULL,
       booking_snapshot_fingerprint=NULL,revision=revision+1
     WHERE world_id=$1 AND draft_id=$2 AND promotion_id=$3
      AND status='DRAFT' RETURNING draft_id`,
      [input.worldId,input.draftId,input.promotionId,input.day,
       input.marketId,input.venueId,input.ticketStrategy]);
    if(rows.length!==1)throw new Error("Show is no longer editable");
    return {draftId:input.draftId,year:input.year,week:input.week,
     status:"UPDATED" as const};
   }
   if(existing.length)throw new Error("This week already has a planned show");
   const draftId="planner-"+randomUUID();
   const created=await tx.query<{draft_id:string}>(`
    INSERT INTO ppw_booking_drafts(
     world_id,draft_id,promotion_id,year,week,status,show_day,
     event_type,market_id,venue_id,ticket_strategy)
    VALUES($1,$2,$3,$4,$5,'DRAFT',$6,$7,$8,$9,$10)
    RETURNING draft_id`,
    [input.worldId,draftId,input.promotionId,input.year,input.week,
     input.day,event,input.marketId,input.venueId,input.ticketStrategy]);
   if(created.length!==1)throw new Error("Show draft was not created");
   return {draftId,year:input.year,week:input.week,status:"CREATED" as const};
  }});
}
