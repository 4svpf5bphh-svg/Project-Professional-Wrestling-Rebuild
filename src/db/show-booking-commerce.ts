import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {withSqlClient} from "./postgres.js";
import type {TicketStrategy} from "../domain/legacy-show-economics.js";
export interface SetCommercialPlanInput {
 worldId:string;playerId:string;promotionId:string;showId:string;
 requestId:string;expectedRevision:number;
 marketId:string;venueId:string;ticketStrategy:TicketStrategy;
}
export async function chooseShowMarketAndTickets(pool:TransactionPool,input:SetCommercialPlanInput){
 if([input.promotionId,input.showId,input.marketId,input.venueId]
   .some(s=>typeof s!=="string"||!s.trim()||s.length>200)
   ||!["ACCESSIBLE","STANDARD","PREMIUM","PRESTIGE"].includes(input.ticketStrategy))
  throw new Error("Invalid show commercial selection");
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,requiresOpenWeek:true,
  commandType:"CHOOSE_SHOW_MARKET_AND_TICKETS",
  execute:async tx=>{
   const owned=await tx.query<{draft_id:string}>(`
    SELECT d.draft_id FROM ppw_booking_drafts d
    JOIN ppw_worlds w ON w.world_id=d.world_id
      AND w.show_economics_enabled AND w.year=d.year AND w.week=d.week
    JOIN ppw_promotions p ON p.world_id=d.world_id AND p.promotion_id=d.promotion_id
    JOIN ppw_promotion_controls c ON c.world_id=d.world_id AND c.promotion_id=d.promotion_id
      AND c.player_id=$4 AND c.active
    JOIN ppw_memberships member ON member.world_id=c.world_id AND member.player_id=c.player_id
      AND member.status='ACTIVE'
    WHERE d.world_id=$1 AND d.draft_id=$2 AND d.promotion_id=$3
      AND d.status='DRAFT' AND p.lifecycle='ACTIVE'`,
    [input.worldId,input.showId,input.promotionId,input.playerId]);
   if(owned.length!==1)throw new Error("Editable show not owned by this player");
   const venue=await tx.query<{venue_id:string}>(`
    SELECT v.venue_id FROM ppw_venues v
    JOIN ppw_promotion_market_states s ON s.world_id=v.world_id
      AND s.market_id=v.market_id AND s.promotion_id=$3
    WHERE v.world_id=$1 AND v.venue_id=$2 AND v.market_id=$4
      AND v.status='ACTIVE' AND v.capacity IS NOT NULL AND v.weekly_hire_cost IS NOT NULL`,
    [input.worldId,input.venueId,input.promotionId,input.marketId]);
   if(venue.length!==1)throw new Error("Venue and market must match an active original territory");
   const changed=await tx.query<{draft_id:string}>(`
    UPDATE ppw_booking_drafts SET market_id=$4,venue_id=$5,ticket_strategy=$6,
     booking_expected_demand=NULL,booking_ticket_yield=NULL,
     booking_snapshot_fingerprint=NULL,
     lock_ready_fingerprint=NULL,lock_ready_by_player_id=NULL,revision=revision+1
    WHERE world_id=$1 AND draft_id=$2 AND promotion_id=$3
      AND status='DRAFT' RETURNING draft_id`,
    [input.worldId,input.showId,input.promotionId,input.marketId,
     input.venueId,input.ticketStrategy]);
   if(changed.length!==1)throw new Error("Show changed during market selection");
   return {showId:input.showId,marketId:input.marketId,
    venueId:input.venueId,ticketStrategy:input.ticketStrategy};
  },
 });
}
/** Venue choices for one verified controller, with optional keyset cursor.
 * No World snapshot or full market history is ever returned. */
export async function readShowMarketOptions(
 pool:TransactionPool,worldId:string,playerId:string,promotionId:string,
 afterVenueId:string|null=null,limit=25,
){
 if([worldId,playerId,promotionId].some(s=>!s||s.length>200)
  ||(afterVenueId!==null&&(!afterVenueId||afterVenueId.length>200))
  ||!Number.isInteger(limit)||limit<1||limit>50)
  throw new Error("Invalid venue options request");
 return withSqlClient(pool,async tx=>{
  const valid=await tx.query<{promotion_id:string}>(`
   SELECT p.promotion_id FROM ppw_promotions p
   JOIN ppw_worlds w ON w.world_id=p.world_id AND w.show_economics_enabled
   JOIN ppw_promotion_controls c ON c.world_id=p.world_id AND c.promotion_id=p.promotion_id
     AND c.player_id=$2 AND c.active
   JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
     AND m.status='ACTIVE'
   WHERE p.world_id=$1 AND p.promotion_id=$3 AND p.lifecycle='ACTIVE'`,
   [worldId,playerId,promotionId]);
  if(valid.length!==1)throw new Error("Promotion access denied");
  return tx.query<{market_id:string;market_name:string;venue_id:string;
   venue_name:string;capacity:number;weekly_hire_cost:string;
   awareness:number;live_strength:number;loyalty:number}>(`
   SELECT m.market_id,m.name AS market_name,v.venue_id,v.name AS venue_name,
    v.capacity,v.weekly_hire_cost,s.awareness,s.live_strength,s.loyalty
   FROM ppw_venues v
   JOIN ppw_markets m ON m.world_id=v.world_id AND m.market_id=v.market_id
   JOIN ppw_promotion_market_states s ON s.world_id=v.world_id
    AND s.market_id=v.market_id AND s.promotion_id=$2
   WHERE v.world_id=$1 AND v.status='ACTIVE'
    AND v.venue_id>COALESCE($3::text,'')
   ORDER BY v.venue_id LIMIT $4`,
   [worldId,promotionId,afterVenueId,limit]);
 });
}
