/** A player asks their exclusive broadcaster to move its recurring TV night.
 * One negotiated day change per signed term. An accepted request is a
 * server-authoritative, revision-locked World command; a second request
 * cannot silently rewrite the agreement or dodge broadcaster expectations.
 */
import {applyWorldCommand} from "./world-commands.js";
import type {TransactionPool} from "./transaction.js";
export interface BroadcastDayRequest{
 worldId:string;promotionId:string;playerId:string;
 requestId:string;expectedRevision:number;dealId:string;requestedDay:number;
}
const names=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
export async function requestBroadcastDay(pool:TransactionPool,input:BroadcastDayRequest){
 if(![input.worldId,input.promotionId,input.playerId,input.requestId,input.dealId]
  .every(v=>typeof v==="string"&&v.length>0&&v.length<=200)||
  !Number.isInteger(input.requestedDay)||input.requestedDay<1||input.requestedDay>7)
  throw new Error("Invalid network schedule request");
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"REQUEST_BROADCAST_DAY",requiresOpenWeek:true,
  execute:async tx=>{
   const signed=await tx.query<{
    deal_id:string;offer_code:string;airing_day:number|null;
    airing_hour:number|null;start_week_index:number;end_week_index:number;
    year:number;week:number;
   }>(`
    SELECT d.deal_id,d.offer_code,d.airing_day,d.airing_hour,
     d.start_week_index,d.end_week_index,w.year,w.week
    FROM ppw_commercial_deals d
    JOIN ppw_worlds w ON w.world_id=d.world_id
    JOIN ppw_promotion_controls c ON c.world_id=d.world_id
     AND c.promotion_id=d.promotion_id AND c.player_id=$3 AND c.active
    JOIN ppw_memberships m ON m.world_id=d.world_id
     AND m.player_id=c.player_id AND m.status='ACTIVE'
    WHERE d.world_id=$1 AND d.promotion_id=$2 AND d.deal_id=$4
     AND d.kind='BROADCAST' AND d.status='ACTIVE'
    LIMIT 1`,[input.worldId,input.promotionId,input.playerId,input.dealId]);
   if(signed.length!==1)throw new Error("Only your active broadcaster can approve a change");
   const s=signed[0]!,now=(s.year-1)*52+s.week-1;
   if(now<s.start_week_index||now>s.end_week_index)
    throw new Error("Broadcast agreement is outside its active term");
   if(input.requestedDay===s.airing_day)
    throw new Error("That is already your contracted television day");
   const before=await tx.query<{event_id:string}>(`
    SELECT event_id::text FROM ppw_ledger_events
    WHERE world_id=$1 AND event_type='BROADCAST_SLOT_CHANGED'
      AND payload->>'dealId'=$2 LIMIT 1`,[input.worldId,input.dealId]);
   if(before.length)throw new Error("Your network already approved one day change on this agreement");
   const blocked=await tx.query<{draft_id:string}>(`
    SELECT draft_id FROM ppw_booking_drafts
    WHERE world_id=$1 AND promotion_id=$2
     AND (year-1)*52+week-1 BETWEEN $3 AND $4
     AND status IN ('DRAFT','SUBMITTED') AND show_day=$5
     AND booking_class='PREMIUM'
    UNION ALL
    SELECT draft_id FROM ppw_booking_drafts
    WHERE world_id=$1 AND promotion_id=$2
     AND (year-1)*52+week-1 BETWEEN $3 AND $4
     AND status='SUBMITTED' AND booking_class='REGULAR'
     AND show_day IS NOT NULL AND show_day<>$5
    LIMIT 1`,[input.worldId,input.promotionId,now,s.end_week_index,input.requestedDay]);
   if(blocked.length)throw new Error(
    "A booked PPV or submitted TV show conflicts with "+names[input.requestedDay-1]+
    ". Adjust that schedule or request the new day after the next World advance.");
   const changed=await tx.query<{deal_id:string}>(`
    UPDATE ppw_commercial_deals SET airing_day=$4
    WHERE world_id=$1 AND deal_id=$2 AND promotion_id=$3 AND status='ACTIVE'
    RETURNING deal_id`,[input.worldId,input.dealId,input.promotionId,input.requestedDay]);
   if(changed.length!==1)throw new Error("Network agreement changed before approval");
   // Move the player's unsubmitted TV drafts with the approved slot, while
   // clearing any stale readiness or attendance estimates. PPV days stay put.
   const drafts=await tx.query<{draft_id:string}>(`
    UPDATE ppw_booking_drafts
    SET show_day=$4,lock_ready_by_player_id=NULL,
     lock_ready_fingerprint=NULL,booking_expected_demand=NULL,
     booking_ticket_yield=NULL,booking_snapshot_fingerprint=NULL,
     revision=revision+1
    WHERE world_id=$1 AND promotion_id=$2 AND booking_class='REGULAR'
     AND status='DRAFT' AND show_day IS NOT NULL
     AND (year-1)*52+week-1 BETWEEN $3 AND $5
    RETURNING draft_id`,[input.worldId,input.promotionId,now,
     input.requestedDay,s.end_week_index]);
   await tx.query(`
    INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
    VALUES($1,$2,$3,'BROADCAST_SLOT_CHANGED',
     jsonb_build_object('promotionId',$4::text,'dealId',$5::text,
      'oldDay',$6::integer,'newDay',$7::integer,
      'effectiveWeekIndex',$8::integer,'adjustedDrafts',$9::integer))`,
    [input.worldId,s.year,s.week,input.promotionId,input.dealId,
     s.airing_day,input.requestedDay,now,drafts.length]);
   return {accepted:true,dealId:input.dealId,oldDay:s.airing_day,
    airingDay:input.requestedDay,airingHour:s.airing_hour,
    movedDrafts:drafts.length,networkResponse:"Your network approved "+
     names[input.requestedDay-1]+" as your new recurring TV day."};
  }});
}
