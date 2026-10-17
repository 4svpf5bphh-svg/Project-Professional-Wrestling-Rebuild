/** Trusted resolver-only transaction writer. Caller MUST compute the receipt
 * server-side from canonical submitted card; never expose this as player API.
 */
import {createHash} from "node:crypto";
import type {SegmentResult} from "../domain/segment-results.js";
import type {SegmentConsequenceIntent} from "../domain/segment-consequences.js";
export interface CompletedSegmentStory extends SegmentResult{
 intent:SegmentConsequenceIntent|null;
}
/** PostgreSQL jsonb reorders object keys; compare JSON semantic values on
 * retries, while the original deterministic digest protects write identity.
 */
const stableJson=(value:unknown):string=>JSON.stringify(value,(_key,v)=>
 v&&typeof v==="object"&&!Array.isArray(v)?
  Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b,"en"))):v);
import {readCanonicalMatchLayout,requireSupportedScoringLayout}
 from "../domain/match-sides.js";
import type {BookedTeamOutcome} from "../domain/verified-team-evidence.js";
import type {BookedMultiIndividualOutcome} from "../domain/verified-multi-individual.js";
import type {BookedSinglesOutcome} from "../domain/verified-match-evidence.js";
import {validateCompletedMatchEvidence,type CompletedMatchEvidence}
 from "../domain/completed-match-evidence.js";
import type {TransactionPool} from "./transaction.js";
import type {SqlRows} from "./world-operations.js";
import {withWorldTransaction} from "./transaction.js";
import {canonicalCompletedShowReceipt,type CompletedShowReceipt}
 from "../domain/completed-show-receipt.js";
