/** One wrestler, on demand. Never called by directory or booking lists.
 * Uses indexed World + wrestler / promotion keys, bounded rows, no snapshots.
 */
import {withSqlClient} from "./postgres.js";
import {currentWrestlerTitlesJoin,normaliseCurrentTitles} from "./current-wrestler-titles.js";
import type {TransactionPool} from "./transaction.js";
import type {SqlRows} from "./world-operations.js";
import {effectiveWrestlerAlignment} from "../domain/original-alignment.js";
import {applyWorldCommand} from "./world-commands.js";
import {livingWrestlerMotivation} from "../domain/living-character-motivation.js";
import {originalPersonaBaseline,validatePortablePersona,WRESTLING_STYLES}
 from "../domain/portable-persona.js";
import type {PortablePersona,PortableIdentityMove} from "../domain/portable-identity-types.js";

export interface ProfileScope {
 worldId:string;promotionId:string;playerId:string;personId:string;
}
export interface RepertoireEdit extends ProfileScope {
 requestId:string;expectedRevision:number;
 primaryStyle:string|null;secondaryStyle:string|null;
 signatureMoves:string[];finishingMoves:string[];
}
const validId=(x:unknown)=>typeof x==="string"&&!!x.trim()&&x.length<=200;
const week=(year:number,number:number)=>(year-1)*52+number-1;
type Person={
 championship_titles:string[]|null;
 person_id:string;name:string;status:string;booking_division:string|null;
 career_stage:string|null;biological_age:number|null;
 career_experience:number|null;generated_talent:boolean;debut_week_index:number|null;
 popularity:number|null;recognition:number|null;
 momentum:number|null;morale:number|null;in_ring_quality:number|null;
 match_craft:number|null;presentation:number|null;stamina:number|null;
 safety:number|null;fatigue:number|null;wear:number|null;
 portable_gimmick_id:string|null;default_alignment:string|null;
 alignment:string|null;persona_record:unknown;
 motivation_memories:unknown;motivation_request:unknown;
 shared_human:boolean;
 medical_severity:string|null;medical_clearance_week_index:number|null;
};
type Contract={promotion_id:string;promotion_name:string;family:string;
 remaining_dates:number|null;start_week_index:number;expires_week_index:number;
 role_expectation:string|null;weekly_guarantee:string|null;
 appearance_fee:string|null;creative_control:string|null};
