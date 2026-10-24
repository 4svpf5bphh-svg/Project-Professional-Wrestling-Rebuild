/** Original ticket demand snapshot for a single canonical, authored card.
 * This is the demand BEFORE weekly competitor cannibalisation and seeded
 * attendance variation. It stays unchanged after the weekly World lock.
 */
import type {SqlRows} from "./world-operations.js";
import {readCardParticipants} from "../domain/card-participants.js";
import {originalExpectedDemand,originalTicketYield,
 type EventType,type TicketStrategy} from "../domain/legacy-show-economics.js";
export interface CommercialSnapshot{
 marketId:string;ticketStrategy:TicketStrategy;eventType:EventType;
 expectedDemand:number;ticketYield:number;
}
export interface CommercialSlot{payload:unknown}
export async function snapshotPreparedShowDemand(
 tx:SqlRows,worldId:string,promotionId:string,showId:string,
 slots:readonly CommercialSlot[],
 status:"DRAFT"|"SUBMITTED"="DRAFT",
):Promise<CommercialSnapshot>{
 const rows=await tx.query<{
  market_id:string|null;event_type:EventType|null;ticket_strategy:TicketStrategy|null;
  media_reach:number|null;venue_market_id:string|null;venue_status:string|null;
  capacity:number|null;audience_potential:number|null;wrestling_interest:number|null;
  spending_index:number|null;awareness:number|null;live_strength:number|null;
  loyalty:number|null;
 }>(`
 SELECT d.market_id,d.event_type,d.ticket_strategy,p.media_reach,
   v.market_id AS venue_market_id,v.status AS venue_status,v.capacity,
   m.audience_potential,m.wrestling_interest,m.spending_index,
   ps.awareness,ps.live_strength,ps.loyalty
 FROM ppw_booking_drafts d
 JOIN ppw_worlds w ON w.world_id=d.world_id AND w.show_economics_enabled
 JOIN ppw_promotions p ON p.world_id=d.world_id AND p.promotion_id=d.promotion_id
 LEFT JOIN ppw_venues v ON v.world_id=d.world_id AND v.venue_id=d.venue_id
 LEFT JOIN ppw_markets m ON m.world_id=d.world_id AND m.market_id=d.market_id
 LEFT JOIN ppw_promotion_market_states ps ON ps.world_id=d.world_id
  AND ps.promotion_id=d.promotion_id AND ps.market_id=d.market_id
 WHERE d.world_id=$1 AND d.promotion_id=$2 AND d.draft_id=$3
   AND d.status=$4`,
 [worldId,promotionId,showId,status]);
 const x=rows[0];
 if(rows.length!==1||!x||!x.market_id||!x.event_type||!x.ticket_strategy
  ||x.venue_status!=="ACTIVE"||x.venue_market_id!==x.market_id
  ||x.capacity===null||x.media_reach===null||x.audience_potential===null
  ||x.wrestling_interest===null||x.spending_index===null
  ||x.awareness===null||x.live_strength===null||x.loyalty===null)
  throw new Error("Prepared show needs an original market, event type, ticket strategy and matching active venue");
 if(slots.length<1||slots.length>100)throw new Error("Invalid booking card size");
 const ids=new Set<string>();
 for(const slot of slots)for(const person of readCardParticipants(slot.payload))ids.add(person.personId);
 if(ids.size<2||ids.size>100)throw new Error("Original booked card requires valid wrestlers");
 const people=await tx.query<{person_id:string;recognition:number|null;
   popularity:number|null;presentation:number|null}>(`
 SELECT person_id,recognition,popularity,presentation FROM ppw_people
 WHERE world_id=$1 AND person_id=ANY($2::text[])`,[worldId,[...ids].sort()]);
 if(people.length!==ids.size || people.some(p=>p.recognition===null||
  p.popularity===null||p.presentation===null))
  throw new Error("Original booking star drawing-power data missing");
 return {
  marketId:x.market_id,ticketStrategy:x.ticket_strategy,eventType:x.event_type,
  expectedDemand:originalExpectedDemand({
   promotionId,marketId:x.market_id,day:1,eventType:x.event_type,
   ticketStrategy:x.ticket_strategy,mediaReach:x.media_reach,
   market:{audiencePotential:x.audience_potential,
    wrestlingInterest:x.wrestling_interest,spendingIndex:x.spending_index},
   local:{awareness:x.awareness,liveStrength:x.live_strength,loyalty:x.loyalty},
   people:people.map(p=>({recognition:p.recognition!,popularity:p.popularity!,
    presentation:p.presentation!})),
  }),
  ticketYield:originalTicketYield(x.ticket_strategy,x.spending_index),
 };
}
