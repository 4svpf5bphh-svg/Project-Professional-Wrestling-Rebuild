/** Factual completed programme activities and original rolling signal formula.
 * Resolves with the show's transaction. No per-programme queries; only IDs
 * linked to the settled card and a bounded ten-week history are transferred.
 */
import type {SqlRows} from "./world-operations.js";
import type {CompletedShowReceipt} from "../domain/completed-show-receipt.js";
import {readCardParticipants} from "../domain/card-participants.js";
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
 const entries=await tx.query<{programme_id:string;slot_id:string;kind:string}>([
  "SELECT a.programme_id,a.slot_id,a.kind",
  "FROM ppw_programme_match_activities a",
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
 const execution=new Map(input.matches.map(m=>[m.slotId,m.executionQuality]));
 const mainEvent=Math.max(...receipt.matches.map(m=>m.position),-1);
 const records=included.map(link=>{
  const result=results.get(link.slot_id)!;
  const payload=bySlot.get(link.slot_id);
  if(!payload)throw new Error("Missing completed programme payload");
  const ids=[...new Set(readCardParticipants(payload).map(p=>p.personId))].sort();
  const signature=link.kind+":"+ids.join("|");
  const quality=execution.get(link.slot_id);
  if(link.kind==="MATCH"&&(
   quality===undefined||!Number.isFinite(quality)||quality<0||quality>100))
   throw new Error("Missing verified match execution for programme history");
  const impact=link.kind==="MATCH"?
   Math.max(0,Math.min(100,quality!*.42+result.crowd*.38+
    input.eventImportance*.2+(result.position===mainEvent?4:0))):
   Math.max(0,Math.min(100,result.crowd*.9+input.eventImportance*.1));
  return {programme_id:link.programme_id,slot_id:link.slot_id,
   week_index:index,kind:link.kind,signature,
   crowd_response:result.crowd,impact:Math.round(impact*100)/100};
 });
 const inserted=await tx.query<{slot_id:string}>([
  "INSERT INTO ppw_programme_resolved_activities",
  "(world_id,promotion_id,programme_id,show_id,slot_id,week_index,",
  "kind,signature,crowd_response,impact)",
  "SELECT $1,$2,x.programme_id,$3,x.slot_id,x.week_index,",
  "x.kind,x.signature,x.crowd_response,x.impact",
  "FROM jsonb_to_recordset($4::jsonb) AS x(",
  "programme_id text,slot_id text,week_index integer,kind text,",
  "signature text,crowd_response double precision,impact double precision)",
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
  return {programme_id,heat:signal.heat,repetition:signal.repetition};
 });
 const updated=await tx.query<{programme_id:string}>([
  "UPDATE ppw_programmes p SET heat=x.heat,repetition=x.repetition",
  "FROM jsonb_to_recordset($3::jsonb) AS x(",
  "programme_id text,heat double precision,repetition double precision)",
  "WHERE p.world_id=$1 AND p.promotion_id=$2 AND p.status='ACTIVE'",
  "AND p.programme_id=x.programme_id RETURNING p.programme_id"
 ].join(" "),[input.worldId,input.promotionId,JSON.stringify(signals)]);
 if(updated.length!==signals.length)throw new Error("Programme changed during results");
 return {recorded:inserted.length,programmes:updated.length};
}