const authorised=async(tx:SqlRows,s:ProfileScope)=>{
 const row=await tx.query<{year:number;week:number;revision:string|number;seed:string|number;can_edit:boolean}>(
  "SELECT w.year,w.week,w.revision,w.seed,(w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS can_edit"+
  " FROM ppw_worlds w JOIN ppw_promotion_controls c ON c.world_id=w.world_id"+
  " AND c.promotion_id=$2 AND c.player_id=$3 AND c.active"+
  " JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id"+
  " AND m.status='ACTIVE' JOIN ppw_promotions owner ON owner.world_id=c.world_id"+
  " AND owner.promotion_id=c.promotion_id AND owner.lifecycle='ACTIVE' WHERE w.world_id=$1",
  [s.worldId,s.promotionId,s.playerId]);
 if(row.length!==1)throw new Error("Wrestler profile access denied");
 return {...row[0]!,currentWeekIndex:week(row[0]!.year,row[0]!.week)};
};
const personSql=String.raw`
 SELECT p.person_id,p.name,p.status,p.booking_division,p.career_stage,
  p.biological_age,p.career_experience,p.generated_talent,p.debut_week_index,
  p.popularity,p.recognition,p.momentum,p.morale,p.in_ring_quality,
  p.match_craft,p.presentation,p.stamina,p.safety,p.fatigue,p.wear,
  p.portable_gimmick_id,p.default_alignment,
  coalesce(aligned.alignment,p.default_alignment) AS alignment,
  current_titles.championship_titles,
  identity.persona AS persona_record,
  remembered.motivation_memories,expressed.motivation_request,
   medical.severity AS medical_severity,
   medical.cleared_week_index AS medical_clearance_week_index,
  EXISTS (
   SELECT 1 FROM ppw_contracts shared
   JOIN ppw_promotion_controls rival ON rival.world_id=shared.world_id
    AND rival.promotion_id=shared.promotion_id AND rival.active
   WHERE shared.world_id=p.world_id AND shared.person_id=p.person_id
    AND shared.promotion_id<>$2 AND shared.status='SIGNED'
    AND shared.start_week_index<=$4 AND shared.expires_week_index>=$4
   LIMIT 1
  ) AS shared_human
 FROM ppw_people p
 ${currentWrestlerTitlesJoin}
 LEFT JOIN ppw_medical_absences medical ON medical.world_id=p.world_id
   AND medical.person_id=p.person_id AND medical.status='ACTIVE'
   AND medical.injured_week_index<$4 AND medical.cleared_week_index>$4
  LEFT JOIN ppw_portable_personas identity ON identity.world_id=p.world_id
  AND identity.person_id=p.person_id
 LEFT JOIN ppw_promotion_wrestler_alignments aligned ON aligned.world_id=p.world_id
  AND aligned.person_id=p.person_id AND aligned.promotion_id=$2
 -- Bounded indexed lateral reads stay inside the existing one-person SELECT.
 -- No extra query or information from another human promotion.
 LEFT JOIN LATERAL (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'kind',recent.kind,'weekIndex',recent.occurred_week_index)
   ORDER BY recent.occurred_week_index DESC),'[]'::jsonb) AS motivation_memories
  FROM (SELECT kind,occurred_week_index FROM ppw_backstage_memories
   WHERE world_id=p.world_id AND promotion_id=$2 AND person_id=p.person_id
    AND occurred_week_index BETWEEN greatest(0,$4-26) AND $4
   ORDER BY occurred_week_index DESC,memory_id DESC LIMIT 12) recent
 ) remembered ON TRUE
 LEFT JOIN LATERAL (
  SELECT jsonb_build_object('kind',r.kind,'status',r.status,
   'createdWeekIndex',r.created_week_index,'dueWeekIndex',r.due_week_index,
   'relevantTitle',r.relevant_title,'decision',r.decision,
   'respondedWeekIndex',r.responded_week_index,
   'followThroughWeekIndex',r.follow_through_week_index,
   'relatedName',partner.name,
   'verifiedShows',coalesce(r.team_verified_matches,r.rival_verified_matches,
    r.working_verified_shows)) AS motivation_request
  FROM ppw_backstage_requests r
  LEFT JOIN ppw_people partner ON partner.world_id=r.world_id
   AND partner.person_id=r.related_person_id AND partner.status='ACTIVE'
   AND EXISTS(SELECT 1 FROM ppw_contracts partner_deal
    WHERE partner_deal.world_id=r.world_id
     AND partner_deal.promotion_id=r.promotion_id
     AND partner_deal.person_id=r.related_person_id
     AND partner_deal.status='SIGNED'
     AND partner_deal.start_week_index<=$4
     AND partner_deal.expires_week_index>=$4
     AND (partner_deal.family='EXCLUSIVE'
      OR partner_deal.remaining_dates IS NULL
      OR partner_deal.remaining_dates>0))
  WHERE r.world_id=p.world_id AND r.promotion_id=$2 AND r.person_id=p.person_id
   AND r.created_week_index BETWEEN greatest(0,$4-26) AND $4
   AND (r.status IN ('PENDING','PROMISED') OR
    (r.status='ANSWERED' AND r.follow_through_week_index IS NULL
     AND r.responded_week_index BETWEEN greatest(0,$4-8) AND $4
     AND ((r.kind='RIVALRY_PITCH' AND r.decision='EXPLORE_RIVALRY')
      OR (r.kind='TAG_TEAM_PITCH' AND r.decision='EXPLORE_TEAM'))
     AND partner.person_id IS NOT NULL))
  ORDER BY CASE WHEN r.status IN ('PENDING','PROMISED') THEN 0 ELSE 1 END,
   r.created_week_index DESC,r.request_id DESC LIMIT 1
 ) expressed ON TRUE
 WHERE p.world_id=$1 AND p.person_id=$3`;
