/** Dedicated bounded Gorilla desk: 6 future-week cards, indexed owner-only reads.
 * No speculative polling, no rival booking reveal and no extra World deadline.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {applyWorldCommand} from "./world-commands.js";
import {readCardParticipants} from "../domain/card-participants.js";
import type {GorillaMatchInstruction,GorillaCrowdDirective,GorillaTimingDirective} from "../domain/gorilla-position.js";
const valid=(s:unknown):s is string=>typeof s==="string"&&s.length>0&&s.length<=200;
export interface GorillaScope{worldId:string;promotionId:string;playerId:string}
export interface GorillaMatchItem extends GorillaMatchInstruction{
 position:number;description:string;unavailable:string[];
}
export interface GorillaShowItem{
 showId:string;name:string;year:number;week:number;status:string;
 canEdit:boolean;matches:GorillaMatchItem[];
}
export async function readGorillaWorkspace(pool:TransactionPool,input:GorillaScope){
 if(!Object.values(input).every(valid))throw new Error("Invalid Gorilla scope");
 return withSqlClient(pool,async tx=>{
  const owners=await tx.query<{year:number;week:number;revision:string|number;
   can_edit:boolean;policy:string}>(`
   SELECT w.year,w.week,w.revision,
    (w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS can_edit,
    COALESCE(g.policy,'STICK_TO_CARD') AS policy
   FROM ppw_worlds w JOIN ppw_promotion_controls c
    ON c.world_id=w.world_id AND c.promotion_id=$3 AND c.player_id=$2 AND c.active
   JOIN ppw_memberships m ON m.world_id=c.world_id
    AND m.player_id=c.player_id AND m.status='ACTIVE'
   JOIN ppw_promotions p ON p.world_id=c.world_id
    AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'
   LEFT JOIN ppw_gorilla_policies g ON g.world_id=w.world_id
    AND g.promotion_id=c.promotion_id AND g.owner_player_id=c.player_id
   WHERE w.world_id=$1`,[input.worldId,input.playerId,input.promotionId]);
  if(owners.length!==1)throw new Error("Gorilla desk access denied");
  const owner=owners[0]!,now=(owner.year-1)*52+owner.week-1;
  const rows=await tx.query<{draft_id:string;show_name:string|null;year:number;
   week:number;status:string;slot_id:string|null;position:number|null;
   payload:unknown;stored_protect:boolean|null;stored_crowd:string|null;
   stored_timing:string|null;signature_valid:boolean|null}>(`
    SELECT d.draft_id,d.show_name,d.year,d.week,d.status,
     s.slot_id,s.position,s.payload,
     CASE WHEN g.slot_signature=md5(s.payload::text) THEN g.protect_script END AS stored_protect,
     CASE WHEN g.slot_signature=md5(s.payload::text) THEN g.crowd_choice END AS stored_crowd,
     CASE WHEN g.slot_signature=md5(s.payload::text) THEN g.timing_choice END AS stored_timing,
     (g.slot_signature=md5(s.payload::text)) AS signature_valid
    FROM ppw_booking_drafts d
    JOIN ppw_promotion_controls c ON c.world_id=d.world_id
     AND c.promotion_id=d.promotion_id AND c.player_id=$2 AND c.active
    LEFT JOIN ppw_card_slots s ON s.world_id=d.world_id
     AND s.draft_id=d.draft_id AND s.kind='MATCH'
    LEFT JOIN ppw_gorilla_match_instructions g ON g.world_id=s.world_id
     AND g.show_id=s.draft_id AND g.slot_id=s.slot_id
     AND g.owner_player_id=$2 AND g.promotion_id=$3
    WHERE d.world_id=$1 AND d.promotion_id=$3
     AND (d.year-1)*52+d.week-1 BETWEEN $4 AND $4+6
     AND d.status IN ('DRAFT','SUBMITTED')
    ORDER BY d.year,d.week,d.booking_class DESC,d.draft_id,s.position LIMIT 1401`,
    [input.worldId,input.playerId,input.promotionId,now]);
  if(rows.length>1400)throw new Error("Gorilla week card limit exceeded");
  const people=[...new Set(rows.flatMap(r=>r.slot_id===null?[]:
   readCardParticipants(r.payload).map(p=>p.personId)))];
  if(people.length>1400)throw new Error("Gorilla booked talent limit exceeded");
  const names=people.length?await tx.query<{person_id:string;name:string}>(
   "SELECT person_id,name FROM ppw_people WHERE world_id=$1 AND person_id=ANY($2::text[])",
   [input.worldId,people]):[];
  const nameOf=new Map(names.map(x=>[x.person_id,x.name]));
  const absences=people.length?await tx.query<{person_id:string;injured_week_index:number;cleared_week_index:number}>(`
   SELECT person_id,injured_week_index,cleared_week_index FROM ppw_medical_absences
   WHERE world_id=$1 AND person_id=ANY($2::text[]) AND status='ACTIVE'
    AND injured_week_index<$3 AND cleared_week_index>$4`,
   [input.worldId,people,now+7,now]):[];
  const shows=new Map<string,GorillaShowItem>();
  for(const r of rows){
   let show=shows.get(r.draft_id);
   if(!show){
    show={showId:r.draft_id,name:r.show_name??"Weekly show",
     year:r.year,week:r.week,status:r.status,
     canEdit:owner.can_edit,matches:[]};
    shows.set(r.draft_id,show);
   }
   if(r.slot_id===null)continue;
   const participants=readCardParticipants(r.payload);
   const cardWeek=(r.year-1)*52+r.week-1;
   const unavailable=new Set(absences.filter(a=>a.injured_week_index<cardWeek&&
    a.cleared_week_index>cardWeek).map(a=>a.person_id));
   show.matches.push({matchId:r.slot_id,position:r.position??0,
    description:participants.map(p=>nameOf.get(p.personId)??p.personId).join(" vs "),
    unavailable:participants.filter(p=>unavailable.has(p.personId))
     .map(p=>nameOf.get(p.personId)??p.personId),
    protectScript:r.stored_protect===true,
    crowdChoice:((["DELEGATE","PROTECT_SCRIPT","RESET_COMMENTARY","LET_CROWD_BREATHE"].includes(r.stored_crowd??"")
      ?r.stored_crowd:"DELEGATE") as GorillaCrowdDirective),
    timingChoice:((["DELEGATE","PROTECT_SCRIPT","TIGHTEN_TRANSITIONS"].includes(r.stored_timing??"")
      ?r.stored_timing:"DELEGATE") as GorillaTimingDirective)
   });
  }
  return {year:owner.year,week:owner.week,worldRevision:Number(owner.revision),
   canEdit:owner.can_edit,policy:owner.policy,shows:[...shows.values()]};
 });
}
export interface SaveGorillaShowInput extends GorillaScope {
 requestId:string;expectedRevision:number;showId:string;
 matches:readonly GorillaMatchInstruction[];
}
export async function saveGorillaShowInstructions(pool:TransactionPool,input:SaveGorillaShowInput){
 if(![input.worldId,input.promotionId,input.playerId,input.showId].every(valid)||
  !Array.isArray(input.matches)||input.matches.length>100||
  input.matches.some(m=>!valid(m.matchId)||
   typeof m.protectScript!=="boolean"||
   !["DELEGATE","PROTECT_SCRIPT","RESET_COMMENTARY","LET_CROWD_BREATHE"].includes(m.crowdChoice)||
   !["DELEGATE","PROTECT_SCRIPT","TIGHTEN_TRANSITIONS"].includes(m.timingChoice))||
  new Set(input.matches.map(m=>m.matchId)).size!==input.matches.length)
  throw new Error("Invalid Gorilla match instructions");
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  requiresOpenWeek:true,commandType:"SAVE_GORILLA_SHOW_INSTRUCTIONS",execute:async tx=>{
   const shows=await tx.query<{draft_id:string}>(`
    SELECT d.draft_id FROM ppw_booking_drafts d
    JOIN ppw_worlds w ON w.world_id=d.world_id
    JOIN ppw_promotion_controls c ON c.world_id=d.world_id
     AND c.promotion_id=d.promotion_id AND c.player_id=$2 AND c.active
    JOIN ppw_memberships m ON m.world_id=c.world_id
     AND m.player_id=c.player_id AND m.status='ACTIVE'
    JOIN ppw_promotions p ON p.world_id=c.world_id
     AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'
    WHERE d.world_id=$1 AND d.promotion_id=$3 AND d.draft_id=$4
     AND d.status IN ('DRAFT','SUBMITTED')
     AND (d.year-1)*52+d.week-1 BETWEEN (w.year-1)*52+w.week-1
      AND (w.year-1)*52+w.week+5`,
    [input.worldId,input.playerId,input.promotionId,input.showId]);
   if(shows.length!==1)throw new Error("Show unavailable for Gorilla instructions");
   const slots=await tx.query<{slot_id:string}>(`
    SELECT slot_id FROM ppw_card_slots WHERE world_id=$1
     AND draft_id=$2 AND kind='MATCH' ORDER BY position LIMIT 101`,
    [input.worldId,input.showId]);
   if(slots.length>100||slots.length!==input.matches.length||
    slots.some(s=>!input.matches.some(m=>m.matchId===s.slot_id)))
    throw new Error("Gorilla instructions must cover the current saved matches; reload the card");
   await tx.query("DELETE FROM ppw_gorilla_match_instructions WHERE world_id=$1 AND show_id=$2",
    [input.worldId,input.showId]);
   if(input.matches.length){
    const saved=await tx.query<{slot_id:string}>(`
     INSERT INTO ppw_gorilla_match_instructions
     (world_id,show_id,slot_id,promotion_id,owner_player_id,slot_signature,
      protect_script,crowd_choice,timing_choice)
     SELECT $1,$2,s.slot_id,$3,$4,md5(s.payload::text),
      choices.protect_script,choices.crowd_choice,choices.timing_choice
     FROM jsonb_to_recordset($5::jsonb)
      choices(match_id text,protect_script boolean,crowd_choice text,timing_choice text)
     JOIN ppw_card_slots s ON s.world_id=$1 AND s.draft_id=$2
      AND s.slot_id=choices.match_id AND s.kind='MATCH'
     RETURNING slot_id`,
     [input.worldId,input.showId,input.promotionId,input.playerId,
      JSON.stringify(input.matches.map(m=>({match_id:m.matchId,
       protect_script:m.protectScript,crowd_choice:m.crowdChoice,
       timing_choice:m.timingChoice})))]);
    if(saved.length!==input.matches.length)throw new Error("Gorilla card changed during save");
   }
   return {showId:input.showId,saved:input.matches.length};
  }});
}
