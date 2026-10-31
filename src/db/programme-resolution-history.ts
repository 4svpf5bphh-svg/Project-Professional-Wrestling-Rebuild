/** Factual completed programme activities and original rolling signal formula.
 * Resolves with the show's transaction. No per-programme queries; only IDs
 * linked to the settled card and a bounded ten-week history are transferred.
 */
import {certifiedProgrammeBeatSignature} from "../domain/programme-beat-signature.js";
import {certifiedFinaleDelivered,type ProgrammePayoff}
 from "../domain/programme-finales.js";
import type {SqlRows} from "./world-operations.js";
import type {CompletedShowReceipt} from "../domain/completed-show-receipt.js";
import {readCardParticipants} from "../domain/card-participants.js";
import {readCanonicalMatchLayout} from "../domain/match-sides.js";
import {programmeResultSide} from "../domain/programme-match-winners.js";
import {evaluateProgrammeSignals} from "../domain/programme-signals.js";
export interface ProgrammeResolutionInput {
 worldId:string;promotionId:string;showId:string;year:number;week:number;
 eventImportance:number;
 matches:readonly {slotId:string;executionQuality:number}[];
}
export async function settleCompletedProgrammeHistory(
 tx:SqlRows,input:ProgrammeResolutionInput,receipt:CompletedShowReceipt,
):Promise<{recorded:number;programmes:number}>{
 const index=(input.year-1)*52+input.week-1;
 if(input.worldId!==receipt.worldId||input.promotionId!==receipt.promotionId||
  input.showId!==receipt.showId||input.year!==receipt.year||input.week!==receipt.week||
  !Number.isSafeInteger(index)||!Number.isFinite(input.eventImportance)||
  input.eventImportance<0||input.eventImportance>100)
  throw new Error("Programme history show scope mismatch");
 const entries=await tx.query<{programme_id:string;slot_id:string;kind:string;
  finale_payoff:ProgrammePayoff|null}>([
  "SELECT a.programme_id,a.slot_id,a.kind,f.payoff AS finale_payoff",
  "FROM ppw_programme_match_activities a",
  "LEFT JOIN ppw_programme_finales f ON f.world_id=a.world_id",
  "AND f.promotion_id=a.promotion_id AND f.programme_id=a.programme_id",
  "AND f.show_id=a.draft_id AND f.slot_id=a.slot_id",
  "AND f.resolved_week_index IS NULL",
  "JOIN ppw_programmes p ON p.world_id=a.world_id",
  "AND p.promotion_id=a.promotion_id AND p.programme_id=a.programme_id",
  "WHERE a.world_id=$1 AND a.promotion_id=$2 AND a.draft_id=$3",
  "AND p.status='ACTIVE' ORDER BY a.programme_id,a.slot_id LIMIT 401"
 ].join(" "),[input.worldId,input.promotionId,input.showId]);
 if(entries.length>400)throw new Error("Too many programme links for completed card");
 if(!entries.length)return {recorded:0,programmes:0};
 const results=new Map<string,{kind:string;crowd:number;position:number}>();
 for(const m of receipt.matches)results.set(m.matchId,{
  kind:"MATCH",crowd:m.crowdResponse,position:m.position});
 for(const s of receipt.segments)if(s.outcome==="HAPPENS")
  results.set(s.slotId,{kind:"SEGMENT",crowd:s.crowdResponse,position:s.position});
 const included=entries.filter(x=>{
  const result=results.get(x.slot_id);
  if(result&&result.kind!==x.kind)throw new Error("Programme activity kind mismatch");
  return !!result;
 });
 if(!included.length)return {recorded:0,programmes:0};
 const slotIds=[...new Set(included.map(x=>x.slot_id))];
 const cards=await tx.query<{slot_id:string;payload:unknown}>([
  "SELECT slot_id,payload FROM ppw_card_slots",
  "WHERE world_id=$1 AND draft_id=$2 AND slot_id=ANY($3::text[]) LIMIT 101"
 ].join(" "),[input.worldId,input.showId,slotIds]);
 if(cards.length!==slotIds.length)throw new Error("Completed programme slot was removed");
 const bySlot=new Map(cards.map(c=>[c.slot_id,c.payload]));
 const matchLinks=included.filter(x=>x.kind==="MATCH");
 const programmeIds=[...new Set(matchLinks.map(x=>x.programme_id))];
 const programmePeople=programmeIds.length?await tx.query<{
  programme_id:string;person_id:string;side:"A"|"B"}>([
  "SELECT programme_id,person_id,side FROM ppw_programme_participants",
  "WHERE world_id=$1 AND promotion_id=$2 AND programme_id=ANY($3::text[])",
  "ORDER BY programme_id,person_id LIMIT 401"
 ].join(" "),[input.worldId,input.promotionId,programmeIds]):[];
 if(programmePeople.length>400)throw new Error("Programme participant projection exceeded");
 const resolvedMatches=new Map(receipt.matches.map(m=>[m.matchId,m]));
 const execution=new Map(input.matches.map(m=>[m.slotId,m.executionQuality]));
 const mainEvent=Math.max(...receipt.matches.map(m=>m.position),-1);
 const records=included.map(link=>{
  const result=results.get(link.slot_id)!;
  const payload=bySlot.get(link.slot_id);
  if(!payload)throw new Error("Missing completed programme payload");
  const ids=[...new Set(readCardParticipants(payload).map(p=>p.personId))].sort();
  // Keep long tag-team wrestler identifiers off Neon wire and indexes.
  // Hashes preserve the original identical-participant repetition semantics.
  const signature=certifiedProgrammeBeatSignature({
   kind:link.kind==="MATCH"?"MATCH":"SEGMENT",personIds:ids,payload
  });
  const quality=execution.get(link.slot_id);
  if(link.kind==="MATCH"&&(
   quality===undefined||!Number.isFinite(quality)||quality<0||quality>100))
   throw new Error("Missing verified match execution for programme history");
  const impact=link.kind==="MATCH"?
   Math.max(0,Math.min(100,quality!*.42+result.crowd*.38+
    input.eventImportance*.2+(result.position===mainEvent?4:0))):
   Math.max(0,Math.min(100,result.crowd*.9+input.eventImportance*.1));
  const winner_side=link.kind==="MATCH"?(()=>{
   const layout=readCanonicalMatchLayout(payload);
   if(layout.sides.length!==2)throw new Error("Linked match must have two sides");
   const match=resolvedMatches.get(link.slot_id);
   if(!match)throw new Error("Missing completed linked match");
   return programmeResultSide({
    slotId:link.slot_id,
    sideA:layout.sides[0]!.participants.map(p=>p.personId),
    sideB:layout.sides[1]!.participants.map(p=>p.personId),
   },programmePeople.map(p=>({programmeId:p.programme_id,
    personId:p.person_id,side:p.side})),link.programme_id,match.actualWinnerSide);
  })():null;
  return {programme_id:link.programme_id,slot_id:link.slot_id,
   week_index:index,kind:link.kind,signature,winner_side,
   crowd_response:result.crowd,impact:Math.round(impact*100)/100};
 });
 const inserted=await tx.query<{slot_id:string}>([
  "INSERT INTO ppw_programme_resolved_activities",
  "(world_id,promotion_id,programme_id,show_id,slot_id,week_index,",
  "kind,signature,crowd_response,impact,winner_side)",
  "SELECT $1,$2,x.programme_id,$3,x.slot_id,x.week_index,",
  "x.kind,x.signature,x.crowd_response,x.impact,x.winner_side",
  "FROM jsonb_to_recordset($4::jsonb) AS x(",
  "programme_id text,slot_id text,week_index integer,kind text,",
  "signature text,crowd_response double precision,impact double precision,",
  "winner_side text)",
  "RETURNING slot_id"
 ].join(" "),[input.worldId,input.promotionId,input.showId,JSON.stringify(records)]);
 if(inserted.length!==records.length)throw new Error("Incomplete programme history");
 const ids=[...new Set(records.map(x=>x.programme_id))];
 // Only ten weeks of linked history; never fetch all World programmes.
 const history=await tx.query<{programme_id:string;week_index:number;
  signature:string;impact:number}>([
  "SELECT programme_id,week_index,signature,impact",
  "FROM ppw_programme_resolved_activities",
  "WHERE world_id=$1 AND promotion_id=$2 AND programme_id=ANY($3::text[])",
  "AND week_index BETWEEN $4 AND $5",
  "ORDER BY programme_id,week_index DESC LIMIT 4001"
 ].join(" "),[input.worldId,input.promotionId,ids,Math.max(0,index-9),index]);
 if(history.length>4000)throw new Error("Programme history window too large");
 const signals=ids.map(programme_id=>{
  const active=history.filter(x=>x.programme_id===programme_id).map(x=>({
   programmeId:programme_id,weekIndex:x.week_index,
   signature:x.signature,impact:x.impact}));
  const signal=evaluateProgrammeSignals(active,index);
  const matches=records.filter(r=>r.programme_id===programme_id&&r.kind==="MATCH");
  const segments=records.filter(r=>r.programme_id===programme_id&&r.kind==="SEGMENT");
  return {programme_id,heat:signal.heat,repetition:signal.repetition,
   match_count:matches.length,segment_count:segments.length,
   side_a_wins:matches.filter(r=>r.winner_side==="A").length,
   side_b_wins:matches.filter(r=>r.winner_side==="B").length,
   draws:matches.filter(r=>r.winner_side===null).length};
 });
 const updated=await tx.query<{programme_id:string}>([
  "UPDATE ppw_programmes p SET heat=x.heat,repetition=x.repetition,",
  "activity_count=p.activity_count+x.match_count+x.segment_count,",
  "match_count=p.match_count+x.match_count,",
  "segment_count=p.segment_count+x.segment_count,",
  "side_a_wins=p.side_a_wins+x.side_a_wins,",
  "side_b_wins=p.side_b_wins+x.side_b_wins,draws=p.draws+x.draws",
  "FROM jsonb_to_recordset($3::jsonb) AS x(",
  "programme_id text,heat double precision,repetition double precision,",
  "match_count integer,segment_count integer,side_a_wins integer,",
  "side_b_wins integer,draws integer)",
  "WHERE p.world_id=$1 AND p.promotion_id=$2 AND p.status='ACTIVE'",
  "AND p.programme_id=x.programme_id RETURNING p.programme_id"
 ].join(" "),[input.worldId,input.promotionId,JSON.stringify(signals)]);
 if(updated.length!==signals.length)throw new Error("Programme changed during results");
 // Finale certification belongs INSIDE this same completed-show transaction.
 // Never close because an angle was skipped/interrupted, a match was drawn,
 // or a previously selected segment was removed/rewritten after planning.
 const delivered=included.flatMap(link=>{
  if(!link.finale_payoff)return [];
  const record=records.find(r=>r.programme_id===link.programme_id&&
   r.slot_id===link.slot_id);
  const payload=bySlot.get(link.slot_id);
  if(!record||!payload)return [];
  if(!certifiedFinaleDelivered({kind:link.kind==="MATCH"?"MATCH":"SEGMENT",
   payoff:link.finale_payoff,payload,winnerSide:record.winner_side,
   actualFinish:resolvedMatches.get(link.slot_id)?.actualFinish??null,
   angleHappened:link.kind==="SEGMENT"}))return [];
  return [{programme_id:link.programme_id,show_id:input.showId,
   slot_id:link.slot_id,payoff:link.finale_payoff,week_index:index,
   crowd_response:record.crowd_response,winner_side:record.winner_side}];
 });
 if(delivered.length){
  const settled=await tx.query<{programme_id:string}>([
   "UPDATE ppw_programme_finales f SET resolved_week_index=x.week_index,",
   "resolved_crowd_response=x.crowd_response,resolved_winner_side=x.winner_side",
   "FROM jsonb_to_recordset($3::jsonb) AS x(",
   "programme_id text,show_id text,slot_id text,payoff text,",
   "week_index integer,crowd_response double precision,winner_side text)",
   "WHERE f.world_id=$1 AND f.promotion_id=$2",
   "AND f.programme_id=x.programme_id AND f.show_id=x.show_id",
   "AND f.slot_id=x.slot_id AND f.payoff=x.payoff",
   "AND f.resolved_week_index IS NULL RETURNING f.programme_id"
  ].join(" "),[input.worldId,input.promotionId,JSON.stringify(delivered)]);
  if(settled.length!==delivered.length)
   throw new Error("Rivalry finale changed during show certification");
  const completed=await tx.query<{programme_id:string}>([
   "UPDATE ppw_programmes p SET status='COMPLETED',ended_week_index=$3",
   "WHERE p.world_id=$1 AND p.promotion_id=$2 AND p.status='ACTIVE'",
   "AND p.programme_id=ANY($4::text[]) RETURNING p.programme_id"
  ].join(" "),[input.worldId,input.promotionId,index,
   delivered.map(x=>x.programme_id)]);
  if(completed.length!==delivered.length)
   throw new Error("Unable to close all certified rivalry finales");
  const events=await tx.query<{programme_id:string}>([
   "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
   "SELECT $1,$2,$3,'PROGRAMME_FINALE_DELIVERED',",
   "jsonb_build_object('promotionId',$4::text,",
   "'programmeId',x.programme_id,'showId',x.show_id,",
   "'slotId',x.slot_id,'payoff',x.payoff,",
   "'winnerSide',x.winner_side,'crowdResponse',x.crowd_response)",
   "FROM jsonb_to_recordset($5::jsonb) AS x(",
   "programme_id text,show_id text,slot_id text,payoff text,",
   "week_index integer,crowd_response double precision,winner_side text)",
   "RETURNING (payload->>'programmeId') AS programme_id"
  ].join(" "),[input.worldId,input.year,input.week,
   input.promotionId,JSON.stringify(delivered)]);
  if(events.length!==delivered.length)throw new Error("Incomplete certified finale ledger");
 }
 return {recorded:inserted.length,programmes:updated.length};
}
