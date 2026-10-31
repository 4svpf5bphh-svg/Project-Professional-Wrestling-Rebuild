/** Controller-scoped results, composed from persisted World-authoritative receipts.
 * At most five bounded indexed reads; no World JSON, client scores or resimulation.
 */
import type {TransactionPool} from "./transaction.js";
import type {RoadAgentReport} from "../domain/road-agent-report.js";
import {readMatchStipulation,stipulationLabel} from "../domain/match-stipulations.js";
import type {GorillaShowLog} from "../domain/gorilla-position.js";
import {withSqlClient} from "./postgres.js";
import {validateCompletedShowReceipt,type CompletedShowReceipt}
 from "../domain/completed-show-receipt.js";
import type {CompletedSegmentStory} from "./completed-show-results.js";
import {readCardParticipants} from "../domain/card-participants.js";
import {readCanonicalMatchLayout} from "../domain/match-sides.js";
import {describeMatchFinish} from "../domain/show-match-story.js";
import {projectBroadcastIdentities,broadcastNameplate,type BroadcastIdentity}
 from "../domain/show-broadcast-personas.js";
import type {SegmentConsequenceIntent} from "../domain/segment-consequences.js";
import {parseVerifiedProgrammeBroadcast,type VerifiedProgrammeBroadcast}
 from "../domain/verified-programme-broadcast.js";
import {projectVerifiedBroadcastFallout,type BroadcastFallout,
 type RecordedMatchFalloutRow} from "../domain/verified-broadcast-fallout.js";
export interface CompletedMatchBroadcastContext{
 /** Locked card context, not an invented account of the match action. */
 format:string;intent:string;plannedMinutes:number|null;
 isMainEvent?:boolean;
 sides:string[][];sideParticipants?:{personId:string;name:string}[][];
  winnerNames:string[];championshipContested:boolean;
}
export interface CompletedAngleContext{
 actorNames:string[];targetNames:string[];
 videoPurpose:string|null;stableDecision:"ACCEPTED"|"REJECTED"|null;
 turnTargetAlignment:string|null;
}
export interface ShowResultEntry{
 slotId:string;position:number;type:"MATCH"|"SEGMENT";
 headline:string;summary:string;crowdResponse:number;
 outcome:string;actorIds:string[];targetIds:string[];
 intent?:SegmentConsequenceIntent|null;
 matchContext?:CompletedMatchBroadcastContext;
 fallout?:BroadcastFallout;
 segmentKind?:string;
 segmentContext?:CompletedAngleContext;
 performerIdentities?:BroadcastIdentity[];
 /** Programme history as it stood when this broadcast occurred. */
 programmeChapters?:VerifiedProgrammeBroadcast[];
}
export interface CompletedShowView {
 showId:string;year:number;week:number;crowdResponse:number;
 showName?:string;bookingClass?:"REGULAR"|"PREMIUM";
 resultsSkin?:"TERRITORY_TV"|"FIGHT_NIGHT"|"UNDERGROUND_ZINE"|"RETRO_BOOKER_02"|null;
 matchCount:number;angleCount:number;entries:ShowResultEntry[];staffReport?:RoadAgentReport|null;
 gorillaLog?:GorillaShowLog|null;
}
const human=(v:string)=>v.toLowerCase().replaceAll("_"," ")
 .replace(/(^|\s)\S/g,c=>c.toUpperCase());
