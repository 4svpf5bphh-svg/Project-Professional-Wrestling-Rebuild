/** Roster-scoped, read-only wrestler-owned personas. The 643-roster guide is
 * static application content: never transferred from Neon or mistaken for a
 * wrestler's negotiated PPW career history.
 */
import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";
import {originalPersonaBaseline,validatePortablePersona,wrestlerIdentityReference}
 from "../domain/portable-persona.js";
export interface PersonaScope{
 worldId:string;promotionId:string;playerId:string;personId?:string;
}
export async function readPortablePersonaWorkspace(pool:TransactionPool,s:PersonaScope){
 return withSqlClient(pool,async tx=>{
  const owns=await tx.query<{year:number;week:number;revision:string|number;
   booking_open:boolean}>([
   "SELECT w.year,w.week,w.revision,(w.phase='OPEN' AND",
   "w.next_lock_at>clock_timestamp()) AS booking_open",
   "FROM ppw_worlds w JOIN ppw_promotion_controls c ON c.world_id=w.world_id",
   "JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id",
   "JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id",
   "WHERE w.world_id=$1 AND c.promotion_id=$2 AND c.player_id=$3",
   "AND c.active AND m.status='ACTIVE' AND p.lifecycle='ACTIVE'"
  ].join(" "),[s.worldId,s.promotionId,s.playerId]);
  if(owns.length!==1)throw new Error("Portable identity access denied");
  const now=(owns[0]!.year-1)*52+owns[0]!.week-1;
  const roster=await tx.query<{person_id:string;name:string;
   portable_gimmick_id:string|null;morale:number|null;
   momentum:number|null}>([
   "SELECT DISTINCT p.person_id,p.name,p.portable_gimmick_id,p.morale,p.momentum",
   "FROM ppw_people p JOIN ppw_contracts c",
   "ON c.world_id=p.world_id AND c.person_id=p.person_id",
   "WHERE p.world_id=$1 AND c.promotion_id=$2 AND p.status='ACTIVE'",
   "AND c.status='SIGNED' AND c.start_week_index<=$3",
   "AND c.expires_week_index>=$3 ORDER BY p.name,p.person_id LIMIT 501"
  ].join(" "),[s.worldId,s.promotionId,now]);
  if(roster.length>500)throw new Error("Too many roster identities");
  // One bounded inbox read for the whole controlled roster, not a query per contact.
  const inbox=roster.length?await tx.query<{person_id:string;
   requested_gimmick_id:string;status:string;reason:string;
   submitted_week_index:number}>([
   "SELECT DISTINCT ON (r.person_id) r.person_id,r.requested_gimmick_id,",
   "r.status,r.reason,r.submitted_week_index",
   "FROM ppw_persona_change_requests r",
   "WHERE r.world_id=$1 AND r.person_id=ANY($2::text[])",
   "ORDER BY r.person_id,r.submitted_week_index DESC,r.request_id DESC",
   "LIMIT 500"
  ].join(" "),[s.worldId,roster.map(x=>x.person_id)]):[];
  const latestByPerson=new Map(inbox.map(x=>[x.person_id,x]));
  const selected=s.personId??roster[0]?.person_id;
  if(selected!==undefined&&!roster.some(x=>x.person_id===selected))
   throw new Error("Only a roster wrestler's identity may be inspected");
  // One bounded read of the newest private message per roster member.
  const incoming=roster.length?await tx.query<{
   person_id:string;request_id:string;kind:string;status:string;
   read_week_index:number|null;created_week_index:number}>([
   "SELECT DISTINCT ON (person_id) person_id,request_id,kind,status,",
   "read_week_index,created_week_index",
   "FROM ppw_backstage_requests WHERE world_id=$1 AND promotion_id=$2",
   "AND person_id=ANY($3::text[])",
   "ORDER BY person_id,created_week_index DESC,request_id DESC LIMIT 500"
  ].join(" "),[s.worldId,s.promotionId,roster.map(x=>x.person_id)]):[];
  const incomingById=new Map(incoming.map(x=>[x.person_id,x]));
  const listed=roster.map(x=>({personId:x.person_id,name:x.name,
   latestIncoming:incomingById.get(x.person_id)??null,
   morale:x.morale,momentum:x.momentum,
   lastMessage:latestByPerson.get(x.person_id)??null}));
  if(!selected)return {roster:listed,personId:null,
   persona:null,history:[],recentRequests:[],conversations:[],archetypes:[],
   documentedAlternates:[],worldYear:owns[0]!.year,
   worldWeek:owns[0]!.week,worldRevision:Number(owns[0]!.revision),
   canEdit:false,nextPitchWeek:0};
  const wrestler=roster.find(x=>x.person_id===selected)!;
  const current=await tx.query<{persona:unknown;revision:number;
   introduced_week_index:number}>([
   "SELECT persona,revision,introduced_week_index FROM ppw_portable_personas",
   "WHERE world_id=$1 AND person_id=$2"
  ].join(" "),[s.worldId,selected]);
  if(current.length>1)throw new Error("Ambiguous wrestler persona");
  const persona=current.length?
   validatePortablePersona(current[0]!.persona,wrestler.name):
   originalPersonaBaseline(wrestler.name,wrestler.portable_gimmick_id);
  const history=await tx.query<{revision:number;previous_persona:unknown;
   started_week_index:number;ended_week_index:number;
   changed_by_promotion_id:string|null}>([
   "SELECT revision,previous_persona,started_week_index,ended_week_index,",
   "changed_by_promotion_id FROM ppw_portable_persona_history",
   "WHERE world_id=$1 AND person_id=$2",
   "ORDER BY revision DESC LIMIT 51"
  ].join(" "),[s.worldId,selected]);
  if(history.length>50)throw new Error("Persona history exceeds bounded limit");
  const recentRequests=await tx.query<{requested_gimmick_id:string;
   status:string;reason:string;submitted_week_index:number;
   assessed_resistance:number}>([
   "SELECT requested_gimmick_id,status,reason,submitted_week_index,",
   "assessed_resistance FROM ppw_persona_change_requests",
   "WHERE world_id=$1 AND person_id=$2",
   "ORDER BY submitted_week_index DESC,request_id DESC LIMIT 5"
  ].join(" "),[s.worldId,selected]);
  const conversations=await tx.query<{
   request_id:string;kind:"CONTRACT"|"MORALE"|"MOMENTUM"|"CREATIVE"|"PARTNERSHIP"|"ROLE_USAGE";
   related_person_id:string|null;status:string;
   decision:"TALK"|"DECLINE"|"PROMISE_APPEARANCE"|"PROMISE_SEGMENT"|"PROMISE_FEATURED"|"EXPLORE_RENEWAL"|"MEDIATE"|null;
   created_week_index:number;responded_week_index:number|null;
   due_week_index:number|null;promised_role:string|null;
   observed_match_shows:number|null;observed_featured_shows:number|null;
   assessment_reason:string|null;trust_delta:number}>([
   "SELECT request_id,kind,related_person_id,status,decision,",
   "created_week_index,responded_week_index,due_week_index,",
   "promised_role,observed_match_shows,observed_featured_shows,",
   "assessment_reason,trust_delta",
   "FROM ppw_backstage_requests WHERE world_id=$1 AND promotion_id=$2",
   "AND person_id=$3 ORDER BY created_week_index DESC,request_id DESC LIMIT 30"
  ].join(" "),[s.worldId,s.promotionId,selected]);
  const reference=wrestlerIdentityReference(wrestler.name);
  return {roster:listed,personId:selected,personName:wrestler.name,
   persona,revision:current[0]?.revision??0,
   conversations:[...conversations].reverse().map(x=>({
    conversationId:x.request_id,kind:x.kind,relatedPersonId:x.related_person_id,
    status:x.status,decision:x.decision,createdWeekIndex:x.created_week_index,
    respondedWeekIndex:x.responded_week_index,dueWeekIndex:x.due_week_index,
    promisedRole:x.promised_role,observedMatchShows:x.observed_match_shows,
    observedFeaturedShows:x.observed_featured_shows,
    assessmentReason:x.assessment_reason,trustDelta:x.trust_delta,
   })),
   history:history.slice(0,50).map(x=>({
    revision:x.revision,persona:validatePortablePersona(x.previous_persona,wrestler.name),
    startedWeekIndex:x.started_week_index,endedWeekIndex:x.ended_week_index,
    changedByPromotionId:x.changed_by_promotion_id,
   })),recentRequests,archetypes:reference.archetypes,
   documentedAlternates:reference.documentedAlternates,
   worldYear:owns[0]!.year,worldWeek:owns[0]!.week,worldRevision:Number(owns[0]!.revision),
   canEdit:owns[0]!.booking_open,
   nextPitchWeek:recentRequests.length?recentRequests[0]!.submitted_week_index+12:0};
 });
}
