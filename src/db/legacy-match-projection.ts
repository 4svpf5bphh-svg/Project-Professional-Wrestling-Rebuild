import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {readCardParticipants} from "../domain/card-participants.js";
import {readCanonicalMatchLayout,requireSupportedScoringLayout} from "../domain/match-sides.js";
import {adaptBookedSinglesMatch,adaptBookedTagReadiness,
 adaptBookedMultiIndividualReadiness,
 type WrestlerSimReadiness}
  from "../simulation/booked-match-adapter.js";

export interface LegacyShowProjectionInput {
  worldId:string;promotionId:string;showId:string;
}
type Row = {
  person_id:string;status:string;booking_division:string|null;
  in_ring_quality:number|null;match_craft:number|null;
  presentation:number|null;stamina:number|null;safety:number|null;
  fatigue:number|null;wear:number|null;
};
/** Server-only read model, after worldwide clearance but before show result
 * writes. No WorldState hydration, no historical lookups, no per-wrestler SQL.
 * Strictly fails closed on missing talent skills or unsupported card types.
 */
export async function previewLegacyShowMatchStyles(pool:TransactionPool,input:LegacyShowProjectionInput){
  if(!input.worldId||!input.promotionId||!input.showId ||
    input.worldId.length>200||input.promotionId.length>200||input.showId.length>200)
    throw new Error("Invalid legacy match projection scope");
  return withWorldTransaction(pool,async tx=>{
    const show=await tx.query<{year:number;week:number;status:string}>(
      `SELECT d.year,d.week,d.status FROM ppw_booking_drafts d
         JOIN ppw_worlds w ON w.world_id=d.world_id
           AND w.year=d.year AND w.week=d.week AND w.phase='RESOLVING'
         JOIN ppw_promotions p ON p.world_id=d.world_id
           AND p.promotion_id=d.promotion_id AND p.lifecycle='ACTIVE'
         JOIN ppw_week_resource_clearances c ON c.world_id=d.world_id
           AND c.year=d.year AND c.week=d.week
        WHERE d.world_id=$1 AND d.promotion_id=$2 AND d.draft_id=$3
          AND d.status='SUBMITTED' FOR UPDATE OF w`,
      [input.worldId,input.promotionId,input.showId],
    );
    if(show.length!==1)throw new Error("A cleared and submitted resolving show is required");
    const slots=await tx.query<{slot_id:string;position:number;kind:string;payload:unknown}>(
      `SELECT slot_id,position,kind,payload FROM ppw_card_slots
       WHERE world_id=$1 AND draft_id=$2 ORDER BY position LIMIT 101`,
      [input.worldId,input.showId],
    );
    if(slots.length===0||slots.length>100)throw new Error("Invalid card length for match projection");
    const matches=slots.filter(slot=>slot.kind==="MATCH");
    if(!matches.length)throw new Error("Show has no matches to project");
    const ids=new Set<string>();
    for(const slot of matches){
      const participants=readCardParticipants(slot.payload);
      const layout=readCanonicalMatchLayout(slot.payload);
      requireSupportedScoringLayout(layout);
      for(const p of participants)ids.add(p.personId);
    }
    if(ids.size>100)throw new Error("Too many projected wrestler identities");
    const people=await tx.query<Row>(
      `SELECT person_id,status,booking_division,in_ring_quality,match_craft,
         presentation,stamina,safety,fatigue,wear FROM ppw_people
         WHERE world_id=$1 AND person_id=ANY($2::text[])`,
      [input.worldId,[...ids].sort()],
    );
    if(people.length!==ids.size)throw new Error("Missing World-scoped wrestler profile");
    const talents=new Map<string,WrestlerSimReadiness>();
    const divisions=new Map<string,string>();
    for(const p of people){
      if(p.status!=="ACTIVE")throw new Error("Inactive wrestler cannot be evaluated");
      if(p.booking_division!=="MEN"&&p.booking_division!=="WOMEN")
        throw new Error("Missing canonical wrestler booking division");
      const numerical=[
        p.in_ring_quality,p.match_craft,p.presentation,p.stamina,p.safety,p.fatigue,p.wear,
      ];
      if(numerical.some(n=>typeof n!=="number"||!Number.isFinite(n)||n<0||n>100))
        throw new Error("Missing or invalid original PPW wrestler skills");
      const [inRingQuality,matchCraft,presentation,stamina,safety,fatigue,wear]=
        numerical as [number,number,number,number,number,number,number];
      talents.set(p.person_id,{skills:{inRingQuality,matchCraft,presentation,stamina,safety},fatigue,wear});
      divisions.set(p.person_id,p.booking_division);
    }
    const projections=matches.map(slot=>{
      const layout=readCanonicalMatchLayout(slot.payload);
      const identities=layout.participants.map(x=>x.personId);
      if(new Set(identities.map(id=>divisions.get(id))).size!==1)
        throw new Error("Mixed booking divisions are not supported");
      const format=requireSupportedScoringLayout(layout);
      if(format==="TRIPLE_THREAT"||format==="FOUR_WAY"){
       const match=adaptBookedMultiIndividualReadiness(slot.payload,talents);
       return {slotId:slot.slot_id,position:slot.position,...match};
      }
      if(format==="TAG"){
        const match=adaptBookedTagReadiness(slot.payload,talents);
        return {slotId:slot.slot_id,position:slot.position,...match};
      }
      const match=adaptBookedSinglesMatch(slot.payload,talents);
      return {slotId:slot.slot_id,position:slot.position,...match};
    });
    return {worldId:input.worldId,year:show[0]!.year,week:show[0]!.week,
      showId:input.showId,promotionId:input.promotionId,
      matchCount:projections.length,projections};
  });
}
