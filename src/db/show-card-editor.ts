/** Authenticated editor: bounded current-show reads and atomic full-card saves.
 * No full World hydration; a single 100-slot / 100-contract batch per save.
 */
import type {SqlRows} from "./world-operations.js";
import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {withSqlClient} from "./postgres.js";
import {readCardParticipants} from "../domain/card-participants.js";
import {uniqueShowAppearances} from "../domain/appearance-policy.js";
import {normalizeBookableMatch} from "../domain/bookable-match.js";
import {readBookedInterference} from "../simulation/legacy/match-interference.js";
import {readCanonicalMatchLayout} from "../domain/match-sides.js";
import {inferProgrammeMatchLinks} from "../domain/programme-match-links.js";
import {buildBookedSegmentPayload} from "../domain/segment-booking.js";
import type {SegmentKind,SegmentOutcome,VideoPurpose} from "../simulation/legacy/show-segments.js";
import type {SegmentCreativeBeat} from "../domain/segment-creative-beats.js";
import {contractAvailability} from "../domain/contract-availability.js";
import {originalPersonaBaseline} from "../domain/portable-persona.js";
export interface CardEditorIdentity{
 worldId:string;playerId:string;promotionId:string;showId:string;
}
export interface EditedMatchSlot{slotId:string;payload:unknown}
export interface EditedSegmentSlot{slotId:string;payload:unknown;
 programmeId?:string|null}
export interface SaveCardEditorInput extends CardEditorIdentity{
 requestId:string;expectedRevision:number;
 matches:readonly EditedMatchSlot[];
 /** Omitted preserves existing segments for old match-only clients. [] removes all. */
 segments?:readonly EditedSegmentSlot[];
 runningOrder:readonly string[];
}
const validId=(v:unknown):v is string=>
 typeof v==="string"&&v.trim().length>0&&v.length<=200;
type ShowRow={year:number;week:number;status:string;revision:string|number;
 show_day:number|null;venue_id:string|null;lock_ready_fingerprint:string|null;
 show_name:string|null;promotion_name:string;venue_name:string|null;market_name:string|null;
 booking_class:"REGULAR"|"PREMIUM";ticket_strategy:string|null;
 booking_open:boolean};
type SlotRow={slot_id:string;position:number;kind:string;payload:unknown};
type ContractRow={person_id:string;contract_id:string;name:string|null;
 popularity:number|null;recognition:number|null;momentum:number|null;
 in_ring_quality:number|null;match_craft:number|null;presentation:number|null;
 stamina:number|null;safety:number|null;fatigue:number|null;wear:number|null;
 default_alignment:string|null;active_alignment:string|null;
 booking_division:string|null;person_status:string|null;family:string|null;
 portable_gimmick_id:string|null;
 identity_exists:boolean;identity_name:string|null;identity_gimmick:string|null;
 identity_style:string|null;identity_signature:string|null;identity_finisher:string|null;
 status:string|null;start_week_index:number|null;expires_week_index:number|null;
 remaining_dates:number|null;exclusive_elsewhere:boolean};