function parsedPersona(p:Person):PortablePersona{
 return p.persona_record?
  validatePortablePersona(p.persona_record,p.name):
  originalPersonaBaseline(p.name,p.portable_gimmick_id);
}
export async function readWrestlerProfile(pool:TransactionPool,s:ProfileScope){
 if(![s.worldId,s.promotionId,s.playerId,s.personId].every(validId))
  throw new Error("Invalid wrestler profile scope");
 return withSqlClient(pool,async tx=>{
  const auth=await authorised(tx,s);
  const people=await tx.query<Person>(personSql,
   [s.worldId,s.promotionId,s.personId,auth.currentWeekIndex]);
  if(people.length!==1)throw new Error("Wrestler not found");
  const p=people[0]!;
  // Private payments: fetch detailed terms only for the current controller.
  const contracts=await tx.query<Contract>(String.raw`
   SELECT c.promotion_id,p.name AS promotion_name,c.family,c.remaining_dates,
    c.start_week_index,c.expires_week_index,
    CASE WHEN c.promotion_id=$3 THEN c.role_expectation ELSE NULL END AS role_expectation,
    CASE WHEN c.promotion_id=$3 THEN c.weekly_guarantee::text ELSE NULL END AS weekly_guarantee,
    CASE WHEN c.promotion_id=$3 THEN c.appearance_fee::text ELSE NULL END AS appearance_fee,
    CASE WHEN c.promotion_id=$3 THEN c.creative_control ELSE NULL END AS creative_control
   FROM ppw_contracts c JOIN ppw_promotions p ON p.world_id=c.world_id
    AND p.promotion_id=c.promotion_id
   WHERE c.world_id=$1 AND c.person_id=$2 AND c.status='SIGNED'
    AND c.expires_week_index>=$4
   ORDER BY (c.promotion_id=$3) DESC,c.expires_week_index DESC LIMIT 9`,
   [s.worldId,s.personId,s.promotionId,auth.currentWeekIndex]);
  const own=contracts.find(c=>c.promotion_id===s.promotionId &&
   c.start_week_index<=auth.currentWeekIndex);
  const isMemory=(value:unknown):value is {kind:string;weekIndex:number}=>{
   if(!value||typeof value!=="object")return false;
   const m=value as {kind?:unknown;weekIndex?:unknown};
   return typeof m.kind==="string"&&typeof m.weekIndex==="number";
  };
  const memories=Array.isArray(p.motivation_memories)?
   p.motivation_memories.filter(isMemory):[];
  const value=p.motivation_request;
  const request=value&&typeof value==="object"&&
   typeof (value as {kind?:unknown}).kind==="string"&&
   typeof (value as {status?:unknown}).status==="string"&&
   typeof (value as {createdWeekIndex?:unknown}).createdWeekIndex==="number"?
   value as {kind:string;status:string;createdWeekIndex:number;
    dueWeekIndex:number|null;relevantTitle:string|null;
    relatedName:string|null;verifiedShows:number|null;
    decision:string|null;respondedWeekIndex:number|null;
    followThroughWeekIndex:number|null}:null;
  const motivation=livingWrestlerMotivation({
   onRoster:!!own,status:p.status,careerStage:p.career_stage,
   momentum:p.momentum,morale:p.morale,fatigue:p.fatigue,
   currentWeekIndex:auth.currentWeekIndex,
   championships:normaliseCurrentTitles(p.championship_titles),
   memories,requests:request?[request]:[]
  });
  const teams=await tx.query<{name:string;team_id:string}>(String.raw`
   SELECT t.name,t.team_id FROM ppw_tag_team_members m
   JOIN ppw_tag_teams t ON t.world_id=m.world_id AND t.team_id=m.team_id
   WHERE m.world_id=$1 AND m.person_id=$2 AND m.active AND t.status='ACTIVE'
   ORDER BY t.name LIMIT 11`,[s.worldId,s.personId]);
  const stables=await tx.query<{name:string;stable_id:string}>(String.raw`
   SELECT s.name,s.stable_id FROM ppw_stable_memberships m
   JOIN ppw_stables s ON s.world_id=m.world_id AND s.promotion_id=m.promotion_id
    AND s.stable_id=m.stable_id
   WHERE m.world_id=$1 AND m.promotion_id=$2 AND m.person_id=$3
    AND m.active AND s.status='ACTIVE' ORDER BY s.name LIMIT 11`,
   [s.worldId,s.promotionId,s.personId]);
  const connections=await tx.query<{name:string;professional_trust:number;
   familiarity:number;rivalry_heat:number;affinity:number;tags:unknown}>(String.raw`
   SELECT other.name,r.professional_trust,r.familiarity,r.rivalry_heat,r.affinity,r.tags
   FROM ppw_wrestler_relationships r JOIN ppw_people other
    ON other.world_id=r.world_id
    AND other.person_id=CASE WHEN r.person_a_id=$2 THEN r.person_b_id ELSE r.person_a_id END
   WHERE r.world_id=$1 AND (r.person_a_id=$2 OR r.person_b_id=$2)
   ORDER BY r.familiarity DESC,r.professional_trust DESC LIMIT 9`,
   [s.worldId,s.personId]);
  const history=await tx.query<{revision:number;previous_persona:unknown;
   started_week_index:number;ended_week_index:number}>(String.raw`
   SELECT revision,previous_persona,started_week_index,ended_week_index
   FROM ppw_portable_persona_history
   WHERE world_id=$1 AND person_id=$2 ORDER BY revision DESC LIMIT 11`,
   [s.worldId,s.personId]);
  return {personId:p.person_id,name:p.name,division:p.booking_division,
   championships:normaliseCurrentTitles(p.championship_titles),
   status:p.status,careerStage:p.career_stage,
   biologicalAge:p.biological_age,careerExperience:p.career_experience,
   generatedTalent:p.generated_talent,debutWeekIndex:p.debut_week_index,
    medicalSeverity:p.medical_clearance_week_index===null?null:p.medical_severity,
    medicalWeeksRemaining:p.medical_clearance_week_index===null?null:
     p.medical_clearance_week_index-auth.currentWeekIndex,
   popularity:p.popularity,recognition:p.recognition,momentum:p.momentum,
   morale:p.morale,inRingQuality:p.in_ring_quality,matchCraft:p.match_craft,
   presentation:p.presentation,stamina:p.stamina,safety:p.safety,
   fatigue:p.fatigue,wear:p.wear,alignment:effectiveWrestlerAlignment(auth.seed,p.person_id,p.default_alignment,p.alignment),
   persona:parsedPersona(p),motivation,
   contracts:contracts.map(c=>({promotionId:c.promotion_id,promotion:c.promotion_name,
    isYours:c.promotion_id===s.promotionId,family:c.family,
    role:c.role_expectation,remainingDates:c.remaining_dates,
    startWeekIndex:c.start_week_index,expiresWeekIndex:c.expires_week_index,
    weeklyGuarantee:c.weekly_guarantee===null?null:Number(c.weekly_guarantee),
    appearanceFee:c.appearance_fee===null?null:Number(c.appearance_fee),
    creativeControl:c.creative_control})),
   teams:teams.slice(0,10).map(t=>({id:t.team_id,name:t.name})),
   stables:stables.slice(0,10).map(t=>({id:t.stable_id,name:t.name})),
   connections:connections.slice(0,8).map(c=>({
    name:c.name,professionalTrust:c.professional_trust,familiarity:c.familiarity,
    rivalryHeat:c.rivalry_heat,affinity:c.affinity,
    tags:Array.isArray(c.tags)?c.tags.filter((t):t is string=>typeof t==="string"):[],
   })),
   history:history.slice(0,10).map(h=>({
    revision:h.revision,persona:validatePortablePersona(h.previous_persona,p.name),
    from:h.started_week_index,to:h.ended_week_index})),
   onYourRoster:!!own,sharedHuman:p.shared_human,
   canEdit:!!own&&auth.can_edit&&!p.shared_human&&p.status==="ACTIVE",
   currentWeekIndex:auth.currentWeekIndex,worldRevision:Number(auth.revision)};
 });
}
function repertoireNames(value:unknown,label:string):string[]{
 if(!Array.isArray(value)||value.length>12||!value.every(x=>
  typeof x==="string"&&!!x.trim()&&x.length<=80))
  throw new Error("Invalid "+label+" repertoire");
 const trimmed=value.map((n:string)=>n.trim());
 if(new Set(trimmed.map((n:string)=>n.toLocaleLowerCase("en-GB"))).size!==trimmed.length)
  throw new Error("Duplicate "+label+" move names");
 return trimmed;
}
function moveList(previous:PortableIdentityMove[],names:string[]):PortableIdentityMove[]{
 return names.map(name=>{
  const known=previous.find(m=>m.name.toLowerCase()===name.toLowerCase());
  return known?{...known,name}: {name,category:"OTHER" as const,source:"PPW_AUTHORED" as const};
 });
}
/** An authorised human booker may correct moves and presentation style.
 * Repackaging/gimmick remains a separate wrestler-consent proposal.
 * Another human employer blocks unilateral edits of a shared identity.
 */
