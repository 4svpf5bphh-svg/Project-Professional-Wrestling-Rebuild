/** World-only AI/delegated-staff commercial planning.
 * Executed ONCE before resource clearance; keeps the author's match card
 * and winner untouched, refuses to reprice any ready player show.
 */
import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {snapshotPreparedShowDemand} from "./prepared-show-demand.js";
import {preparedDraftFingerprint} from "../domain/prepared-show.js";
import {originalAiTicketStrategy,type EventType,type TicketStrategy,type ShowTier}
 from "../domain/legacy-show-economics.js";

export interface PrepareGeneratedShowCommerceInput{
 worldId:string;requestId:string;expectedRevision:number;
}
type Candidate={
 draft_id:string;promotion_id:string;status:string;booking_origin:string;
 booking_class:"REGULAR"|"PREMIUM";
 market_id:string|null;venue_id:string|null;event_type:EventType|null;
 ticket_strategy:TicketStrategy|null;booking_expected_demand:number|null;
 booking_ticket_yield:string|null;management_mode:string;tier:ShowTier;
 ai_financial_caution:number|null;major_event_interval_weeks:number|null;
 venue_market_id:string|null;venue_status:string|null;
 event_importance:number|null;home_market_id:string|null;
 controller_player_id:string|null;authorised_staff:boolean;
 show_day:number|null;
};

