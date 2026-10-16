/** Trusted resolver-only transaction writer. Caller MUST compute the receipt
 * server-side from canonical submitted card; never expose this as player API.
 */
import {createHash} from "node:crypto";
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {canonicalCompletedShowReceipt,type CompletedShowReceipt}
 from "../domain/completed-show-receipt.js";
export async function recordCompletedShow(
 pool:TransactionPool,receipt:CompletedShowReceipt,
):Promise<"RECORDED"|"IDENTICAL_RETRY">{
 const canonical=canonicalCompletedShowReceipt(receipt);
 const digest=createHash("sha256").update(canonical).digest("hex");
 return withWorldTransaction(pool,async tx=>{
  const world=await tx.query<{year:number;week:number;phase:string}>(
   "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1 FOR UPDATE",
   [receipt.worldId]);
  if(world.length!==1||world[0]!.phase!=="RESOLVING"||
   world[0]!.year!==receipt.year||world[0]!.week!==receipt.week)
   throw new Error("World is not resolving the requested week");
  const prior=await tx.query<{receipt_digest:string;receipt_json:unknown}>(
   "SELECT receipt_digest,receipt_json FROM ppw_completed_shows WHERE world_id=$1 AND show_id=$2",
   [receipt.worldId,receipt.showId]);
  if(prior.length){
   if(prior.length!==1||prior[0]!.receipt_digest!==digest||
    JSON.stringify(prior[0]!.receipt_json)!==JSON.stringify(JSON.parse(canonical)))
    throw new Error("Conflicting completed show resolution");
   return "IDENTICAL_RETRY";
  }
  const show=await tx.query<{draft_id:string}>(
   `SELECT draft_id FROM ppw_booking_drafts
     WHERE world_id=$1 AND promotion_id=$2 AND draft_id=$3
       AND year=$4 AND week=$5 AND status='SUBMITTED' FOR UPDATE`,
   [receipt.worldId,receipt.promotionId,receipt.showId,receipt.year,receipt.week]);
  if(show.length!==1)throw new Error("Show is not a canonical submitted card");
  const slots=await tx.query<{slot_id:string;position:number;kind:string;payload:unknown}>(
   `SELECT slot_id,position,kind,payload FROM ppw_card_slots
     WHERE world_id=$1 AND draft_id=$2 ORDER BY position FOR SHARE`,
   [receipt.worldId,receipt.showId]);
  const expected=[...receipt.matches.map(m=>({slot_id:m.matchId,
   position:m.position,kind:"MATCH"})),
   ...receipt.segments.map(s=>({slot_id:s.slotId,
   position:s.position,kind:"SEGMENT"}))]
   .sort((a,b)=>a.position-b.position);
  if(slots.length!==expected.length||slots.some((slot,i)=>
    slot.slot_id!==expected[i]!.slot_id||
    slot.position!==expected[i]!.position||
    slot.kind!==expected[i]!.kind))
   throw new Error("Completed show receipt does not match submitted card");
  // A submitted segment cannot become a different angle in the results.\n  const segmentKinds=new Map(receipt.segments.map(s=>[s.slotId,s.kind]));\n  if(slots.some(slot=>slot.kind==="SEGMENT"&&\n    slot.payload!==null&&typeof slot.payload==="object"&&\n    !Array.isArray(slot.payload)&&\n    typeof (slot.payload as Record<string,unknown>).kind==="string"&&\n    (slot.payload as Record<string,unknown>).kind!==segmentKinds.get(slot.slot_id)))\n   throw new Error("Completed segment kind differs from submitted card");\n  await tx.query(\n   `INSERT INTO ppw_completed_shows
     (world_id,promotion_id,show_id,year,week,resolution_id,
      crowd_response,receipt_json,receipt_digest)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
   [receipt.worldId,receipt.promotionId,receipt.showId,receipt.year,receipt.week,
    receipt.resolutionId,receipt.crowdResponse,canonical,digest]);
  for(const m of receipt.matches)await tx.query(
   `INSERT INTO ppw_completed_show_matches
    (world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,
   [receipt.worldId,receipt.showId,m.matchId,m.position,m.crowdResponse,
    m.actualFinish,m.actualWinnerSide]);
  for(const s of receipt.segments)await tx.query(
   `INSERT INTO ppw_completed_show_segments
    (world_id,show_id,slot_id,position,kind,authored_outcome,crowd_response)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,
   [receipt.worldId,receipt.showId,s.slotId,s.position,s.kind,s.outcome,
    s.crowdResponse]);
  return "RECORDED";
 });
}