export async function editWrestlerRepertoire(pool:TransactionPool,s:RepertoireEdit){
 if(![s.worldId,s.promotionId,s.playerId,s.personId].every(validId)||
  ![s.primaryStyle,s.secondaryStyle].every(v=>v===null||
   WRESTLING_STYLES.some(style=>style===v))||
  s.primaryStyle!==null&&s.primaryStyle===s.secondaryStyle)
  throw new Error("Invalid wrestler style");
 const signatures=repertoireNames(s.signatureMoves,"signature");
 const finishes=repertoireNames(s.finishingMoves,"finisher");
 return applyWorldCommand(pool,{worldId:s.worldId,playerId:s.playerId,
  requestId:s.requestId,expectedRevision:s.expectedRevision,
  commandType:"EDIT_WRESTLER_REPERTOIRE",requiresOpenWeek:true,
  execute:async tx=>{
   const auth=await authorised(tx,s);
   const person=await tx.query<Person>(personSql,
    [s.worldId,s.promotionId,s.personId,auth.currentWeekIndex]);
   if(person.length!==1||person[0]!.shared_human||person[0]!.status!=="ACTIVE")
    throw new Error("Wrestler is not available for shared identity editing");
   const rights=await tx.query<{contract_id:string}>(String.raw`
    SELECT c.contract_id FROM ppw_contracts c
    WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.person_id=$3
     AND c.status='SIGNED' AND c.start_week_index<=$4
     AND c.expires_week_index>=$4 LIMIT 1`,
    [s.worldId,s.promotionId,s.personId,auth.currentWeekIndex]);
   if(rights.length!==1)throw new Error("Only your current roster is editable");
   const before=person[0]!,previous=parsedPersona(before);
   const next=validatePortablePersona({...previous,
    primaryStyle:s.primaryStyle,secondaryStyle:s.secondaryStyle,
    signatureMoves:moveList(previous.signatureMoves,signatures),
    finishingMoves:moveList(previous.finishingMoves,finishes),
    source:"GAME_AUTHORED"},before.name);
   const current=await tx.query<{revision:number;introduced_week_index:number}>(String.raw`
    SELECT revision,introduced_week_index FROM ppw_portable_personas
    WHERE world_id=$1 AND person_id=$2 FOR UPDATE`,[s.worldId,s.personId]);
   if(current.length){
    await tx.query(String.raw`
     UPDATE ppw_portable_personas SET revision=revision+1,persona=$3::jsonb,
      provenance='GAME_AUTHORED',introduced_week_index=$4,changed_by_promotion_id=$5
     WHERE world_id=$1 AND person_id=$2`,
     [s.worldId,s.personId,JSON.stringify(next),auth.currentWeekIndex,s.promotionId]);
    await tx.query(String.raw`
     INSERT INTO ppw_portable_persona_history(world_id,person_id,revision,
      previous_persona,started_week_index,ended_week_index,changed_by_promotion_id)
     VALUES($1,$2,$3,$4::jsonb,$5,$6,$7)`,
     [s.worldId,s.personId,current[0]!.revision,JSON.stringify(previous),
      current[0]!.introduced_week_index,auth.currentWeekIndex,s.promotionId]);
   }else{
    await tx.query(String.raw`
     INSERT INTO ppw_portable_personas(world_id,person_id,revision,persona,
      provenance,introduced_week_index,changed_by_promotion_id)
     VALUES($1,$2,1,$3::jsonb,'GAME_AUTHORED',$4,$5)`,
     [s.worldId,s.personId,JSON.stringify(next),auth.currentWeekIndex,s.promotionId]);
   }
   return {personId:s.personId,persona:next};
  }});
}