export async function prepareGeneratedWorldShowCommerce(
 pool:TransactionPool,input:PrepareGeneratedShowCommerceInput,
){
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:"system",requestId:input.requestId,
  expectedRevision:input.expectedRevision,
  commandType:"PREPARE_GENERATED_WORLD_SHOW_COMMERCE",
  execute:async tx=>{
   const worlds=await tx.query<{year:number;week:number;phase:string;
     show_economics_enabled:boolean;major_event_interval_weeks:number|null}>(`
    SELECT year,week,phase,show_economics_enabled,major_event_interval_weeks
    FROM ppw_worlds WHERE world_id=$1`,[input.worldId]);
   if(worlds.length!==1||worlds[0]!.phase!=="RESOLVING"||
    !worlds[0]!.show_economics_enabled)
    throw new Error("Original commercial preparation requires a resolving enabled World");
   const {year,week,major_event_interval_weeks:majorInterval}=worlds[0]!;
   if(majorInterval===null)throw new Error("Missing original major-event calendar cadence");
   const gates=await tx.query<{cleared:boolean;resolved:boolean;certified:boolean}>(`
    SELECT EXISTS(SELECT 1 FROM ppw_week_resource_clearances
      WHERE world_id=$1 AND year=$2 AND week=$3) AS cleared,
      EXISTS(SELECT 1 FROM ppw_show_resolutions WHERE world_id=$1
       AND resolved_week_index=$4) AS resolved,
      EXISTS(SELECT 1 FROM ppw_week_resolution_seals
       WHERE world_id=$1 AND year=$2 AND week=$3) AS certified`,
    [input.worldId,year,week,(year-1)*52+week-1]);
   if(gates.length!==1||gates[0]!.cleared||gates[0]!.resolved||gates[0]!.certified)
    throw new Error("Commercial preparation must precede World resource clearance");
   const submitted=await tx.query<Candidate>(`
    SELECT d.draft_id,d.promotion_id,d.status,d.booking_origin,d.booking_class,d.market_id,d.show_day,
      d.venue_id,d.event_type,d.ticket_strategy,d.booking_expected_demand,
      d.booking_ticket_yield::text,p.management_mode,p.tier,p.ai_financial_caution,
      w.major_event_interval_weeks,v.market_id AS venue_market_id,
      v.status AS venue_status,d.event_importance,p.home_market_id,
      c.player_id AS controller_player_id,
      EXISTS(SELECT 1 FROM ppw_week_continuity_assessments a
        JOIN ppw_staff_continuity_settings s ON s.world_id=a.world_id
          AND s.promotion_id=a.promotion_id AND s.owner_player_id=a.controller_player_id
        WHERE a.world_id=d.world_id AND a.year=d.year AND a.week=d.week
          AND a.promotion_id=d.promotion_id
          AND a.status='STAFF_FALLBACK_ELIGIBLE'
          AND s.allow_unfinished_fallback) AS authorised_staff
    FROM ppw_booking_drafts d
    JOIN ppw_worlds w ON w.world_id=d.world_id
    JOIN ppw_promotions p ON p.world_id=d.world_id
      AND p.promotion_id=d.promotion_id AND p.lifecycle='ACTIVE'
    LEFT JOIN ppw_promotion_controls c ON c.world_id=d.world_id
      AND c.promotion_id=d.promotion_id AND c.active
    LEFT JOIN ppw_venues v ON v.world_id=d.world_id AND v.venue_id=d.venue_id
    WHERE d.world_id=$1 AND d.year=$2 AND d.week=$3 AND d.status='SUBMITTED'
    ORDER BY d.promotion_id,d.booking_class DESC LIMIT 257`,
    [input.worldId,year,week]);
   if(submitted.length>256)throw new Error("World submission population exceeds bound");
   const updated:string[]=[];
   const normalEventType:EventType=((year-1)*52+week)%majorInterval===0?"MAJOR":"REGULAR";
   for(const d of submitted){
    // Premium shows carry their own calendar identity, regardless of the
    // old promotion-wide normal-show importance cadence.
    const eventType:EventType=d.booking_class==="PREMIUM"?"MAJOR":normalEventType;
    const hasSnapshot=d.booking_expected_demand!==null&&d.booking_ticket_yield!==null;
    if(hasSnapshot)continue;
    const ai=d.management_mode==="AI"&&d.controller_player_id===null;
    const staff=d.booking_origin==="STAFF_FALLBACK"&&
      d.controller_player_id!==null&&d.authorised_staff;
    if(!ai&&!staff)
     throw new Error("Missing owner-authored show commercial plan; cannot invent player choices");
    if(d.venue_status!=="ACTIVE"||!d.venue_market_id||!d.home_market_id)
     throw new Error("AI or staff show lacks a booked original venue and market");
    if(d.market_id&&d.market_id!==d.venue_market_id)
     throw new Error("Booked show market and venue disagree");
    if(d.event_type&&d.event_type!==eventType)
     throw new Error("World calendar and generated show importance disagree");
    if(d.ai_financial_caution===null)
     throw new Error("Original promotion commercial profile missing");
    const strategy=d.ticket_strategy??originalAiTicketStrategy(d.tier,eventType,
      d.ai_financial_caution);
    const wrote=await tx.query<{draft_id:string}>(`
     UPDATE ppw_booking_drafts SET market_id=$4,
       event_type=$5,ticket_strategy=$6,event_importance=$7,
       revision=revision+1
      WHERE world_id=$1 AND draft_id=$2 AND promotion_id=$3
       AND status='SUBMITTED' AND booking_expected_demand IS NULL
      RETURNING draft_id`,
      [input.worldId,d.draft_id,d.promotion_id,d.venue_market_id,
       eventType,strategy,eventType==="MAJOR"?85:58]);
    if(wrote.length!==1)throw new Error("Generated show commercial plan changed");
    const slots=await tx.query<{slot_id:string;position:number;kind:string;payload:unknown}>(`
     SELECT slot_id,position,kind,payload FROM ppw_card_slots WHERE world_id=$1 AND draft_id=$2
      ORDER BY position LIMIT 101`,[input.worldId,d.draft_id]);
    const snapshot=await snapshotPreparedShowDemand(tx,input.worldId,
      d.promotion_id,d.draft_id,slots,"SUBMITTED");
    const fingerprint=preparedDraftFingerprint({
      worldId:input.worldId,promotionId:d.promotion_id,showId:d.draft_id,
      year,week,day:d.show_day,venueId:d.venue_id,slots,commercial:snapshot});
    const complete=await tx.query<{draft_id:string}>(`
     UPDATE ppw_booking_drafts SET booking_expected_demand=$3,
      booking_ticket_yield=$4,booking_snapshot_fingerprint=$5,revision=revision+1
     WHERE world_id=$1 AND draft_id=$2 AND status='SUBMITTED'
     RETURNING draft_id`,[input.worldId,d.draft_id,
       snapshot.expectedDemand,snapshot.ticketYield,fingerprint]);
    if(complete.length!==1)throw new Error("Generated show forecast not saved");
    updated.push(d.draft_id);
   }
   if(!updated.length)throw new Error("No AI/staff shows needed commercial preparation");
   await tx.query(`
    INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
     VALUES($1,$2,$3,'GENERATED_SHOW_COMMERCIAL_PLANS',
      jsonb_build_object('count',$4::integer,'showIds',$5::text[]))`,
    [input.worldId,year,week,updated.length,updated]);
   return {year,week,preparedShows:updated};
  },
 });
}
