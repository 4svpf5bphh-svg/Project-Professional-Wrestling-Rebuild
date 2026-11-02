/** Certified, author-owned faction changes settle with the show, never at booking.
 * The caller already holds the World lock and the completed-show receipt in
 * the same transaction. No polling, cron or player-facing command is added.
 */
import {randomUUID} from "node:crypto";
import type {SqlRows} from "./world-operations.js";
import type {SegmentCrowdContext} from "../simulation/legacy/segment-crowd.js";
type Scope={worldId:string;promotionId:string;year:number;week:number;showId:string};
type Move={stableId:string;personId:string;slotId:string;kind:string;action:"ADD"|"REMOVE"};
export async function settleCertifiedStableStories(
 tx:SqlRows,scope:Scope,contexts:readonly SegmentCrowdContext[],
):Promise<{joined:number;left:number;skipped:number}>{
 const candidates:Move[]=[];
 for(const {segment} of [...contexts].sort((a,b)=>a.segment.position-b.segment.position)){
  if(segment.outcome!=="HAPPENS"||!segment.stableId)continue;
  const add=segment.kind==="STABLE_INVITATION"||
   segment.kind==="STABLE_RECONCILIATION";
  if(!add&&segment.kind!=="STABLE_EXIT")continue;
  if(add&&segment.stableDecision!=="ACCEPTED")continue;
  // The leaving wrestler is the on-screen subject; optional targets
  // may be the former colleagues on the receiving end of a beatdown.
  const expelled=segment.kind==="STABLE_EXIT"&&
   segment.creativeBeat?.kind==="STABLE_EXIT"&&
   ["EXPULSION_SCENE","BEATDOWN"].includes(segment.creativeBeat.departure);
  const personId=add||expelled?segment.targetIds[0]:segment.actorIds[0];
  if(!personId)continue;
  candidates.push({stableId:segment.stableId,personId,slotId:segment.slotId,
   kind:segment.kind,action:add?"ADD":"REMOVE"});
 }
 if(!candidates.length)return {joined:0,left:0,skipped:0};
 if(candidates.length>100)throw new Error("Too many scripted faction changes");
 const ids=[...new Set(candidates.map(x=>x.stableId))];
 const people=[...new Set(candidates.map(x=>x.personId))];
 const stables=await tx.query<{stable_id:string;status:string;member_count:number}>([
  "SELECT s.stable_id,s.status,(SELECT count(*)::integer",
  "FROM ppw_stable_memberships m WHERE m.world_id=s.world_id",
  "AND m.promotion_id=s.promotion_id AND m.stable_id=s.stable_id",
  "AND m.active) AS member_count",
  "FROM ppw_stables s WHERE s.world_id=$1 AND s.promotion_id=$2",
  "AND s.stable_id=ANY($3::text[]) FOR UPDATE"
 ].join(" "),[scope.worldId,scope.promotionId,ids]);
 const active=await tx.query<{stable_id:string;person_id:string}>([
  "SELECT stable_id,person_id FROM ppw_stable_memberships",
  "WHERE world_id=$1 AND promotion_id=$2 AND active",
  "AND (stable_id=ANY($3::text[]) OR person_id=ANY($4::text[]))",
  "ORDER BY stable_id,person_id FOR UPDATE"
 ].join(" "),[scope.worldId,scope.promotionId,ids,people]);
 const weekIndex=(scope.year-1)*52+scope.week-1;
 const signed=await tx.query<{person_id:string}>([
  "SELECT DISTINCT c.person_id FROM ppw_contracts c",
  "JOIN ppw_people p ON p.world_id=c.world_id AND p.person_id=c.person_id",
  "WHERE c.world_id=$1 AND c.promotion_id=$2",
  "AND c.person_id=ANY($3::text[]) AND c.status='SIGNED'",
  "AND c.start_week_index<=$4 AND c.expires_week_index>=$4",
  "AND (c.family='EXCLUSIVE' OR c.remaining_dates>0)",
  "AND p.status='ACTIVE'"
 ].join(" "),[scope.worldId,scope.promotionId,people,weekIndex]);
 const valid=new Set(signed.map(x=>x.person_id));
 const counts=new Map(stables.map(s=>[s.stable_id,s.member_count]));
 const statuses=new Map(stables.map(s=>[s.stable_id,s.status]));
 const membership=new Map(active.map(m=>[m.person_id,m.stable_id]));
 const planned:Move[]=[],used=new Set<string>();
 for(const move of candidates){
  // Ambiguous double-booked join/exit changes are not silently combined.
  if(used.has(move.personId)||statuses.get(move.stableId)!=="ACTIVE"){
   continue;
  }
  used.add(move.personId);
  const old=membership.get(move.personId);
  if(move.action==="ADD"){
   if(old||!valid.has(move.personId)||(counts.get(move.stableId)??12)>=12)
    continue;
   membership.set(move.personId,move.stableId);
   counts.set(move.stableId,(counts.get(move.stableId)??0)+1);
  }else{
   if(old!==move.stableId)continue;
   membership.delete(move.personId);
   counts.set(move.stableId,(counts.get(move.stableId)??1)-1);
  }
  planned.push(move);
 }
 const leaving=planned.filter(x=>x.action==="REMOVE");
 const joining=planned.filter(x=>x.action==="ADD");
 if(leaving.length){
  const updated=await tx.query<{person_id:string}>([
   "UPDATE ppw_stable_memberships m SET active=false,left_week_index=$3",
   "FROM jsonb_to_recordset($4::jsonb) AS a(stable_id text,person_id text)",
   "WHERE m.world_id=$1 AND m.promotion_id=$2 AND m.active",
   "AND m.stable_id=a.stable_id AND m.person_id=a.person_id",
   "RETURNING m.person_id"
  ].join(" "),[scope.worldId,scope.promotionId,weekIndex,JSON.stringify(leaving)]);
  if(updated.length!==leaving.length)throw new Error("Scripted stable exit was not settled");
 }
 if(joining.length){
  const inserted=await tx.query<{person_id:string}>([
   "INSERT INTO ppw_stable_memberships",
   "(world_id,promotion_id,stable_id,membership_id,person_id,joined_week_index)",
   "SELECT $1,$2,x.stable_id,x.membership_id,x.person_id,$3",
   "FROM jsonb_to_recordset($4::jsonb)",
   "AS x(stable_id text,membership_id text,person_id text)",
   "RETURNING person_id"
  ].join(" "),[scope.worldId,scope.promotionId,weekIndex,
   JSON.stringify(joining.map(x=>({...x,membership_id:"member-"+randomUUID()})))]);
  if(inserted.length!==joining.length)throw new Error("Scripted stable invitation was not settled");
 }
 if(planned.length){
  const events=await tx.query<{event_type:string}>([
   "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
   "SELECT $1,$2,$3,x.event_type,jsonb_build_object(",
   "'promotionId',$4::text,'stableId',x.stable_id,'memberIds',",
   "ARRAY[x.person_id]::text[],'showId',$5::text,'slotId',x.slot_id,",
   "'source','CERTIFIED_ANGLE')",
   "FROM jsonb_to_recordset($6::jsonb)",
   "AS x(stable_id text,person_id text,slot_id text,event_type text)",
   "RETURNING event_type"
  ].join(" "),[scope.worldId,scope.year,scope.week,scope.promotionId,
   scope.showId,JSON.stringify(planned.map(x=>({
    ...x,event_type:x.action==="ADD"?"STABLE_MEMBER_JOINED":"STABLE_MEMBER_LEFT"})))]);
  if(events.length!==planned.length)throw new Error("Incomplete certified stable history");
 }
 return {joined:joining.length,left:leaving.length,skipped:candidates.length-planned.length};
}
