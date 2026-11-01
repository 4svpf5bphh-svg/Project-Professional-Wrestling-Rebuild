/** Transactional original ticket/venue settlement, after certified card
 * scoring and CONTRACT_APPEARANCE_FEES, before publishing completed results.
 * Only a trusted World-locked resolver can call this. No player API.
 */
import type {SqlRows} from "./world-operations.js";
import {worldStaff} from "../domain/world-staff.js";
import {staffedProductionCost} from "../domain/staff-production.js";
import {readCardParticipants} from "../domain/card-participants.js";
import {projectShowAudience} from "../domain/show-audience.js";
import {originalCompetitionFactor,originalShowSettlement,
 type Competitor,type LocalAudience,
 type ShowTier,type EventType,type TicketStrategy}
 from "../domain/legacy-show-economics.js";
export interface SettleShowInput{worldId:string;promotionId:string;showId:string;year:number;week:number;
 averageMatchRating:number}

export async function settleCompletedShowEconomics(tx:SqlRows,input:SettleShowInput){
 const rows=await tx.query<{
  seed:string|number;market_id:string|null;show_day:number|null;event_type:EventType|null;
  booking_expected_demand:number|null;booking_ticket_yield:string|null;
  booking_snapshot_fingerprint:string|null;
  ticket_strategy:TicketStrategy|null;promotion_id:string;
  venue_market_id:string|null;home_market_id:string|null;
  capacity:number|null;weekly_hire_cost:string|null;venue_status:string|null;tier:ShowTier;
  media_reach:number|null;audience_potential:number|null;
  wrestling_interest:number|null;spending_index:number|null;
  awareness:number|null;live_strength:number|null;loyalty:number|null;
  resource_charged:boolean;show_completed:boolean;production_staff_id:string|null;
 }>(`
 SELECT w.seed,d.market_id,d.show_day,d.event_type,d.ticket_strategy,
  d.booking_expected_demand,d.booking_ticket_yield::text,
  d.booking_snapshot_fingerprint,
  p.promotion_id,p.home_market_id,p.tier,p.media_reach,
  v.market_id AS venue_market_id,v.capacity,v.weekly_hire_cost,
  v.status AS venue_status,
  m.audience_potential,m.wrestling_interest,m.spending_index,
  local.awareness,local.live_strength,local.loyalty,
  (SELECT employee.staff_id FROM ppw_staff_employments employee
    WHERE employee.world_id=d.world_id AND employee.promotion_id=d.promotion_id
     AND employee.role='PRODUCTION' AND employee.status='ACTIVE'
     AND employee.start_week_index <= (d.year-1)*52+d.week-1
     AND employee.expires_week_index >= (d.year-1)*52+d.week-1
    LIMIT 1) AS production_staff_id,
  (r.show_id IS NOT NULL) AS resource_charged,
  (cs.show_id IS NOT NULL) AS show_completed
 FROM ppw_booking_drafts d
 JOIN ppw_worlds w ON w.world_id=d.world_id AND w.phase='RESOLVING'
  AND w.year=$4 AND w.week=$5 AND w.show_economics_enabled
 JOIN ppw_promotions p ON p.world_id=d.world_id AND p.promotion_id=d.promotion_id
 LEFT JOIN ppw_venues v ON v.world_id=d.world_id AND v.venue_id=d.venue_id
 LEFT JOIN ppw_markets m ON m.world_id=d.world_id AND m.market_id=d.market_id
 LEFT JOIN ppw_promotion_market_states local ON local.world_id=d.world_id
  AND local.promotion_id=d.promotion_id AND local.market_id=d.market_id
 LEFT JOIN ppw_show_resolutions r ON r.world_id=d.world_id AND r.show_id=d.draft_id
  AND r.promotion_id=d.promotion_id
 LEFT JOIN ppw_completed_shows cs ON cs.world_id=d.world_id AND cs.show_id=d.draft_id
  AND cs.promotion_id=d.promotion_id
 WHERE d.world_id=$1 AND d.draft_id=$2 AND d.promotion_id=$3
  AND d.year=$4 AND d.week=$5 AND d.status='SUBMITTED'
 FOR UPDATE OF w`,
 [input.worldId,input.showId,input.promotionId,input.year,input.week]);
 if(rows.length!==1)throw new Error("Original show economics requires a submitted show");
 const x=rows[0]!;
 if(!x.show_completed||!x.resource_charged||x.venue_status!=="ACTIVE"||!x.market_id
  ||x.venue_market_id!==x.market_id||!x.home_market_id
  ||x.show_day===null||!x.event_type||!x.ticket_strategy
  ||x.capacity===null||x.weekly_hire_cost===null
  ||x.media_reach===null||x.audience_potential===null
  ||x.wrestling_interest===null||x.spending_index===null
  ||x.awareness===null||x.live_strength===null||x.loyalty===null||
  x.booking_expected_demand===null||x.booking_ticket_yield===null||
  !x.booking_snapshot_fingerprint||
  !Number.isFinite(input.averageMatchRating)||
  input.averageMatchRating<.5||input.averageMatchRating>5)
  throw new Error("Original show market, venue or ticket context not imported");
 // Booking's forecast is frozen when the player confirms Ready to Run.
 // A rival or wrestler profile change after that point cannot rewrite it.
 const expectedDemand=x.booking_expected_demand;
 const slots=await tx.query<{payload:unknown}>(`
  SELECT payload FROM ppw_card_slots
  WHERE world_id=$1 AND draft_id=$2 ORDER BY position LIMIT 101`,
  [input.worldId,input.showId]);
 if(slots.length===0||slots.length>100)throw new Error("Invalid event attendance card");
 const everyone=new Set<string>();
 for(const slot of slots)for(const p of readCardParticipants(slot.payload))everyone.add(p.personId);
 if(everyone.size<2||everyone.size>100)throw new Error("No valid event talent roster");
 const local:LocalAudience={awareness:x.awareness,liveStrength:x.live_strength,loyalty:x.loyalty};
 // Rival capacity is shared across the World, not promotion-private. This
 // single week-scoped query gathers ONLY the competition projection.
 const rivals=await tx.query<{
  show_id:string;promotion_id:string;market_id:string|null;show_day:number|null;
  media_reach:number|null;awareness:number|null;
  live_strength:number|null;loyalty:number|null;
 }>(`
 SELECT d.draft_id AS show_id,d.promotion_id,d.market_id,d.show_day,
   p.media_reach,l.awareness,l.live_strength,l.loyalty
 FROM ppw_booking_drafts d
 JOIN ppw_promotions p ON p.world_id=d.world_id AND p.promotion_id=d.promotion_id
 LEFT JOIN ppw_promotion_market_states l ON l.world_id=d.world_id
  AND l.promotion_id=d.promotion_id AND l.market_id=d.market_id
 WHERE d.world_id=$1 AND d.year=$2 AND d.week=$3
  AND d.status='SUBMITTED' AND p.lifecycle='ACTIVE'
 ORDER BY d.promotion_id,d.draft_id LIMIT 129`,
 [input.worldId,input.year,input.week]);
 if(rivals.length>128 || rivals.some(r=>!r.market_id||r.show_day===null||
  r.media_reach===null||r.awareness===null||r.live_strength===null||r.loyalty===null))
  throw new Error("Missing World-wide competitor market context");
 const competitors:Competitor[]=rivals.map(r=>({
  showId:r.show_id,promotionId:r.promotion_id,marketId:r.market_id!,
  day:r.show_day!,mediaReach:r.media_reach!,
  local:{awareness:r.awareness!,liveStrength:r.live_strength!,loyalty:r.loyalty!},
 }));
 if(!competitors.some(r=>r.showId===input.showId&&r.promotionId===input.promotionId))
  throw new Error("Current show missing from World competition");
 const factor=originalCompetitionFactor({
  showId:input.showId,promotionId:input.promotionId,marketId:x.market_id,
  day:x.show_day,mediaReach:x.media_reach,local},competitors);
 // Appearance cost is already debited by the World resource-charge step.
 // Count it for event profitability but NEVER pay it again.
 const appearance=await tx.query<{amount:string}>(`
  SELECT coalesce(sum((payload->>'amount')::bigint),0)::text AS amount
  FROM ppw_ledger_events WHERE world_id=$1 AND year=$2 AND week=$3
   AND event_type='CONTRACT_APPEARANCE_FEES'
   AND payload->>'showId'=$4 AND payload->>'promotionId'=$5`,
  [input.worldId,input.year,input.week,input.showId,input.promotionId]);
 const original=originalShowSettlement({seed:x.seed,showId:input.showId,
  expectedDemand,competitionFactor:factor,capacity:x.capacity,
  ticketYield:Number(x.booking_ticket_yield),
  venueCost:Number(x.weekly_hire_cost),tier:x.tier,eventType:x.event_type,
  participants:everyone.size,away:x.market_id!==x.home_market_id,
  appearanceFees:Number(appearance[0]?.amount??0)});
 const employee=x.production_staff_id===null?null:
  worldStaff(x.seed).find(s=>s.staffId===x.production_staff_id)??null;
 if(x.production_staff_id&&!employee)
  throw new Error("Unknown assigned World production employee");
 const efficiency=staffedProductionCost(original.productionCost,employee);
 const quote={...original,productionCost:efficiency.cost,
  totalCost:original.totalCost-efficiency.saving,
  netResult:original.netResult+efficiency.saving,
  incrementalCash:original.incrementalCash+efficiency.saving};
 const audience=projectShowAudience({tier:x.tier,eventType:x.event_type,
  mediaReach:x.media_reach,awareness:x.awareness,liveStrength:x.live_strength,
  loyalty:x.loyalty,wrestlingInterest:x.wrestling_interest,
  expectedDemand,averageMatchRating:input.averageMatchRating});
 const inserted=await tx.query<{show_id:string}>(`
 INSERT INTO ppw_show_economics(world_id,show_id,promotion_id,year,week,
  attendance,expected_demand,gate_revenue,venue_cost,production_cost,travel_cost,
  appearance_fees,total_cost,net_result,incremental_cash,average_match_rating,
  audience_format,tv_household_rating,estimated_viewers,ppv_buys)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
 RETURNING show_id`,
 [input.worldId,input.showId,input.promotionId,input.year,input.week,
  quote.attendance,quote.expectedDemand,quote.gateRevenue,quote.venueCost,
  quote.productionCost,quote.travelCost,quote.appearanceFees,quote.totalCost,
  quote.netResult,quote.incrementalCash,input.averageMatchRating,
  audience.format,audience.householdRating,audience.estimatedViewers,audience.ppvBuys]);
 if(inserted.length!==1)throw new Error("Event economics result not recorded");
 const paid=await tx.query<{promotion_id:string}>(`
  UPDATE ppw_promotions SET cash=cash+$3
  WHERE world_id=$1 AND promotion_id=$2 AND lifecycle='ACTIVE'
  RETURNING promotion_id`,
  [input.worldId,input.promotionId,quote.incrementalCash]);
 if(paid.length!==1)throw new Error("Show income promotion is not active");
 await tx.query(`
 INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
 VALUES($1,$2,$3,'SHOW_EVENT_ECONOMICS',
  jsonb_build_object('promotionId',$4::text,'showId',$5::text,
   'incrementalCash',$6::bigint,'gateRevenue',$7::bigint,
   'venueCost',$8::bigint,'productionCost',$9::bigint,
   'travelCost',$10::bigint,'appearanceFees',$11::bigint,
   'attendance',$12::integer,'eventNet',$13::bigint))`,
 [input.worldId,input.year,input.week,input.promotionId,input.showId,
  quote.incrementalCash,quote.gateRevenue,quote.venueCost,quote.productionCost,
  quote.travelCost,quote.appearanceFees,quote.attendance,quote.netResult]);
 return quote;
}