export async function readCompletedShowView(
 pool:TransactionPool,input:{worldId:string;playerId:string;
  promotionId:string;showId:string},
):Promise<CompletedShowView>{
 if(!Object.values(input).every(x=>typeof x==="string"&&x.trim()&&x.length<=200))
  throw new Error("Invalid results scope");
 return withSqlClient(pool,async tx=>{
  const rows=await tx.query<{receipt_json:unknown;show_name:string|null;
    booking_class:"REGULAR"|"PREMIUM";results_skin:string|null;staff_report:RoadAgentReport|null;
    gorilla_log:GorillaShowLog|null}>(`
   SELECT c.receipt_json,d.show_name,d.booking_class,skin.style AS results_skin,
    report.analysis_json AS staff_report,
    gorilla.log_json AS gorilla_log FROM ppw_completed_shows c
   LEFT JOIN ppw_kp_results_skins skin ON skin.player_id=$2
   LEFT JOIN ppw_staff_show_reports report
    ON report.world_id=c.world_id AND report.show_id=c.show_id
   LEFT JOIN ppw_gorilla_show_logs gorilla
    ON gorilla.world_id=c.world_id AND gorilla.show_id=c.show_id
   JOIN ppw_booking_drafts d ON d.world_id=c.world_id AND d.draft_id=c.show_id
   JOIN ppw_promotion_controls p ON p.world_id=c.world_id
    AND p.promotion_id=c.promotion_id AND p.player_id=$2 AND p.active
   JOIN ppw_memberships m ON m.world_id=p.world_id
    AND m.player_id=p.player_id AND m.status='ACTIVE'
   WHERE c.world_id=$1 AND c.promotion_id=$3 AND c.show_id=$4`,
   [input.worldId,input.playerId,input.promotionId,input.showId]);
  if(rows.length!==1)throw new Error("Completed show unavailable to this controller");
  const receipt=validateCompletedShowReceipt(rows[0]!.receipt_json as CompletedShowReceipt);
  const slots=await tx.query<{slot_id:string;kind:string;position:number;payload:unknown}>(`
   SELECT slot_id,kind,position,payload FROM ppw_card_slots
   WHERE world_id=$1 AND draft_id=$2 ORDER BY position LIMIT 101`,
   [input.worldId,input.showId]);
  if(slots.length>100)throw new Error("Completed card exceeds slot capacity");
  const ids=[...new Set(slots.flatMap(s=>{
   const participants=readCardParticipants(s.payload).map(p=>p.personId);
   const raw=s.payload as Record<string,unknown>;
   const spot=raw.interference as Record<string,unknown>|undefined;
   if(s.kind==="MATCH"&&spot&&typeof spot.personId==="string")
    participants.push(spot.personId);
   // A booked finish cheater must belong to the card; older slots may
   // omit the identity, in which case we must not invent one.
   if(s.kind==="MATCH"&&typeof raw.cheatingWrestlerId==="string")
    participants.push(raw.cheatingWrestlerId);
   return participants;
  }))];
  if(ids.length>200)throw new Error("Completed card exceeds talent capacity");
  const people=ids.length?await tx.query<{person_id:string;name:string;
   portable_gimmick_id:string|null;persona_record:unknown|null}>(`
   SELECT p.person_id,p.name,p.portable_gimmick_id,
    COALESCE(historical.previous_persona,
     CASE WHEN identity.introduced_week_index<=$3 THEN identity.persona ELSE NULL END)
    AS persona_record
   FROM ppw_people p LEFT JOIN ppw_portable_personas identity
    ON identity.world_id=p.world_id AND identity.person_id=p.person_id
   LEFT JOIN LATERAL (
    SELECT h.previous_persona FROM ppw_portable_persona_history h
    WHERE h.world_id=p.world_id AND h.person_id=p.person_id
     AND h.started_week_index<=$3 AND h.ended_week_index>$3
    ORDER BY h.revision DESC LIMIT 1
   ) historical ON TRUE
   WHERE p.world_id=$1 AND p.person_id=ANY($2::text[])`,
   [input.worldId,ids,(receipt.year-1)*52+receipt.week-1]):[];
  const identities=projectBroadcastIdentities(people.map(p=>({
   personId:p.person_id,name:p.name,portableGimmickId:p.portable_gimmick_id??null,
   personaRecord:p.persona_record??null,
  })));
  const names=new Map(people.map(p=>[p.person_id,p.name]));
  const name=(id:string)=>broadcastNameplate(id,identities,
   names.get(id)??"Unknown wrestler");
  const personaFor=(ids:readonly string[])=>ids.flatMap(id=>{
   const persona=identities.get(id);return persona?[persona]:[];
  });
  // Fifth bounded read. Match evidence, settled title contests and saved
  // career injuries share a single indexed scan; no per-bout round-trips.
  const falloutRows=receipt.matches.length?await tx.query<RecordedMatchFalloutRow>(`
   SELECT m.match_id,e.evidence_json,
    championship.name AS championship_name,cc.title_changed,
    COALESCE(winner.name,winner_team.name) AS title_winner_name,
    COALESCE(prior_person.name,prior_team.name) AS title_prior_holder_name,
    facts.rating_stars AS report_rating_stars,
    facts.execution_quality AS report_execution_quality,
    facts.chemistry_modifier AS report_chemistry_modifier,
    facts.finish_cheater_person_id AS report_finish_cheater_person_id,
    facts.actual_minutes AS report_actual_minutes,
    facts.linked_programmes AS report_linked_programmes,
    facts.programme_signal AS report_programme_signal,
    COALESCE(facts.injuries_json,medical.injuries,'[]'::jsonb) AS injuries
   FROM ppw_completed_show_matches m
   LEFT JOIN ppw_completed_match_report_facts facts
    ON facts.world_id=m.world_id AND facts.show_id=m.show_id
    AND facts.match_id=m.match_id
   LEFT JOIN ppw_completed_match_evidence e
    ON e.world_id=m.world_id AND e.show_id=m.show_id AND e.match_id=m.match_id
   LEFT JOIN ppw_championship_contests cc
    ON cc.world_id=m.world_id AND cc.show_id=m.show_id AND cc.slot_id=m.match_id
   LEFT JOIN ppw_championships championship
    ON championship.world_id=cc.world_id
     AND championship.promotion_id=cc.promotion_id
     AND championship.championship_id=cc.championship_id
   LEFT JOIN ppw_people winner ON winner.world_id=cc.world_id
     AND winner.person_id=cc.winner_person_id
   LEFT JOIN ppw_tag_teams winner_team ON winner_team.world_id=cc.world_id
     AND winner_team.team_id=cc.winner_team_id
   LEFT JOIN ppw_championship_reigns prior ON prior.world_id=cc.world_id
     AND prior.promotion_id=cc.promotion_id
     AND prior.championship_id=cc.championship_id AND prior.reign_id=cc.prior_reign_id
   LEFT JOIN ppw_people prior_person ON prior_person.world_id=prior.world_id
     AND prior_person.person_id=prior.person_id
   LEFT JOIN ppw_tag_teams prior_team ON prior_team.world_id=prior.world_id
     AND prior_team.team_id=prior.team_id
   LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('person_id',inj.person_id,
      'injury_severity',inj.injury_severity,
      'injury_weeks_out',inj.injury_weeks_out) ORDER BY inj.person_id) AS injuries
    FROM (
     SELECT person_id,injury_severity,injury_weeks_out
      FROM ppw_tag_match_career_effects
      WHERE world_id=m.world_id AND show_id=m.show_id AND match_id=m.match_id
       AND injury_severity IS NOT NULL
     UNION ALL
     SELECT person_id,injury_severity,injury_weeks_out
      FROM ppw_individual_field_career_effects
      WHERE world_id=m.world_id AND show_id=m.show_id AND match_id=m.match_id
       AND injury_severity IS NOT NULL
    ) inj
   ) medical ON TRUE
   WHERE m.world_id=$1 AND m.show_id=$2
   ORDER BY m.position LIMIT 101`,
   [input.worldId,input.showId]):[];
  if(falloutRows.length>100)throw new Error("Historic match evidence exceeds show capacity");
  const byFallout=new Map(falloutRows.map(row=>[row.match_id,row]));
  if(byFallout.size!==falloutRows.length||
   falloutRows.length!==receipt.matches.length)
   throw new Error("Completed match evidence disagrees with results ledger");
  // One existing fifth bounded read carries both certified angle stories
  // and completed programme links. Prior context is twelve weeks *before*
  // this show's week, with no later results, and is indexed per programme.
  // We never fetch the entire World or make per-match network requests.
  const stories=await tx.query<{source:"STORY"|"PROGRAMME";
   slot_id:string;story_json:unknown;programme_context:unknown}>([
   "SELECT 'STORY'::text AS source,slot_id,story_json,",
   "NULL::jsonb AS programme_context FROM ppw_completed_show_segments",
   "WHERE world_id=$1 AND show_id=$2",
   "UNION ALL",
   "SELECT 'PROGRAMME'::text AS source,activity.slot_id,",
   "NULL::jsonb AS story_json,jsonb_build_object(",
   "'programmeId',activity.programme_id,",
   "'sideA',coalesce(sides.side_a,'Side A'),",
   "'sideB',coalesce(sides.side_b,'Side B'),",
   "'precedingMatches',past.matches,",
   "'precedingAngles',past.angles,",
   "'previousWinner',past.last_winner,",
   "'previousMatchWeek',past.last_match_week,",
   "'currentWinner',activity.winner_side) AS programme_context",
   "FROM ppw_programme_resolved_activities activity",
   "JOIN ppw_programmes programme ON programme.world_id=activity.world_id",
   "AND programme.promotion_id=activity.promotion_id",
   "AND programme.programme_id=activity.programme_id",
   "LEFT JOIN LATERAL (SELECT",
   "string_agg(coalesce(person.name,team.name,ref.ref_id),' & '",
   "ORDER BY ref.position) FILTER (WHERE ref.side='A') AS side_a,",
   "string_agg(coalesce(person.name,team.name,ref.ref_id),' & '",
   "ORDER BY ref.position) FILTER (WHERE ref.side='B') AS side_b",
   "FROM ppw_programme_side_refs ref",
   "LEFT JOIN ppw_people person ON person.world_id=ref.world_id",
   "AND ref.ref_kind='PERSON' AND person.person_id=ref.ref_id",
   "LEFT JOIN ppw_tag_teams team ON team.world_id=ref.world_id",
   "AND ref.ref_kind='TEAM' AND team.team_id=ref.ref_id",
   "WHERE ref.world_id=activity.world_id AND ref.promotion_id=activity.promotion_id",
   "AND ref.programme_id=activity.programme_id) sides ON TRUE",
   "LEFT JOIN LATERAL (SELECT",
   "count(*) FILTER (WHERE prior.kind='MATCH')::integer AS matches,",
   "count(*) FILTER (WHERE prior.kind='SEGMENT')::integer AS angles,",
   "max(prior.week_index) FILTER (WHERE prior.kind='MATCH') AS last_match_week,",
   "(array_agg(prior.winner_side ORDER BY prior.week_index DESC,",
   "prior.show_id DESC,prior.slot_id DESC)",
   "FILTER (WHERE prior.kind='MATCH'))[1] AS last_winner",
   "FROM ppw_programme_resolved_activities prior",
   "WHERE prior.world_id=activity.world_id",
   "AND prior.promotion_id=activity.promotion_id",
   "AND prior.programme_id=activity.programme_id",
   "AND prior.week_index BETWEEN greatest(0,activity.week_index-12)",
   "AND activity.week_index-1) past ON TRUE",
   "WHERE activity.world_id=$1 AND activity.show_id=$2",
   "AND activity.promotion_id=$3",
   "ORDER BY source,slot_id LIMIT 401"
  ].join(" "),[input.worldId,input.showId,input.promotionId]);
  if(stories.length>400)throw new Error("Completed show story context exceeds capacity");
  const byStory=new Map(stories.filter(s=>s.source==="STORY").map(s=>[
   s.slot_id,s.story_json as CompletedSegmentStory|null]));
  const programmesBySlot=new Map<string,VerifiedProgrammeBroadcast[]>();
  for(const record of stories.filter(s=>s.source==="PROGRAMME")){
   const chapter=parseVerifiedProgrammeBroadcast(record.programme_context);
   const own=programmesBySlot.get(record.slot_id)??[];
   if(own.length>=8)throw new Error("Excess programme links for one settled slot");
   own.push(chapter);programmesBySlot.set(record.slot_id,own);
  }
  const bySlot=new Map(slots.map(s=>[s.slot_id,s]));
  if(slots.length!==receipt.matches.length+receipt.segments.length)
   throw new Error("Completed show card changed since resolution");
  const entries:ShowResultEntry[]=[];
  const mainEventPosition=receipt.matches.reduce((n,m)=>Math.max(n,m.position),-1);
  for(const match of receipt.matches){
   const slot=bySlot.get(match.matchId);
   if(!slot||slot.kind!=="MATCH"||slot.position!==match.position)
    throw new Error("Completed match card changed since resolution");
   let winnerNames:string[]=[];
   let matchContext:CompletedMatchBroadcastContext|undefined;
   let participants=readCardParticipants(slot.payload).map(p=>p.personId);
   try{
    const layout=readCanonicalMatchLayout(slot.payload);
    const winners=layout.sides.find(s=>s.sideId===match.actualWinnerSide);
    winnerNames=winners?.participants.map(p=>name(p.personId))??[];
    participants=layout.participants.map(p=>p.personId);
    const payload=slot.payload as Record<string,unknown>;
    const size=layout.sides[0]?.participants.length??1;
    const format=layout.family==="TEAMS"?
     (layout.sides.length===2?String(size)+"v"+String(size):
      String(layout.sides.length)+"-team "+String(size)+"v"+String(size)):
     payload.matchType==="BATTLE_ROYAL"?"BATTLE ROYAL":
     layout.sides.length===2?"SINGLES":String(layout.sides.length)+"-WAY";
    const stipFormat=payload.matchType==="BATTLE_ROYAL"?"BATTLE_ROYAL":
     layout.family==="TEAMS"&&layout.sides.length===2?"TAG":
     layout.family==="TEAMS"?"MULTI_TEAM":
     layout.sides.length===3?"TRIPLE_THREAT":
     layout.sides.length===4?"FOUR_WAY":"SINGLES";
    const stipulation=readMatchStipulation(payload.stipulation,stipFormat);
    matchContext={format:stipulation==="STANDARD"?format:
      stipulationLabel(stipulation)+" · "+format,
     isMainEvent:match.position===mainEventPosition,
     intent:typeof payload.intent==="string"?payload.intent:"COMPETITIVE",
     plannedMinutes:typeof payload.plannedLengthMinutes==="number"?
      payload.plannedLengthMinutes:null,
     sides:layout.sides.map(side=>side.participants.map(p=>name(p.personId))),
     sideParticipants:layout.sides.map(side=>side.participants.map(p=>({
      personId:p.personId,name:name(p.personId)}))),
     winnerNames:[...winnerNames],
     championshipContested:typeof payload.championshipId==="string"&&
      payload.championshipId.length>0};
   }catch{/* Older completed matches still retain their finish and score. */}
   const {headline,summary}=describeMatchFinish({
    actualFinish:match.actualFinish,actualWinnerSide:match.actualWinnerSide,
    winnerNames,participants:participants.map(name),
   });
   entries.push({slotId:match.matchId,position:match.position,type:"MATCH",
    headline,summary,crowdResponse:match.crowdResponse,
    outcome:match.actualFinish,actorIds:participants,targetIds:[],
    performerIdentities:personaFor(participants),
    programmeChapters:programmesBySlot.get(match.matchId)??[],
    ...(matchContext?{matchContext}:{}),
    fallout:projectVerifiedBroadcastFallout(byFallout.get(match.matchId),
     receipt,match,name,new Map(matchContext?.sides.map((side,i)=>[
      i<26?String.fromCharCode(65+i):"A"+String.fromCharCode(65+i-26),side
     ])??[]),
     (slot.payload as {interference?:{personId?:string}}).interference?.personId??null,
     participants)});
  }
  for(const segment of receipt.segments){
   const slot=bySlot.get(segment.slotId);
   if(!slot||slot.kind!=="SEGMENT"||slot.position!==segment.position)
    throw new Error("Completed angle card changed since resolution");
   const story=byStory.get(segment.slotId);
   if(story&&(story.kind!==segment.kind||story.outcome!==segment.outcome||
    story.position!==segment.position))
    throw new Error("Segment story differs from World resolution");
   const angle=slot.payload as Record<string,unknown>;
   const actorNames=(story?.actorIds??[]).map(name);
   const targetNames=(story?.targetIds??[]).map(name);
   const decision=story?.stableDecision??angle.stableDecision;
   const segmentContext:CompletedAngleContext={
    actorNames,targetNames,
    videoPurpose:typeof angle.videoPurpose==="string"?angle.videoPurpose:null,
    stableDecision:decision==="ACCEPTED"||decision==="REJECTED"?decision:null,
    turnTargetAlignment:typeof angle.turnTargetAlignment==="string"?
     angle.turnTargetAlignment:null,
   };
   entries.push({slotId:segment.slotId,position:segment.position,type:"SEGMENT",
    headline:story?.headline??human(segment.kind),
    summary:story?.summary??"Authored outcome: "+human(segment.outcome)+".",
    crowdResponse:segment.crowdResponse,outcome:segment.outcome,
    actorIds:story?[...story.actorIds]:[],targetIds:story?[...story.targetIds]:[],
    intent:story?.intent??null,segmentKind:segment.kind,segmentContext,
    programmeChapters:programmesBySlot.get(segment.slotId)??[],
    performerIdentities:personaFor(story?[
     ...story.actorIds,...story.targetIds]:readCardParticipants(slot.payload)
      .map(x=>x.personId))});
  }
  entries.sort((a,b)=>a.position-b.position);
  return {showId:input.showId,year:receipt.year,week:receipt.week,
   showName:rows[0]!.show_name??(rows[0]!.booking_class==="PREMIUM"?
    "Premium event":"Weekly show"),bookingClass:rows[0]!.booking_class,
   crowdResponse:receipt.crowdResponse,matchCount:receipt.matches.length,
   angleCount:receipt.segments.length,entries,staffReport:rows[0]!.staff_report,
   gorillaLog:rows[0]!.gorilla_log,
   resultsSkin:rows[0]!.results_skin==="TERRITORY_TV"||rows[0]!.results_skin==="FIGHT_NIGHT"||rows[0]!.results_skin==="UNDERGROUND_ZINE"||rows[0]!.results_skin==="RETRO_BOOKER_02"?rows[0]!.results_skin:null};
 });
}
