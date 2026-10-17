/** Read only the submitted, World-locked card and canonical people.
 * This is an evaluation projection, not permission to write World results.
 */
import type {TransactionPool} from "./transaction.js";
import type {SqlRows} from "./world-operations.js";
import {withWorldTransaction} from "./transaction.js";
import {readCardParticipants} from "../domain/card-participants.js";
import {validateAuthoredSegments,type AuthoredSegment}
 from "../simulation/legacy/show-segments.js";
import {buildBookedSegmentPayload} from "../domain/segment-booking.js";
import type {SegmentCrowdContext}
 from "../simulation/legacy/segment-crowd.js";
export interface CanonicalSegmentScope {
 worldId:string;promotionId:string;showId:string;year:number;week:number;
}
export async function readCanonicalSegmentContexts(
 pool:TransactionPool,scope:CanonicalSegmentScope,
):Promise<SegmentCrowdContext[]>{
 return withWorldTransaction(pool,tx=>readCanonicalSegmentContextsInTransaction(tx,scope));
}
export async function readCanonicalSegmentContextsInTransaction(
 tx:SqlRows,scope:CanonicalSegmentScope,
):Promise<SegmentCrowdContext[]>{
  const world=await tx.query<{phase:string}>(
   "SELECT phase FROM ppw_worlds WHERE world_id=$1 AND year=$2 AND week=$3 FOR UPDATE",
   [scope.worldId,scope.year,scope.week]);
  if(world.length!==1||world[0]!.phase!=="RESOLVING")
   throw new Error("World is not resolving this segment card");
  const show=await tx.query<{draft_id:string}>(
   "SELECT draft_id FROM ppw_booking_drafts WHERE world_id=$1 AND promotion_id=$2 AND draft_id=$3 AND year=$4 AND week=$5 AND status='SUBMITTED' FOR UPDATE",
   [scope.worldId,scope.promotionId,scope.showId,scope.year,scope.week]);
  if(show.length!==1)throw new Error("Canonical submitted show required");
  const slots=await tx.query<{slot_id:string;position:number;kind:string;payload:unknown}>(
   "SELECT slot_id,position,kind,payload FROM ppw_card_slots"+
    " WHERE world_id=$1 AND draft_id=$2 AND kind='SEGMENT'"+
    " ORDER BY position LIMIT 101",
   [scope.worldId,scope.showId]);
  if(slots.length>100)throw new Error("Card exceeds maximum slots");
  const segments:AuthoredSegment[]=[],allIds=new Set<string>();
  for(const slot of slots){
   if(slot.kind!=="SEGMENT")continue;
   if(!slot.payload||typeof slot.payload!=="object"||Array.isArray(slot.payload))
    throw new Error("Invalid canonical segment payload");
   const p=slot.payload as Record<string,unknown>;
   const participants=readCardParticipants(p);
   const ids=new Set(participants.map(x=>x.personId));
   const actorIds=p.actorIds,targetIds=p.targetIds;
   if(!Array.isArray(actorIds)||!Array.isArray(targetIds)||
    !actorIds.every(x=>typeof x==="string"&&ids.has(x))||
    !targetIds.every(x=>typeof x==="string"&&ids.has(x)))
    throw new Error("Segment roles must reference contracted card participants");
   const segment=buildBookedSegmentPayload({slotId:slot.slot_id,position:slot.position,
    kind:p.kind as AuthoredSegment["kind"],actorIds,targetIds,
    outcome:p.outcome as AuthoredSegment["outcome"],
    ...(p.videoPurpose===undefined?{}:{videoPurpose:p.videoPurpose as AuthoredSegment["videoPurpose"]}),
    ...(p.turnTargetAlignment===undefined?{}:{
     turnTargetAlignment:p.turnTargetAlignment as AuthoredSegment["turnTargetAlignment"]}),
    ...(p.stableId===undefined?{}:{stableId:p.stableId as string})},participants);
   segments.push(segment);
   for(const id of ids)allIds.add(id);
  }
  validateAuthoredSegments(segments,allIds);
  if(!segments.length)return [];
  // Only the submitted show's explicitly linked active stories affect its
  // segment score. One indexed, capped read; never scan World-wide feuds.
  const links=await tx.query<{slot_id:string;programme_id:string;heat:number|null;
   repetition:number;status:string}>([
   "SELECT a.slot_id,a.programme_id,p.heat,p.repetition,p.status",
   "FROM ppw_programme_match_activities a",
   "JOIN ppw_programmes p ON p.world_id=a.world_id",
   "AND p.promotion_id=a.promotion_id AND p.programme_id=a.programme_id",
   "WHERE a.world_id=$1 AND a.promotion_id=$2 AND a.draft_id=$3",
   "AND a.kind='SEGMENT' ORDER BY a.slot_id LIMIT 101",
  ].join(" "),[scope.worldId,scope.promotionId,scope.showId]);
  if(links.length>100)throw new Error("Excess segment programme links");
  const linked=new Map<string,Array<(typeof links)[number]>>();
  const segmentIds=new Set(segments.map(x=>x.slotId));
  for(const link of links){
   if(!segmentIds.has(link.slot_id))
    throw new Error("Orphan segment programme link");
   const group=linked.get(link.slot_id)??[];
   group.push(link);linked.set(link.slot_id,group);
  }
  const people=await tx.query<{person_id:string;name:string;popularity:number|null;
   presentation:number|null;momentum:number|null}>(
   "SELECT person_id,name,popularity,presentation,momentum FROM ppw_people WHERE world_id=$1 AND person_id=ANY($2::text[])",
   [scope.worldId,[...allIds]]);
  if(people.length!==allIds.size)throw new Error("Missing canonical segment performer");
  const byId=new Map(people.map(p=>[p.person_id,p]));
  return segments.map(segment=>({
   segment,
   performers:[...new Set([...segment.actorIds,...segment.targetIds])].map(id=>{
    const p=byId.get(id)!;
    if(p.popularity===null||p.presentation===null||p.momentum===null)
     throw new Error("Missing segment performer scoring context");
    return {personId:id,name:p.name,popularity:p.popularity,
     presentation:p.presentation,momentum:p.momentum};
   }),
   // Unknown historical heat remains neutral; known active heat and
   // repetition are not silently discarded.
   storylineHeat:(()=>{
    const active=(linked.get(segment.slotId)??[])
     .filter(x=>x.status==="ACTIVE"&&x.heat!==null);
    return active.length?active.reduce((n,x)=>n+x.heat!,0)/active.length:50;
   })(),
   repetitionCount:(()=>{
    const active=(linked.get(segment.slotId)??[]).filter(x=>x.status==="ACTIVE");
    return active.length?Math.floor(
     active.reduce((n,x)=>n+x.repetition,0)/active.length):0;
   })(),
  }));
}