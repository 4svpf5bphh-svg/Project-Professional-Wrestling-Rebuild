/** MANUAL, OPT-IN historical correction for a previously certified, wrongly
 * unawarded vacant three-person LADDER title. Never called by API, migration,
 * page load, World Lock or cron. Built only from immutable certified evidence.
 * An operator must explicitly use APPLY after inspecting a PREVIEW.
 */
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {validateCompletedShowReceipt,type CompletedShowReceipt}
 from "../domain/completed-show-receipt.js";
import {readCanonicalMatchLayout,requireSupportedScoringLayout}
 from "../domain/match-sides.js";
export interface VerifiedVacantLadderRepair {
 worldId:string;promotionId:string;championshipId:string;
 showId:string;slotId:string;winnerPersonId:string;year:number;week:number;
 mode:"PREVIEW"|"APPLY";
}
export type VerifiedVacantLadderRepairResult=
 "ELIGIBLE"|"APPLIED"|"ALREADY_CORRECT";
const name=(v:string)=>typeof v==="string"&&v.trim().length>0&&v.length<=200;
export async function reconcileVerifiedVacantLadderTitle(
 pool:TransactionPool,input:VerifiedVacantLadderRepair,
):Promise<VerifiedVacantLadderRepairResult>{
 if(![input.worldId,input.promotionId,input.championshipId,input.showId,
      input.slotId,input.winnerPersonId].every(name)||
   !Number.isSafeInteger(input.year)||input.year<1||
   !Number.isSafeInteger(input.week)||input.week<1||input.week>52||
   !["PREVIEW","APPLY"].includes(input.mode))
  throw new Error("Invalid historical title reconciliation scope");
 return withWorldTransaction(pool,async tx=>{
  // World first, then title: same lock order as normal show settlement.
  const clock=await tx.query<{year:number;week:number;phase:string;
   revision:number}>(`SELECT year,week,phase,revision FROM ppw_worlds
    WHERE world_id=$1 FOR UPDATE`,[input.worldId]);
  const now=clock[0];
  const completedWeek=(input.year-1)*52+input.week-1;
  if(clock.length!==1||!now||now.phase!=="OPEN"||
   (now.year-1)*52+now.week-1<=completedWeek)
   throw new Error("Historical title repair requires a later open World week");
  const title=await tx.query<{division:string;status:string;
   current_reign_id:string|null}>(`
   SELECT division,status,current_reign_id FROM ppw_championships
   WHERE world_id=$1 AND promotion_id=$2 AND championship_id=$3
   FOR UPDATE`,[input.worldId,input.promotionId,input.championshipId]);
  if(title.length!==1||title[0]!.division!=="SINGLES"||
   title[0]!.status!=="ACTIVE")
   throw new Error("Historical correction requires an active singles title");
  const nextId=input.showId+":"+input.slotId+":new-reign";
  const existing=await tx.query<{reign_id:string;person_id:string|null;
   status:string;holder_type:string}>(`
   SELECT reign_id,person_id,status,holder_type
   FROM ppw_championship_reigns
   WHERE world_id=$1 AND promotion_id=$2 AND championship_id=$3
   LIMIT 2`,[input.worldId,input.promotionId,input.championshipId]);
  const verified=await tx.query<{year:number;week:number;receipt_json:unknown;
   status:string;kind:string;payload:unknown;actual_finish:string;
   actual_winner_side:string|null;winner_person_id:string|null;
   prior_reign_id:string|null;title_changed:boolean}>(`
   SELECT finished.year,finished.week,finished.receipt_json,
    draft.status,slot.kind,slot.payload,bout.actual_finish,
    bout.actual_winner_side,contest.winner_person_id,
    contest.prior_reign_id,contest.title_changed
   FROM ppw_completed_shows finished
   JOIN ppw_booking_drafts draft ON draft.world_id=finished.world_id
    AND draft.draft_id=finished.show_id
    AND draft.promotion_id=finished.promotion_id
   JOIN ppw_card_slots slot ON slot.world_id=finished.world_id
    AND slot.draft_id=finished.show_id AND slot.slot_id=$5
   JOIN ppw_completed_show_matches bout ON bout.world_id=finished.world_id
    AND bout.show_id=finished.show_id AND bout.match_id=slot.slot_id
   JOIN ppw_championship_contests contest
    ON contest.world_id=finished.world_id
    AND contest.promotion_id=finished.promotion_id
    AND contest.show_id=finished.show_id AND contest.slot_id=slot.slot_id
    AND contest.championship_id=$3
   WHERE finished.world_id=$1 AND finished.promotion_id=$2
    AND finished.show_id=$4`,
   [input.worldId,input.promotionId,input.championshipId,input.showId,input.slotId]);
  const row=verified[0];
  if(verified.length!==1||!row||row.year!==input.year||
   row.week!==input.week||row.status!=="SUBMITTED"||
   row.kind!=="MATCH"||row.actual_finish!=="RETRIEVAL"||
   row.winner_person_id!==input.winnerPersonId||
   row.prior_reign_id!==null)
   throw new Error("Historical title correction does not match the certified contest");
  const receipt=validateCompletedShowReceipt(row.receipt_json as CompletedShowReceipt);
  const bout=receipt.matches.find(m=>m.matchId===input.slotId);
  if(receipt.worldId!==input.worldId||receipt.promotionId!==input.promotionId||
   receipt.showId!==input.showId||receipt.year!==input.year||
   receipt.week!==input.week||!bout||
   bout.actualFinish!=="RETRIEVAL"||
   bout.actualWinnerSide!==row.actual_winner_side)
   throw new Error("Historical title correction conflicts with saved World receipt");
  const p=row.payload as Record<string,unknown>;
  const layout=readCanonicalMatchLayout(row.payload);
  const winner=layout.sides.find(s=>s.sideId===row.actual_winner_side)
   ?.participants[0]?.personId;
  if(requireSupportedScoringLayout(layout)!=="TRIPLE_THREAT"||
   layout.ruleset!=="STANDARD"||
   p.stipulation!=="LADDER"||p.plannedFinish!=="RETRIEVAL"||
   p.championshipId!==input.championshipId||
   layout.scriptedWinnerSide!==row.actual_winner_side||
   winner!==input.winnerPersonId)
   throw new Error("Historical title correction has non-matching ladder booking");
  const contests=await tx.query<{show_id:string;slot_id:string}>(`
   SELECT show_id,slot_id FROM ppw_championship_contests
   WHERE world_id=$1 AND promotion_id=$2 AND championship_id=$3
   ORDER BY show_id LIMIT 2`,
   [input.worldId,input.promotionId,input.championshipId]);
  if(contests.length!==1||contests[0]!.show_id!==input.showId||
   contests[0]!.slot_id!==input.slotId)
   throw new Error("Subsequent title history prevents historical correction");
  if(row.title_changed){
   if(existing.length===1&&existing[0]!.reign_id===nextId&&
    existing[0]!.person_id===input.winnerPersonId&&
    existing[0]!.status==="ACTIVE"&&existing[0]!.holder_type==="PERSON"&&
    title[0]!.current_reign_id===nextId)return "ALREADY_CORRECT";
   throw new Error("Historical title outcome already changed incompatibly");
  }
  if(existing.length||title[0]!.current_reign_id!==null)
   throw new Error("A title lineage already exists; no safe retroactive award");
  if(input.mode==="PREVIEW")return "ELIGIBLE";
  // The one genuine winning finish is already certified; change only the
  // previously omitted reign and contest record, not the immutable show.
  await tx.query(`
   INSERT INTO ppw_championship_reigns(
    world_id,promotion_id,championship_id,reign_id,
    holder_type,person_id,status,start_week_index)
   VALUES($1,$2,$3,$4,'PERSON',$5,'ACTIVE',$6)`,
   [input.worldId,input.promotionId,input.championshipId,nextId,
    input.winnerPersonId,completedWeek]);
  const titleUpdate=await tx.query<{championship_id:string}>(`
   UPDATE ppw_championships SET current_reign_id=$4
   WHERE world_id=$1 AND promotion_id=$2 AND championship_id=$3
    AND current_reign_id IS NULL RETURNING championship_id`,
   [input.worldId,input.promotionId,input.championshipId,nextId]);
  const contestUpdate=await tx.query<{slot_id:string}>(`
   UPDATE ppw_championship_contests SET title_changed=true
   WHERE world_id=$1 AND promotion_id=$2 AND championship_id=$3
    AND show_id=$4 AND slot_id=$5 AND winner_person_id=$6
    AND prior_reign_id IS NULL AND title_changed=false
   RETURNING slot_id`,
   [input.worldId,input.promotionId,input.championshipId,input.showId,
    input.slotId,input.winnerPersonId]);
  if(titleUpdate.length!==1||contestUpdate.length!==1)
   throw new Error("Historical title repair collided with another World change");
  await tx.query(`
   INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   VALUES($1,$2,$3,'HISTORICAL_LADDER_TITLE_RECONCILED',
    jsonb_build_object('showId',$4::text,'slotId',$5::text,
     'championshipId',$6::text,'winnerPersonId',$7::text))`,
   [input.worldId,input.year,input.week,input.showId,input.slotId,
    input.championshipId,input.winnerPersonId]);
  await tx.query(`
   UPDATE ppw_worlds SET revision=revision+1 WHERE world_id=$1`,
   [input.worldId]);
  return "APPLIED";
 });
}
