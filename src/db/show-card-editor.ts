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
import {buildBookedSegmentPayload} from "../domain/segment-booking.js";
import type {SegmentKind,SegmentOutcome,VideoPurpose} from "../simulation/legacy/show-segments.js";
import {contractAvailability} from "../domain/contract-availability.js";
export interface CardEditorIdentity{
 worldId:string;playerId:string;promotionId:string;showId:string;
}
export interface EditedMatchSlot{slotId:string;payload:unknown}
export interface EditedSegmentSlot{slotId:string;payload:unknown}
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
 booking_open:boolean};
type SlotRow={slot_id:string;position:number;kind:string;payload:unknown};
type ContractRow={person_id:string;contract_id:string;name:string|null;
 booking_division:string|null;person_status:string|null;family:string|null;
 status:string|null;start_week_index:number|null;expires_week_index:number|null;
 remaining_dates:number|null;exclusive_elsewhere:boolean};
async function readShowScope(tx:SqlRows,id:CardEditorIdentity):Promise<ShowRow>{
 if(![id.worldId,id.playerId,id.promotionId,id.showId].every(validId))
  throw new Error("Invalid card editor identity");
 const rows=await tx.query<ShowRow>([
  "SELECT w.year,w.week,w.revision,d.status,d.show_day,d.venue_id,",
  "d.lock_ready_fingerprint,",
  "(w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS booking_open",
  "FROM ppw_worlds w JOIN ppw_booking_drafts d",
  "ON d.world_id=w.world_id AND d.year=w.year AND d.week=w.week",
  "JOIN ppw_promotions p ON p.world_id=d.world_id AND p.promotion_id=d.promotion_id",
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
  const personIds=[...new Set(slots.flatMap(s=>
   readCardParticipants(s.payload).map(p=>p.personId)))];
  if(personIds.length>100)throw new Error("Too many show wrestler identities");
  const selectedPeople=personIds.length?await tx.query<{
   person_id:string;name:string;booking_division:string|null}>(
    "SELECT person_id,name,booking_division FROM ppw_people"+
    " WHERE world_id=$1 AND person_id=ANY($2::text[])",
    [id.worldId,personIds]):[];
  return {selectedPeople:selectedPeople.map(p=>({
   personId:p.person_id,name:p.name,division:p.booking_division})),
   showId:id.showId,year:show.year,week:show.week,
   worldRevision:Number(show.revision),canEdit:show.booking_open&&show.status==="DRAFT",
   ready:show.lock_ready_fingerprint!==null,
   day:show.show_day,venueId:show.venue_id,
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
    "p.status AS person_status,c.family,c.status,c.start_week_index,",
    "c.expires_week_index,c.remaining_dates,",
    "EXISTS(SELECT 1 FROM ppw_contracts other",
    "WHERE other.world_id=c.world_id AND other.person_id=c.person_id",
    "AND other.promotion_id<>c.promotion_id AND other.status='SIGNED'",
    "AND other.family='EXCLUSIVE' AND other.expires_week_index>=$5)",
    "AS exclusive_elsewhere",
    "FROM ppw_contracts c JOIN ppw_people p",
    "ON p.world_id=c.world_id AND p.person_id=c.person_id",
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
   return {personId:c.person_id,contractId:c.contract_id,name:c.name,
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
  return {slotId:s.slotId,payload:buildBookedSegmentPayload({
   slotId:s.slotId,position:0,kind:p.kind as SegmentKind,
   actorIds:p.actorIds as string[],targetIds:p.targetIds as string[],
   outcome:p.outcome as SegmentOutcome,
   ...(p.videoPurpose===undefined?{}:{videoPurpose:p.videoPurpose as VideoPurpose}),
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
   const appearances=uniqueShowAppearances([
    ...booked,...segments.flatMap(s=>readCardParticipants(s.payload))]);
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
   // Protect unique running-order index while rearranging existing positions.
   await tx.query("UPDATE ppw_card_slots SET position=position+10000"+
    " WHERE world_id=$1 AND draft_id=$2",[input.worldId,input.showId]);
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
      slot_id:s.slot_id,position:order.get(s.slot_id)!})))]);
    if(moved.length!==segments.length)throw new Error("Incomplete segment running order");
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