async function readShowScope(tx:SqlRows,id:CardEditorIdentity):Promise<ShowRow>{
 if(![id.worldId,id.playerId,id.promotionId,id.showId].every(validId))
  throw new Error("Invalid card editor identity");
 const rows=await tx.query<ShowRow>([
  "SELECT w.year,w.week,w.revision,d.status,d.show_day,d.venue_id,",
  "d.lock_ready_fingerprint,d.show_name,d.booking_class,d.ticket_strategy,",
  "p.name AS promotion_name,v.name AS venue_name,mkt.name AS market_name,",
  "(w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS booking_open",
  "FROM ppw_worlds w JOIN ppw_booking_drafts d",
  "ON d.world_id=w.world_id AND d.year=w.year AND d.week=w.week",
  "JOIN ppw_promotions p ON p.world_id=d.world_id AND p.promotion_id=d.promotion_id",
  "LEFT JOIN ppw_venues v ON v.world_id=d.world_id AND v.venue_id=d.venue_id",
  "LEFT JOIN ppw_markets mkt ON mkt.world_id=d.world_id AND mkt.market_id=d.market_id",
  "JOIN ppw_promotion_controls c ON c.world_id=d.world_id",
  "AND c.promotion_id=d.promotion_id AND c.player_id=$2 AND c.active",
  "JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id",
  "AND m.status='ACTIVE'",
  "WHERE w.world_id=$1 AND d.promotion_id=$3 AND d.draft_id=$4",
  "AND p.lifecycle='ACTIVE'",
 ].join(" "),[id.worldId,id.playerId,id.promotionId,id.showId]);
 if(rows.length!==1)throw new Error("Current show not accessible to this controller");
 return rows[0]!;
}
function boundedSlots(slots:readonly SlotRow[]){
 if(slots.length>100||slots.some(s=>!validId(s.slot_id)||
  !Number.isSafeInteger(s.position)||s.position<0||s.position>1000||
  (s.kind!=="MATCH"&&s.kind!=="SEGMENT")))
  throw new Error("Card exceeds bounded slot capacity");
 return slots;
}
export async function readShowCardEditor(pool:TransactionPool,id:CardEditorIdentity){
 return withSqlClient(pool,async tx=>{
  const show=await readShowScope(tx,id);
  const slots=boundedSlots(await tx.query<SlotRow>(
   "SELECT slot_id,position,kind,payload FROM ppw_card_slots"+
   " WHERE world_id=$1 AND draft_id=$2 ORDER BY position LIMIT 101",
   [id.worldId,id.showId]));
  const personIds=[...new Set(slots.flatMap(s=>[
   ...readCardParticipants(s.payload).map(p=>p.personId),
   ...(s.kind==="MATCH"&&readBookedInterference(s.payload)?
    [readBookedInterference(s.payload)!.personId]:[])
  ]))];
  if(personIds.length>100)throw new Error("Too many show wrestler identities");
  const activeProgrammes=await tx.query<{
   programme_id:string;heat:number|null;repetition:number;label:string;follow_up:unknown}>([
   "SELECT p.programme_id,p.heat,p.repetition,",
   "COALESCE(string_agg(CASE WHEN r.side='A'",
   "THEN COALESCE(person.name,team.name,r.ref_id) END,' & '",
   "ORDER BY r.position),'Side A') || ' vs ' ||",
   "COALESCE(string_agg(CASE WHEN r.side='B'",
   "THEN COALESCE(person.name,team.name,r.ref_id) END,' & '",
   "ORDER BY r.position),'Side B') AS label,",
   "(SELECT jsonb_build_object('choice',d.choice,'weekIndex',d.chosen_week_index,",
   "'laterBeatRecorded',EXISTS (SELECT 1 FROM ppw_programme_resolved_activities a",
   "WHERE a.world_id=$1 AND a.promotion_id=$2",
   "AND a.programme_id=p.programme_id AND a.week_index>d.chosen_week_index))",
   "FROM ppw_programme_postshow_directions d",
   "WHERE d.world_id=$1 AND d.promotion_id=$2 AND d.programme_id=p.programme_id",
   "ORDER BY d.chosen_week_index DESC,d.chosen_at DESC LIMIT 1) AS follow_up",
   "FROM ppw_programmes p LEFT JOIN ppw_programme_side_refs r",
   "ON r.world_id=p.world_id AND r.promotion_id=p.promotion_id",
   "AND r.programme_id=p.programme_id",
   "LEFT JOIN ppw_people person ON person.world_id=r.world_id",
   "AND person.person_id=r.ref_id AND r.ref_kind='PERSON'",
   "LEFT JOIN ppw_tag_teams team ON team.world_id=r.world_id",
   "AND team.team_id=r.ref_id AND r.ref_kind='TEAM'",
   "WHERE p.world_id=$1 AND p.promotion_id=$2 AND p.status='ACTIVE'",
   "GROUP BY p.programme_id,p.heat,p.repetition",
   "ORDER BY p.programme_id LIMIT 101"
   ].join(" "),[id.worldId,id.promotionId]);
  if(activeProgrammes.length>100)throw new Error("Too many active programmes");
  const titles=await tx.query<{
   championship_id:string;name:string;division:"SINGLES"|"TAG";
   holder_name:string|null;current_reign_id:string|null;
  }>([
   "SELECT c.championship_id,c.name,c.division,c.current_reign_id,",
   "COALESCE(p.name,t.name) AS holder_name FROM ppw_championships c",
   "LEFT JOIN ppw_championship_reigns r ON r.world_id=c.world_id",
   "AND r.promotion_id=c.promotion_id AND r.championship_id=c.championship_id",
   "AND r.reign_id=c.current_reign_id AND r.status='ACTIVE'",
   "LEFT JOIN ppw_people p ON p.world_id=r.world_id AND p.person_id=r.person_id",
   "LEFT JOIN ppw_tag_teams t ON t.world_id=r.world_id AND t.team_id=r.team_id",
   "WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.status='ACTIVE'",
   "ORDER BY c.division,c.name,c.championship_id LIMIT 101"
  ].join(" "),[id.worldId,id.promotionId]);
  if(titles.length>100)throw new Error("Too many active championships");
  const links=await tx.query<{slot_id:string;programme_id:string}>(
   "SELECT slot_id,programme_id FROM ppw_programme_match_activities"+
   " WHERE world_id=$1 AND promotion_id=$2 AND draft_id=$3"+
   " AND kind='SEGMENT' ORDER BY slot_id LIMIT 101",
   [id.worldId,id.promotionId,id.showId]);
  if(links.length>100)throw new Error("Too many linked angles");
  const selectedPeople=personIds.length?await tx.query<{
   person_id:string;name:string;booking_division:string|null;
   in_ring_quality:number|null;match_craft:number|null;presentation:number|null;
   stamina:number|null;safety:number|null;fatigue:number|null;wear:number|null}>(
    "SELECT person_id,name,booking_division,in_ring_quality,match_craft,"+
    "presentation,stamina,safety,fatigue,wear FROM ppw_people"+
    " WHERE world_id=$1 AND person_id=ANY($2::text[])",
    [id.worldId,personIds]):[];
  return {selectedPeople:selectedPeople.map(p=>({
   personId:p.person_id,name:p.name,division:p.booking_division,
   inRingQuality:p.in_ring_quality,matchCraft:p.match_craft,presentation:p.presentation,
   stamina:p.stamina,safety:p.safety,fatigue:p.fatigue,wear:p.wear})),
   championships:titles.map(c=>({championshipId:c.championship_id,
    name:c.name,division:c.division,holderName:c.holder_name,
    vacant:c.current_reign_id===null})),
   programmes:activeProgrammes.map(p=>{
    const direction=p.follow_up&&typeof p.follow_up==="object"?
     p.follow_up as Record<string,unknown>:null;
    const choice=direction?.choice;
    const latestFollowUp=
     (choice==="PURSUE_REMATCH"||choice==="PLAN_RETALIATION"||choice==="LET_STAND")&&
      Number.isSafeInteger(direction?.weekIndex)&&
      typeof direction?.laterBeatRecorded==="boolean"?{
       choice:choice as "PURSUE_REMATCH"|"PLAN_RETALIATION"|"LET_STAND",
       weekIndex:direction.weekIndex as number,
       laterBeatRecorded:direction.laterBeatRecorded as boolean
      }:null;
    return {programmeId:p.programme_id,label:p.label,heat:p.heat,
     repetition:p.repetition,latestFollowUp};
   }),
   programmeLinks:links.map(x=>({slotId:x.slot_id,programmeId:x.programme_id})),
   showId:id.showId,year:show.year,week:show.week,
   worldRevision:Number(show.revision),canEdit:show.booking_open&&show.status==="DRAFT",
   ready:show.lock_ready_fingerprint!==null,
   day:show.show_day,venueId:show.venue_id,showName:show.show_name,
   promotionName:show.promotion_name,venueName:show.venue_name,
   marketName:show.market_name,bookingClass:show.booking_class,
   ticketStrategy:show.ticket_strategy,
   slots:slots.map(s=>({slotId:s.slot_id,position:s.position,
    kind:s.kind,payload:s.payload}))};
 });
}
/** Search the controlled promotion's contracts only; keyset limit 40. */
export async function readBookableCardTalent(pool:TransactionPool,id:CardEditorIdentity,
 search="",after:{name:string;personId:string;contractId:string}|null=null,limit=40){
 if(typeof search!=="string"||search.length>80||
  !Number.isSafeInteger(limit)||limit<1||limit>40||
  (after!==null&&!Object.values(after).every(validId)))
  throw new Error("Invalid card talent query");
 return withSqlClient(pool,async tx=>{
  const show=await readShowScope(tx,id);
  const week=(show.year-1)*52+show.week-1;
  const rows=await tx.query<ContractRow>([
    "SELECT c.person_id,c.contract_id,p.name,p.booking_division,",
    "p.popularity,p.recognition,p.momentum,p.in_ring_quality,p.match_craft,",
    "p.presentation,p.stamina,p.safety,p.fatigue,p.wear,",
    "p.default_alignment,aligned.alignment AS active_alignment,",
    "p.portable_gimmick_id,(identity.persona IS NOT NULL) AS identity_exists,",
    "identity.persona->>'personaName' AS identity_name,",
    "identity.persona->>'gimmickId' AS identity_gimmick,",
    "identity.persona->>'primaryStyle' AS identity_style,",
    "identity.persona->'signatureMoves'->0->>'name' AS identity_signature,",
    "identity.persona->'finishingMoves'->0->>'name' AS identity_finisher,",
    "p.status AS person_status,c.family,c.status,c.start_week_index,",
    "c.expires_week_index,c.remaining_dates,",
    "EXISTS(SELECT 1 FROM ppw_contracts other",
    "WHERE other.world_id=c.world_id AND other.person_id=c.person_id",
    "AND other.promotion_id<>c.promotion_id AND other.status='SIGNED'",
    "AND other.family='EXCLUSIVE' AND other.expires_week_index>=$5)",
    "AS exclusive_elsewhere",
    "FROM ppw_contracts c JOIN ppw_people p",
    "ON p.world_id=c.world_id AND p.person_id=c.person_id",
    "LEFT JOIN ppw_portable_personas identity ON identity.world_id=p.world_id",
    "AND identity.person_id=p.person_id",
    "LEFT JOIN ppw_promotion_wrestler_alignments aligned",
    "ON aligned.world_id=p.world_id AND aligned.person_id=p.person_id",
    "AND aligned.promotion_id=$2",
    "WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.status='SIGNED'",
    "AND (LOWER($3::text)='' OR POSITION(LOWER($3::text) IN LOWER(p.name))>0)",
    "AND ($4::text IS NULL OR (p.name,p.person_id,c.contract_id)>",
    "($4::text,$6::text,$7::text))",
    "ORDER BY p.name,p.person_id,c.contract_id LIMIT $8"
   ].join(" "),[id.worldId,id.promotionId,search,after?.name??null,week,
    after?.personId??null,after?.contractId??null,limit+1]);
  const page=rows.slice(0,limit);
  const talent=page.map(c=>{
   const rights=contractAvailability({family:c.family as
    "EXCLUSIVE"|"LIMITED_NON_EXCLUSIVE"|"ONE_OFF",
    status:c.status as "SIGNED",startWeekIndex:c.start_week_index??undefined,
    expiresWeekIndex:c.expires_week_index??-1,remainingDates:c.remaining_dates,
    currentWeekIndex:week});
   const baseline=originalPersonaBaseline(c.name??c.person_id,c.portable_gimmick_id);
   const ringName=c.identity_name?.trim()?c.identity_name:c.name;
   const gimmick=c.identity_gimmick??baseline.gimmickId;
   const identityStyle=c.identity_style??baseline.primaryStyle;
   // An intentionally empty edited repertoire remains empty.
   const signatureName=c.identity_exists?c.identity_signature:baseline.signatureMoves[0]?.name??null;
   const finisherName=c.identity_exists?c.identity_finisher:baseline.finishingMoves[0]?.name??null;
   return {personId:c.person_id,contractId:c.contract_id,name:c.name,
    ringName,gimmickId:gimmick??null,primaryStyle:identityStyle,
    signatureMove:signatureName,finisherMove:finisherName,
    alignment:c.active_alignment??c.default_alignment,
    popularity:c.popularity,recognition:c.recognition,momentum:c.momentum,
    inRingQuality:c.in_ring_quality,matchCraft:c.match_craft,presentation:c.presentation,
    stamina:c.stamina,safety:c.safety,fatigue:c.fatigue,wear:c.wear,
    division:c.booking_division,available:rights.available&&
     c.person_status==="ACTIVE"&&!c.exclusive_elsewhere,
    reason:c.person_status!=="ACTIVE"?"INACTIVE":
      c.exclusive_elsewhere?"EXCLUSIVE_ELSEWHERE":rights.reason,
    remainingDates:c.remaining_dates,expiresWeekIndex:c.expires_week_index};
  });
  const last=page.at(-1);
  return {talent,cursor:rows.length>limit&&last?{
   name:last.name!,personId:last.person_id,contractId:last.contract_id}:null};
 });
}
export async function saveShowCardMatches(pool:TransactionPool,input:SaveCardEditorInput){
 if(!Array.isArray(input.matches)||input.matches.length<1||
  input.matches.length>100||!Array.isArray(input.runningOrder)||
  input.runningOrder.length<1||input.runningOrder.length>100)
  throw new Error("Card must include 1–100 booked matches/slots");
 const matches=input.matches.map(m=>{
  if(!m||!validId(m.slotId))throw new Error("Invalid match slot ID");
  return {slotId:m.slotId,payload:normalizeBookableMatch(m.payload)};
 });
 if(input.segments!==undefined&&(!Array.isArray(input.segments)||
  input.segments.length>100))throw new Error("Invalid segment card");
 const authored=input.segments?.map(s=>{
  if(!s||!validId(s.slotId)||!s.payload||typeof s.payload!=="object"||
   Array.isArray(s.payload))throw new Error("Invalid segment card slot");
  const p=s.payload as Record<string,unknown>;
  const participants=readCardParticipants(p);
  if(s.programmeId!==undefined&&s.programmeId!==null&&!validId(s.programmeId))
   throw new Error("Invalid angle programme");
  if(["STABLE_INVITATION","STABLE_EXIT","STABLE_RECONCILIATION"].includes(String(p.kind))&&
   (typeof p.stableId!=="string"||!validId(p.stableId)))
   throw new Error("Book a stable before creating a faction story");
  if(["STABLE_INVITATION","STABLE_RECONCILIATION"].includes(String(p.kind))&&
   !["ACCEPTED","REJECTED"].includes(String(p.stableDecision)))
   throw new Error("Script the wrestler's faction decision");
  return {slotId:s.slotId,programmeId:s.programmeId??null,
   payload:buildBookedSegmentPayload({
   slotId:s.slotId,position:0,kind:p.kind as SegmentKind,
   actorIds:p.actorIds as string[],targetIds:p.targetIds as string[],
   outcome:p.outcome as SegmentOutcome,
   ...(p.videoPurpose===undefined?{}:{videoPurpose:p.videoPurpose as VideoPurpose}),
   ...(p.creativeBeat===undefined?{}:{creativeBeat:p.creativeBeat as SegmentCreativeBeat}),
   ...(p.turnTargetAlignment===undefined?{}:{
    turnTargetAlignment:p.turnTargetAlignment as "FACE"|"HEEL"|"TWEENER"}),
   ...(p.stableId===undefined?{}:{stableId:p.stableId as string}),
   ...(p.stableDecision===undefined?{}:{
    stableDecision:p.stableDecision as "ACCEPTED"|"REJECTED"}),
  },participants)};
 });
 const submitted=new Set(matches.map(x=>x.slotId));
 if(submitted.size!==matches.length)throw new Error("Duplicate match slot");
 if(authored&&(new Set(authored.map(s=>s.slotId)).size!==authored.length||
  authored.some(s=>submitted.has(s.slotId))))
  throw new Error("Duplicate card slot");
 if(input.runningOrder.some(x=>!validId(x))||
  new Set(input.runningOrder).size!==input.runningOrder.length||
  matches.some(m=>!input.runningOrder.includes(m.slotId)))
  throw new Error("Incomplete running order");
 const booked=matches.flatMap(m=>m.payload.participants);
 if(new Set(booked.map(p=>p.personId)).size!==booked.length)
  throw new Error("Wrestler may appear in only one match on a card");
 // Run-ins consume signed appearances, validated through the existing
 // bounded bulk contract lookup rather than an extra Neon query.
 const runIns=matches.flatMap(m=>{
  const spot=readBookedInterference(m.payload);
  if(!spot)return [];
  if(!spot.contractId)throw new Error("Choose the run-in wrestler's signed agreement before saving");
  return [{personId:spot.personId,contractId:spot.contractId}];
 });
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,requiresOpenWeek:true,
  commandType:"SAVE_SHOW_CARD_MATCHES",
  execute:async tx=>{
   const show=await readShowScope(tx,input);
   if(!show.booking_open||show.status!=="DRAFT")
    throw new Error("Show is not an editable current-week draft");
   const current=boundedSlots(await tx.query<SlotRow>(
    "SELECT slot_id,position,kind,payload FROM ppw_card_slots"+
    " WHERE world_id=$1 AND draft_id=$2 ORDER BY position LIMIT 101",
    [input.worldId,input.showId]));
   const existingSegments=current.filter(s=>s.kind==="SEGMENT");
   const segments=authored??existingSegments.map(s=>({
    slotId:s.slot_id,payload:s.payload
   }));
   if(matches.length+segments.length>100||
    input.runningOrder.length!==matches.length+segments.length)
    throw new Error("Show card slot capacity exceeded");
   const expected=new Set([...submitted,...segments.map(s=>s.slotId)]);
   if(input.runningOrder.some(id=>!expected.has(id))||
    new Set(input.runningOrder).size!==expected.size)
    throw new Error("Running order must include each match and segment exactly once");
   const linkedIds=[...new Set(authored?.flatMap(s=>s.programmeId?[s.programmeId]:[])??[])];
   if(linkedIds.length>100)throw new Error("Too many linked programmes");
   if(linkedIds.length){
    const active=await tx.query<{programme_id:string}>(
     "SELECT programme_id FROM ppw_programmes WHERE world_id=$1 AND promotion_id=$2"+
     " AND status='ACTIVE' AND programme_id=ANY($3::text[])",
     [input.worldId,input.promotionId,linkedIds]);
    if(active.length!==linkedIds.length)
     throw new Error("Only active promotion programmes may be booked");
   }
   const stableIds=[...new Set(authored?.flatMap(s=>
    s.payload.stableId?[s.payload.stableId]:[])??[])];
   if(stableIds.length){
    const active=await tx.query<{stable_id:string}>([
     "SELECT stable_id FROM ppw_stables WHERE world_id=$1",
     "AND promotion_id=$2 AND status='ACTIVE' AND stable_id=ANY($3::text[])"
    ].join(" "),[input.worldId,input.promotionId,stableIds]);
    if(active.length!==stableIds.length)
     throw new Error("Faction angle must refer to an active owned stable");
   }
   const appearances=uniqueShowAppearances([
    ...booked,...runIns,...segments.flatMap(s=>readCardParticipants(s.payload))]);
   if(appearances.length>100)throw new Error("Show exceeds 100 unique wrestlers");
   const ids=appearances.map(p=>p.personId),contracts=appearances.map(p=>p.contractId);
   const week=(show.year-1)*52+show.week-1;
   const rows=appearances.length?await tx.query<ContractRow>([
    "SELECT booked.person_id,booked.contract_id,p.name,p.booking_division,",
    "p.status AS person_status,c.family,c.status,c.start_week_index,",
    "c.expires_week_index,c.remaining_dates,",
    "EXISTS(SELECT 1 FROM ppw_contracts other WHERE",
    "other.world_id=$1 AND other.person_id=booked.person_id",
    "AND other.promotion_id<>$2 AND other.status='SIGNED'",
    "AND other.family='EXCLUSIVE' AND other.expires_week_index>=$5)",
    "AS exclusive_elsewhere",
    "FROM unnest($3::text[],$4::text[]) AS booked(person_id,contract_id)",
    "LEFT JOIN ppw_contracts c ON c.world_id=$1 AND c.promotion_id=$2",
    "AND c.person_id=booked.person_id AND c.contract_id=booked.contract_id",
    "LEFT JOIN ppw_people p ON p.world_id=$1 AND p.person_id=booked.person_id",
   ].join(" "),[input.worldId,input.promotionId,ids,contracts,week]):[];
   if(rows.length!==appearances.length)
    throw new Error("Incomplete contract lookup for booked show");
   const byContract=new Map(rows.map(r=>[r.person_id+"\0"+r.contract_id,r]));
   for(const appearance of appearances){
    const c=byContract.get(appearance.personId+"\0"+appearance.contractId);
    if(!c||c.person_status!=="ACTIVE"||c.exclusive_elsewhere||
     !contractAvailability({family:c.family as "ONE_OFF"|"LIMITED_NON_EXCLUSIVE"|"EXCLUSIVE",
      status:c.status as "SIGNED",remainingDates:c.remaining_dates,
      startWeekIndex:c.start_week_index??undefined,
      expiresWeekIndex:c.expires_week_index??-1,
      currentWeekIndex:week}).available)
     throw new Error("Booked wrestler lacks current contract rights");
   }
   for(const m of matches){
    const divisions=new Set(m.payload.participants.map(x=>
     byContract.get(x.personId+"\0"+x.contractId)?.booking_division));
    if(divisions.size!==1||
     !["MEN","WOMEN"].includes([...divisions][0]??""))
     throw new Error("Mixed or missing booking division in match");
   }
   // Only the controlled promotion's active championships may be booked.
   // The original title champion must be in the bout. A vacant title may
   // crown a winner through verified canonical World resolution instead.
   const titleMatches=matches.filter(m=>m.payload.championshipId!==undefined);
   if(titleMatches.length){
    const titleIds=titleMatches.map(m=>m.payload.championshipId!);
    if(new Set(titleIds).size!==titleIds.length)
     throw new Error("A title may be contested only once on a card");
    const titleRows=await tx.query<{championship_id:string;division:string;
     person_id:string|null;team_id:string|null;champion_people:string[]}>([
     "SELECT c.championship_id,c.division,r.person_id,r.team_id,",
     "ARRAY(SELECT person_id FROM ppw_tag_team_members",
     "WHERE world_id=c.world_id AND team_id=r.team_id AND active",
     "ORDER BY person_id) AS champion_people",
     "FROM ppw_championships c LEFT JOIN ppw_championship_reigns r",
     "ON r.world_id=c.world_id AND r.promotion_id=c.promotion_id",
     "AND r.championship_id=c.championship_id AND r.reign_id=c.current_reign_id",
     "AND r.status='ACTIVE'",
     "WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.status='ACTIVE'",
     "AND c.championship_id=ANY($3::text[])"
    ].join(" "),[input.worldId,input.promotionId,titleIds]);
    if(titleRows.length!==titleIds.length)
     throw new Error("Title must belong to the active promotion");
    const byTitle=new Map(titleRows.map(t=>[t.championship_id,t]));
    for(const m of titleMatches){
     const title=byTitle.get(m.payload.championshipId!)!;
     const layout=readCanonicalMatchLayout(m.payload);
     if(title.division==="SINGLES"){
      if(layout.family!=="INDIVIDUAL"||layout.sides.length<2||
       layout.sides.length>4||layout.ruleset==="ELIMINATION"||
       (title.person_id&&!m.payload.participants.some(x=>x.personId===title.person_id)))
       throw new Error("A singles title requires 2–4 wrestlers including its champion");
     }else if(title.division==="TAG"){
      if(layout.family!=="TEAMS"||layout.sides.length!==2||
       layout.sides.some(side=>side.participants.length!==2)||
       (title.team_id&&!layout.sides.some(side=>
        side.participants.map(x=>x.personId).sort().join("|")===
        [...title.champion_people].sort().join("|"))))
       throw new Error("A tag title requires 2v2 with the reigning team");
     }else throw new Error("Unsupported championship division");
    }
   }
   // Original PPW automatically ties a booked bout to an active rivalry
   // only when its two sides fit exactly one orientation of that feud.
   // Fetch all promotion-owned sides ONCE, never once per wrestler or match.
   const programmePeople=await tx.query<{
    programme_id:string;person_id:string;side:"A"|"B"}>([
    "SELECT pp.programme_id,pp.person_id,pp.side FROM ppw_programme_participants pp",
    "JOIN ppw_programmes p ON p.world_id=pp.world_id",
    "AND p.promotion_id=pp.promotion_id AND p.programme_id=pp.programme_id",
    "WHERE pp.world_id=$1 AND pp.promotion_id=$2 AND p.status='ACTIVE'",
    "ORDER BY pp.programme_id,pp.person_id LIMIT 401"
   ].join(" "),[input.worldId,input.promotionId]);
   if(programmePeople.length>400)throw new Error("Too many active programme members");
   const programmeMatchLinks=inferProgrammeMatchLinks(matches.flatMap(m=>{
    const layout=readCanonicalMatchLayout(m.payload);
    return layout.sides.length===2?[{
     slotId:m.slotId,sideA:layout.sides[0]!.participants.map(p=>p.personId),
     sideB:layout.sides[1]!.participants.map(p=>p.personId),
    }]:[];
   }),programmePeople.map(p=>({programmeId:p.programme_id,
    personId:p.person_id,side:p.side})));
   // Clear stale programme references and shift slot positions in one SQL
   // round trip, keeping the established 15-query booking transfer budget.
   await tx.query([
    "WITH removed_links AS (",
    "DELETE FROM ppw_programme_match_activities",
    "WHERE world_id=$1 AND promotion_id=$2 AND draft_id=$3",
    "AND (kind='MATCH' OR ($4::boolean AND kind='SEGMENT')) RETURNING slot_id)",
    "UPDATE ppw_card_slots SET position=position+10000",
    "WHERE world_id=$1 AND draft_id=$3"
   ].join(" "),[input.worldId,input.promotionId,input.showId,authored!==undefined]);
   await tx.query("DELETE FROM ppw_card_slots WHERE world_id=$1"+
    " AND draft_id=$2 AND kind='MATCH' AND NOT(slot_id=ANY($3::text[]))",
    [input.worldId,input.showId,matches.map(m=>m.slotId)]);
   const order=new Map(input.runningOrder.map((id,i)=>[id,i]));
   const inserted=await tx.query<{slot_id:string}>([
    "INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)",
    "SELECT $1,$2,x.slot_id,x.position,'MATCH',x.payload FROM",
    "jsonb_to_recordset($3::jsonb) AS x(slot_id text,position integer,payload jsonb)",
    "ON CONFLICT(world_id,draft_id,slot_id) DO UPDATE",
    "SET position=EXCLUDED.position,payload=EXCLUDED.payload RETURNING slot_id",
   ].join(" "),[input.worldId,input.showId,
    JSON.stringify(matches.map(m=>({slot_id:m.slotId,position:order.get(m.slotId)!,
     payload:m.payload})))]);
   if(inserted.length!==matches.length)throw new Error("Incomplete match card write");
   if(programmeMatchLinks.length){
    const linked=await tx.query<{slot_id:string}>([
     "INSERT INTO ppw_programme_match_activities",
     "(world_id,promotion_id,programme_id,draft_id,slot_id,kind)",
     "SELECT $1,$2,x.programme_id,$3,x.slot_id,'MATCH'",
     "FROM jsonb_to_recordset($4::jsonb) AS x(programme_id text,slot_id text)",
     "RETURNING slot_id"
    ].join(" "),[input.worldId,input.promotionId,input.showId,
     JSON.stringify(programmeMatchLinks.map(x=>({
      programme_id:x.programmeId,slot_id:x.slotId})))]);
    if(linked.length!==programmeMatchLinks.length)
     throw new Error("Incomplete automatic rivalry match links");
   }
   if(authored!==undefined){
    await tx.query("DELETE FROM ppw_card_slots WHERE world_id=$1 AND draft_id=$2"+
     " AND kind='SEGMENT' AND NOT(slot_id=ANY($3::text[]))",
     [input.worldId,input.showId,authored.map(s=>s.slotId)]);
    if(authored.length){
     const written=await tx.query<{slot_id:string}>([
      "INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)",
      "SELECT $1,$2,x.slot_id,x.position,'SEGMENT',x.payload FROM",
      "jsonb_to_recordset($3::jsonb) AS x(slot_id text,position integer,payload jsonb)",
      "ON CONFLICT(world_id,draft_id,slot_id) DO UPDATE",
      "SET position=EXCLUDED.position,kind='SEGMENT',payload=EXCLUDED.payload",
      "RETURNING slot_id",
     ].join(" "),[input.worldId,input.showId,
      JSON.stringify(authored.map(s=>({slot_id:s.slotId,position:order.get(s.slotId)!,
       payload:{...s.payload,position:order.get(s.slotId)!}})))]);
     if(written.length!==authored.length)throw new Error("Incomplete segment write");
    }
   }else if(segments.length){
    const moved=await tx.query<{slot_id:string}>([
     "UPDATE ppw_card_slots s SET position=x.position",
     "FROM jsonb_to_recordset($3::jsonb) AS x(slot_id text,position integer)",
     "WHERE s.world_id=$1 AND s.draft_id=$2 AND s.kind='SEGMENT'",
     "AND s.slot_id=x.slot_id RETURNING s.slot_id"
    ].join(" "),[input.worldId,input.showId,
     JSON.stringify(segments.map(s=>({
      slot_id:s.slotId,position:order.get(s.slotId)!})))]);
    if(moved.length!==segments.length)throw new Error("Incomplete segment running order");
   }
   if(authored!==undefined){
    const links=authored.flatMap(s=>s.programmeId?[{
     programme_id:s.programmeId,slot_id:s.slotId}]:[]);
    if(links.length){
     const inserted=await tx.query<{slot_id:string}>([
      "INSERT INTO ppw_programme_match_activities",
      "(world_id,promotion_id,programme_id,draft_id,slot_id,kind)",
      "SELECT $1,$2,x.programme_id,$3,x.slot_id,'SEGMENT'",
      "FROM jsonb_to_recordset($4::jsonb) AS x(programme_id text,slot_id text)",
      "RETURNING slot_id",
     ].join(" "),[input.worldId,input.promotionId,input.showId,JSON.stringify(links)]);
     if(inserted.length!==links.length)throw new Error("Incomplete angle programme links");
    }
   }
   // Original ready-to-run confirmation cannot survive changed booking.
   await tx.query([
    "UPDATE ppw_booking_drafts SET revision=revision+1,",
    "lock_ready_by_player_id=NULL,lock_ready_fingerprint=NULL,",
    "booking_expected_demand=NULL,booking_ticket_yield=NULL,",
    "booking_snapshot_fingerprint=NULL",
    "WHERE world_id=$1 AND draft_id=$2 AND promotion_id=$3",
   ].join(" "),[input.worldId,input.showId,input.promotionId]);
   return {showId:input.showId,matchCount:matches.length,
    segmentCount:segments.length,slotCount:input.runningOrder.length,performers:appearances.length,
    preparedForLock:false};
  },
 });
}