export async function recordCompletedShow(
 pool:TransactionPool,receipt:CompletedShowReceipt,
 evidence:readonly CompletedMatchEvidence[] = [],
):Promise<"RECORDED"|"IDENTICAL_RETRY">{
 return withWorldTransaction(pool,tx=>recordCompletedShowInTransaction(tx,receipt,evidence));
}
export async function recordCompletedShowInTransaction(
 tx:SqlRows,receipt:CompletedShowReceipt,
 evidence:readonly CompletedMatchEvidence[] = [],
 stories:readonly CompletedSegmentStory[] = [],
):Promise<"RECORDED"|"IDENTICAL_RETRY">{
 const canonical=canonicalCompletedShowReceipt(receipt);
 validateCompletedMatchEvidence(receipt,evidence);
 const evidenceByMatch=new Map(evidence.map(e=>[e.matchId,e]));
 const storyBySlot=new Map(stories.map(s=>[s.slotId,s]));
 if(storyBySlot.size!==stories.length||
  (stories.length!==0&&stories.length!==receipt.segments.length))
  throw new Error("Segment narratives do not match the resolved card");
 for(const row of receipt.segments){
  const story=storyBySlot.get(row.slotId);
  if(stories.length&&(!story||story.position!==row.position||
   story.kind!==row.kind||story.outcome!==row.outcome||
   story.actorIds.length>20||story.targetIds.length>20||
   typeof story.headline!=="string"||story.headline.length>200||
   typeof story.summary!=="string"||story.summary.length>1200))
   throw new Error("Conflicting authored segment narrative");
 }
 const evidenceCanonical=JSON.stringify([...evidence].sort((a,b)=>
  a.matchId.localeCompare(b.matchId)));
 const digest=createHash("sha256").update(canonical).update("\\0")
  .update(evidenceCanonical).digest("hex");
 {
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
    stableJson(prior[0]!.receipt_json)!==stableJson(JSON.parse(canonical)))
    throw new Error("Conflicting completed show resolution");
   const saved=await tx.query<{match_id:string;evidence_json:unknown}>(
    "SELECT match_id,evidence_json FROM ppw_completed_match_evidence WHERE world_id=$1 AND show_id=$2 ORDER BY match_id",
    [receipt.worldId,receipt.showId]);
   if(stableJson(saved.map(x=>x.evidence_json))!==
    stableJson([...evidence].sort((a,b)=>a.matchId.localeCompare(b.matchId))))
    throw new Error("Conflicting completed match evidence");
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
  // A submitted segment cannot become a different angle in the results.
  const segmentKinds=new Map(receipt.segments.map(s=>[s.slotId,s.kind]));
  if(slots.some(slot=>slot.kind==="SEGMENT"&&
    slot.payload!==null&&typeof slot.payload==="object"&&
    !Array.isArray(slot.payload)&&
    typeof (slot.payload as Record<string,unknown>).kind==="string"&&
    (slot.payload as Record<string,unknown>).kind!==segmentKinds.get(slot.slot_id)))
   throw new Error("Completed segment kind differs from submitted card");
  // Validate known canonical booking fields; legacy optional fields are not
  // interpreted as evidence when absent. Resolver must enforce full schema.
  const matchResults=new Map(receipt.matches.map(m=>[m.matchId,m]));
  const segmentResults=new Map(receipt.segments.map(x=>[x.slotId,x]));
  for(const slot of slots){
   const raw=slot.payload;
   if(!raw||typeof raw!=="object"||Array.isArray(raw))
    throw new Error("Invalid canonical submitted slot payload");
   const p=raw as Record<string,unknown>;
   if(slot.kind==="MATCH"){
    const result=matchResults.get(slot.slot_id)!;
    // Historical receipt-only fixtures may lack complete optional booking
    // metadata. A typed card, however, must ALWAYS pass complete side proof.
    const typed=p.matchType!==undefined||p.sides!==undefined;
    const layout=typed?readCanonicalMatchLayout(raw):null;
    const format=layout?requireSupportedScoringLayout(layout):null;
    if(format==="SINGLES"){
     if(!Array.isArray(p.participants)||p.participants.length!==2||
      p.participants.some(x=>!x||typeof x!=="object"||
       typeof (x as Record<string,unknown>).personId!=="string")||
      (p.participants[0] as {personId:string}).personId===
       (p.participants[1] as {personId:string}).personId)
      throw new Error("Invalid canonical singles participants");
     if(typeof p.scriptedWinner==="string"){
      const a=(p.participants[0] as {personId:string}).personId;
      const b=(p.participants[1] as {personId:string}).personId;
      const booked=p.scriptedWinner===a?"A":p.scriptedWinner===b?"B":null;
      if(!booked||result.actualWinnerSide!==booked&&
       !(evidenceByMatch.has(slot.slot_id)&&result.actualFinish==="INJURY_STOPPAGE"))
       throw new Error("Completed winner differs from submitted booking");
     }
    }
    const ev=evidenceByMatch.get(slot.slot_id);
    if(format==="TRIPLE_THREAT"||format==="FOUR_WAY"||
       format==="BATTLE_ROYAL"){
      if(!ev||!("family" in ev.booking)||ev.booking.family!=="INDIVIDUAL")
       throw new Error("Verified multi-person winner evidence required");
      const book=ev.booking as BookedMultiIndividualOutcome;
      if(JSON.stringify(book.participants)!==
       JSON.stringify(layout!.participants.map(x=>x.personId))||
       book.scriptedWinnerSide!==layout!.scriptedWinnerSide||
       book.plannedFinish!==p.plannedFinish||
       (book.ruleset??"STANDARD")!==layout!.ruleset||
       JSON.stringify(book.eliminationOrder??[])!==
        JSON.stringify(layout!.eliminationOrder))
       throw new Error("Multi-person result differs from submitted card");
      continue;
    }
    if(format==="TAG"||format==="MULTI_TEAM"){
      if(!ev||!("family" in ev.booking)||ev.booking.family!=="TEAMS")
       throw new Error("Authoritative tag evidence required for every four-person match");
      const booking=ev.booking as BookedTeamOutcome;
      if(JSON.stringify(booking.sides)!==JSON.stringify(layout!.sides.map(side=>({
        sideId:side.sideId,participants:side.participants.map(x=>x.personId)})))||
       booking.scriptedWinnerSide!==layout!.scriptedWinnerSide||
       booking.plannedFinish!==p.plannedFinish||
       (booking.ruleset??"STANDARD")!==layout!.ruleset||
       JSON.stringify(booking.eliminationOrder??[])!==
        JSON.stringify(layout!.eliminationOrder)||
       booking.interferencePlannedOutcome!==
         ((p.interference as {plannedOutcome?:string}|undefined)?.plannedOutcome))
       throw new Error("Completed tag evidence differs from the authored sides");
      if(result.actualFinish!==booking.plannedFinish&&
       result.actualFinish!=="INJURY_STOPPAGE"&&
       result.actualFinish!=="PROTECTED_FINISH")
       throw new Error("Completed tag finish differs from authored match");
      continue;
    }
    const exceptional=result.actualFinish==="INJURY_STOPPAGE"||
     result.actualFinish==="PROTECTED_FINISH";
    if(exceptional&&!ev)
     throw new Error("Exceptional finish requires authoritative evidence");
    if(ev){
     if(p.matchType!=="SINGLES"||!Array.isArray(p.participants)||
      p.participants.length!==2||typeof p.scriptedWinner!=="string"||
      typeof p.plannedFinish!=="string")
      throw new Error("Evidence requires complete canonical singles booking");
     const participants=p.participants as {personId:string}[];
     if("family" in ev.booking)throw new Error("Team evidence on a singles match");
     const singles=ev.booking as BookedSinglesOutcome;
     if(JSON.stringify(singles.participants)!==
       JSON.stringify(participants.map(x=>x.personId))||
      singles.scriptedWinner!==p.scriptedWinner||
      singles.plannedFinish!==p.plannedFinish||
      singles.interferencePlannedOutcome!==
       ((p.interference as {plannedOutcome?:string}|undefined)?.plannedOutcome))
      throw new Error("Evidence differs from canonical submitted booking");
    }
    if(typeof p.plannedFinish==="string"&&
     result.actualFinish!==p.plannedFinish&&
     !(ev&&result.actualFinish==="INJURY_STOPPAGE")&&
     !(ev&&result.actualFinish==="PROTECTED_FINISH"))
     throw new Error("Completed finish differs from submitted booking");
   }else{
    const result=segmentResults.get(slot.slot_id)!;
    if(typeof p.outcome==="string"&&p.outcome!==result.outcome)
     throw new Error("Completed segment outcome differs from submitted booking");
   }
  }
  await tx.query(
   `INSERT INTO ppw_completed_shows
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
  for(const e of evidence)await tx.query(
   `INSERT INTO ppw_completed_match_evidence(world_id,show_id,match_id,evidence_json)
    VALUES($1,$2,$3,$4::jsonb)`,
   [receipt.worldId,receipt.showId,e.matchId,JSON.stringify(e)]);
  if(receipt.segments.length){
   const rows=receipt.segments.map(s=>({
    slot_id:s.slotId,position:s.position,kind:s.kind,
    authored_outcome:s.outcome,crowd_response:s.crowdResponse,
    story_json:storyBySlot.get(s.slotId)??null,
   }));
   const written=await tx.query<{slot_id:string}>(`
    INSERT INTO ppw_completed_show_segments(
     world_id,show_id,slot_id,position,kind,authored_outcome,crowd_response,story_json)
    SELECT $1,$2,x.slot_id,x.position,x.kind,x.authored_outcome,
     x.crowd_response,x.story_json
    FROM jsonb_to_recordset($3::jsonb) AS x(
     slot_id text,position integer,kind text,authored_outcome text,
     crowd_response numeric,story_json jsonb)
    RETURNING slot_id`,
    [receipt.worldId,receipt.showId,JSON.stringify(rows)]);
   if(written.length!==rows.length)
    throw new Error("Incomplete canonical segment result insert");
  }
  return "RECORDED";
 }
}