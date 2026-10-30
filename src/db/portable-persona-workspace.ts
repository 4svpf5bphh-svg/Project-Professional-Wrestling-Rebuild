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
 inboxOnly?:boolean;
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
  // One bounded roster read: currently signed wrestlers and a private,
  // read-only history for the latest 50 departed conversation contacts.
  const roster=await tx.query<{person_id:string;name:string;
   portable_gimmick_id:string|null;morale:number|null;
   momentum:number|null;is_current:boolean}>([
   "WITH current_roster AS (",
   "SELECT DISTINCT p.person_id,p.name,p.portable_gimmick_id,p.morale,",
   "p.momentum,true AS is_current",
   "FROM ppw_people p JOIN ppw_contracts c",
   "ON c.world_id=p.world_id AND c.person_id=p.person_id",
   "WHERE p.world_id=$1 AND c.promotion_id=$2 AND p.status='ACTIVE'",
   "AND c.status='SIGNED' AND c.start_week_index<=$3",
   "AND c.expires_week_index>=$3 ORDER BY p.name,p.person_id LIMIT 501",
   "), former_ids AS (",
   "SELECT r.person_id,max(r.created_week_index) AS last_contact",
   "FROM ppw_backstage_requests r",
   "WHERE r.world_id=$1 AND r.promotion_id=$2",
   "AND NOT EXISTS(SELECT 1 FROM current_roster live",
   "WHERE live.person_id=r.person_id)",
   "GROUP BY r.person_id ORDER BY last_contact DESC,r.person_id LIMIT 51",
   "), former_roster AS (",
   "SELECT p.person_id,p.name,p.portable_gimmick_id,p.morale,p.momentum,",
   "false AS is_current FROM former_ids old JOIN ppw_people p",
   "ON p.world_id=$1 AND p.person_id=old.person_id",
   "), combined AS (SELECT * FROM current_roster UNION ALL",
   "SELECT * FROM former_roster)",
   "SELECT person_id,name,portable_gimmick_id,morale,momentum,is_current",
   "FROM combined ORDER BY is_current DESC,name,person_id LIMIT 552"
  ].join(" "),[s.worldId,s.promotionId,now]);
  if(roster.length>550)throw new Error("Too many Backstage contacts");
  // One bounded inbox read for the whole controlled roster, not a query per contact.
  const inbox=roster.length?await tx.query<{person_id:string;
   requested_gimmick_id:string;status:string;reason:string;
   submitted_week_index:number}>([
   "SELECT DISTINCT ON (r.person_id) r.person_id,r.requested_gimmick_id,",
   "r.status,r.reason,r.submitted_week_index",
   "FROM ppw_persona_change_requests r",
   "WHERE r.world_id=$1 AND r.promotion_id=$2",
   "AND r.person_id=ANY($3::text[])",
   "ORDER BY r.person_id,r.submitted_week_index DESC,r.request_id DESC",
   "LIMIT 551"
  ].join(" "),[s.worldId,s.promotionId,roster.map(x=>x.person_id)]):[];
  const latestByPerson=new Map(inbox.map(x=>[x.person_id,x]));
  // Inbox-only renders the contact list without silently opening the first
  // wrestler. Detail reads happen only when that conversation is selected.
  if(s.inboxOnly&&s.personId!==undefined)
   throw new Error("Inbox request cannot select a wrestler");
  const selected=s.inboxOnly?undefined:s.personId??roster[0]?.person_id;
  if(selected!==undefined&&!roster.some(x=>x.person_id===selected))
   throw new Error("Only a current or historical promotion contact may be inspected");
  // One bounded read of the newest private message per roster member.
  const incoming=roster.length?await tx.query<{
   person_id:string;request_id:string;kind:string;status:string;
   read_week_index:number|null;created_week_index:number;
   career_stage_at_request:string|null;archived_through_week_index:number}>([
   "SELECT DISTINCT ON (r.person_id) r.person_id,r.request_id,r.kind,r.status,",
   "r.read_week_index,r.created_week_index,r.career_stage_at_request,",
   "coalesce(a.archived_through_week_index,-1) AS archived_through_week_index",
   "FROM ppw_backstage_requests r LEFT JOIN ppw_backstage_thread_archives a",
   "ON a.world_id=r.world_id AND a.promotion_id=r.promotion_id",
   "AND a.person_id=r.person_id AND a.player_id=$4",
   "WHERE r.world_id=$1 AND r.promotion_id=$2",
   "AND r.person_id=ANY($3::text[])",
   "ORDER BY r.person_id,r.created_week_index DESC,r.request_id DESC LIMIT 551"
  ].join(" "),[s.worldId,s.promotionId,roster.map(x=>x.person_id),
   s.playerId]):[];
  const incomingById=new Map(incoming.map(x=>[x.person_id,x]));
  const listed=roster.map(x=>({personId:x.person_id,name:x.name,
   latestIncoming:incomingById.get(x.person_id)?{
    ...incomingById.get(x.person_id)!,
    archived:incomingById.get(x.person_id)!.created_week_index<=
     incomingById.get(x.person_id)!.archived_through_week_index,
   }:null,
   isCurrent:x.is_current,morale:x.morale,momentum:x.momentum,
   lastMessage:latestByPerson.get(x.person_id)??null}));
  if(!selected)return {roster:listed,personId:null,
   persona:null,history:[],recentRequests:[],conversations:[],memories:[],archetypes:[],
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
   "WHERE world_id=$1 AND person_id=$2 AND promotion_id=$3",
   "ORDER BY submitted_week_index DESC,request_id DESC LIMIT 5"
  ].join(" "),[s.worldId,selected,s.promotionId]);
  const conversations=await tx.query<{
   request_id:string;kind:"CONTRACT"|"MORALE"|"MOMENTUM"|"CREATIVE"|"PARTNERSHIP"|"ROLE_USAGE"|"GIMMICK_PITCH"|"TAG_TEAM_PITCH"|"RIVALRY_PITCH"|"TEAM_MOMENT"|"MEDICAL_SUPPORT"|"BOOKING_OMISSION"|"LOSS_STREAK"|"TITLE_AMBITION"|"TRUST_CHECK_IN";
   related_person_id:string|null;status:string;
   decision:"TALK"|"DECLINE"|"PROMISE_APPEARANCE"|"PROMISE_SEGMENT"|"PROMISE_FEATURED"|"EXPLORE_RENEWAL"|"MEDIATE"|"CONSIDER_REPACKAGE"|"KEEP_CHARACTER"|"EXPLORE_TEAM"|"EXPLORE_RIVALRY"|"NOT_NOW"|null;
   created_week_index:number;responded_week_index:number|null;
   due_week_index:number|null;promised_role:string|null;
   observed_match_shows:number|null;observed_featured_shows:number|null;
   assessment_reason:string|null;trust_delta:number;
   working_verified_shows:number|null;working_trust_delta:number|null;
   observed_average_crowd:number|string|null;
   team_verified_matches:number|null;observed_execution_quality:number|string|null;
   rival_verified_matches:number|null;rival_professional_trust:number|string|null;
   follow_through_week_index:number|null;follow_through_kind:string|null;
   observed_absent_weeks:number|null;observed_losses:number|null;
   relevant_title:string|null;career_stage_at_request:string|null}>([
   "SELECT request_id,kind,related_person_id,status,decision,",
   "created_week_index,responded_week_index,due_week_index,",
   "promised_role,observed_match_shows,observed_featured_shows,",
   "assessment_reason,trust_delta,working_verified_shows,working_trust_delta,",
   "observed_average_crowd,",
   "team_verified_matches,observed_execution_quality,",
   "rival_verified_matches,rival_professional_trust,",
   "follow_through_week_index,follow_through_kind,",
   "observed_absent_weeks,observed_losses,relevant_title,career_stage_at_request",
   "FROM ppw_backstage_requests WHERE world_id=$1 AND promotion_id=$2",
   "AND person_id=$3 ORDER BY created_week_index DESC,request_id DESC LIMIT 30"
  ].join(" "),[s.worldId,s.promotionId,selected]);
  // Only the selected wrestler thread reads memory. Never inflate inbox
  // reads or pull rival-promoter conversations into this person's history.
  const memories=await tx.query<{kind:string;source_id:string;
   occurred_week_index:number;importance:number;
   related_name:string|null;own_side:"A"|"B"|null;
   winner_side:"A"|"B"|null}>([
   // One existing selected-contact read carries both private conversation
   // memories and up to four certified feud chapters. This never runs for
   // the inbox and never opens a second promotion's history.
   "SELECT old.kind,old.source_id,old.occurred_week_index,old.importance,",
   "NULL::text AS related_name,NULL::text AS own_side,",
   "NULL::text AS winner_side FROM (",
   "SELECT kind,source_id,occurred_week_index,importance,memory_id",
   "FROM ppw_backstage_memories WHERE world_id=$1 AND promotion_id=$2",
   "AND person_id=$3 AND occurred_week_index>=greatest(0,$4-104)",
   "ORDER BY importance DESC,occurred_week_index DESC,memory_id DESC LIMIT 9",
   ") old",
   "UNION ALL",
   "SELECT recent.kind,recent.source_id,recent.occurred_week_index,",
   "recent.importance,recent.related_name,recent.own_side,recent.winner_side",
   "FROM (SELECT CASE WHEN beat.kind='MATCH' THEN 'RIVALRY_MATCH'",
   "ELSE 'RIVALRY_ANGLE' END AS kind,",
   "beat.programme_id||':'||beat.show_id||':'||beat.slot_id AS source_id,",
   "beat.week_index AS occurred_week_index,2 AS importance,",
   "coalesce(opposition.names,'their rivals') AS related_name,",
   "member.side AS own_side,beat.winner_side",
   "FROM ppw_programme_participants member",
   "JOIN ppw_programme_resolved_activities beat",
   "ON beat.world_id=member.world_id",
   "AND beat.promotion_id=member.promotion_id",
   "AND beat.programme_id=member.programme_id",
   // A wrestler can belong to a multi-person feud without participating in
   // every chapter. Only their actual card appearances become their memories.
   "JOIN ppw_card_slots card ON card.world_id=beat.world_id",
   "AND card.draft_id=beat.show_id AND card.slot_id=beat.slot_id",
   "AND card.kind=beat.kind",
   "LEFT JOIN LATERAL (SELECT string_agg("
   "coalesce(p.name,t.name,ref.ref_id),' & ' ORDER BY ref.position) AS names",
   "FROM ppw_programme_side_refs ref",
   "LEFT JOIN ppw_people p ON p.world_id=ref.world_id",
   "AND ref.ref_kind='PERSON' AND p.person_id=ref.ref_id",
   "LEFT JOIN ppw_tag_teams t ON t.world_id=ref.world_id",
   "AND ref.ref_kind='TEAM' AND t.team_id=ref.ref_id",
   "WHERE ref.world_id=beat.world_id",
   "AND ref.promotion_id=beat.promotion_id",
   "AND ref.programme_id=beat.programme_id",
   "AND ref.side<>member.side) opposition ON TRUE",
   "WHERE member.world_id=$1 AND member.promotion_id=$2",
   "AND member.person_id=$3",
   "AND EXISTS (SELECT 1 FROM jsonb_array_elements(",
   "CASE WHEN jsonb_typeof(card.payload->'participants')='array'",
   "THEN card.payload->'participants' ELSE '[]'::jsonb END) cast_member",
   "WHERE cast_member.value->>'personId'=$3)",
   "AND beat.week_index BETWEEN greatest(0,$4-12) AND $4-1",
   "ORDER BY beat.week_index DESC,beat.show_id DESC,beat.slot_id DESC LIMIT 4",
   ") recent ORDER BY occurred_week_index DESC,source_id DESC LIMIT 13"
  ].join(" "),[s.worldId,s.promotionId,selected,now]);
  const reference=wrestlerIdentityReference(wrestler.name);
  return {roster:listed,personId:selected,personName:wrestler.name,
   persona,revision:current[0]?.revision??0,
   memories:memories.map(m=>({kind:m.kind,sourceId:m.source_id,
    weekIndex:m.occurred_week_index,importance:m.importance,
    relatedName:m.related_name,ownSide:m.own_side,winnerSide:m.winner_side})),
   conversations:[...conversations].reverse().map(x=>({
    conversationId:x.request_id,kind:x.kind,relatedPersonId:x.related_person_id,
    status:x.status,decision:x.decision,createdWeekIndex:x.created_week_index,
    respondedWeekIndex:x.responded_week_index,dueWeekIndex:x.due_week_index,
    promisedRole:x.promised_role,observedMatchShows:x.observed_match_shows,
    observedFeaturedShows:x.observed_featured_shows,
    assessmentReason:x.assessment_reason,trustDelta:x.trust_delta,
    workingVerifiedShows:x.working_verified_shows,
    workingTrustDelta:x.working_trust_delta,
    averageCrowd:x.observed_average_crowd===null?
     null:Number(x.observed_average_crowd),
    verifiedSinglesShows:x.rival_verified_matches,
    professionalTrust:x.rival_professional_trust===null?
     null:Number(x.rival_professional_trust),
    verifiedTagShows:x.team_verified_matches,
    averageExecution:x.observed_execution_quality===null?null:Number(x.observed_execution_quality),
    followThroughWeekIndex:x.follow_through_week_index,
    followThroughKind:x.follow_through_kind,
    observedAbsentWeeks:x.observed_absent_weeks,
    observedLosses:x.observed_losses,relevantTitle:x.relevant_title,
    careerStageAtRequest:x.career_stage_at_request,
   })),
   history:history.slice(0,50).map(x=>({
    revision:x.revision,persona:validatePortablePersona(x.previous_persona,wrestler.name),
    startedWeekIndex:x.started_week_index,endedWeekIndex:x.ended_week_index,
    changedByPromotionId:x.changed_by_promotion_id,
   })),recentRequests,archetypes:reference.archetypes,
   documentedAlternates:reference.documentedAlternates,
   worldYear:owns[0]!.year,worldWeek:owns[0]!.week,worldRevision:Number(owns[0]!.revision),
   canEdit:owns[0]!.booking_open&&wrestler.is_current,
   nextPitchWeek:recentRequests.length?recentRequests[0]!.submitted_week_index+12:0};
 });
}
