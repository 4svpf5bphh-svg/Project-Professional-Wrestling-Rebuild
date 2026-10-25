/** Wrestler career: on-demand, exact-person history; nothing preloaded by lists. */
import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";
import {liveAppearanceStatus,type LiveAppearanceStatus} from "../domain/live-appearance-history.js";
import {careerMatchLineup} from "../domain/career-match-lineup.js";
import {earnedWrestlerReputations,type EarnedReputation} from "../domain/earned-reputations.js";
import {readInjuryIncidents,type InjuryIncident} from "../domain/career-injury-incidents.js";
export interface CareerScope{worldId:string;playerId:string;promotionId:string;personId:string}
export interface CareerMatch{
 showId:string;matchId:string;showName:string;promotion:string;
 year:number;week:number;format:"SINGLES"|"TAG";won:boolean;
 stars:number|null;minutes:number|null;finish:string;
 injury:string|null;weeksOut:number|null;
 /** Null means surviving evidence does not identify partners/opponents. */
 partners:string[]|null;opponents:string[]|null;
}
export interface CareerView{
 personId:string;
 summary:{matches:number;wins:number;losses:number;singles:number;tag:number;
  ratedMatches:number;averageStars:number|null;bestStars:number|null;injuries:number};
 recent:CareerMatch[];
 /** Verified physical appearances: video-only promotion cannot establish a debut. */
 liveAppearances:{promotionId:string;promotion:string;
  status:LiveAppearanceStatus;
  recordedShows:number;firstWeekIndex:number|null;lastWeekIndex:number|null;
  weeksSinceLast:number|null;historyComplete:boolean}[];
 singlesTitles:{name:string;promotion:string;startWeekIndex:number;
  endedWeekIndex:number|null;defenses:number}[];
 /** Current titles only: inactive/broken team membership cannot imply past ownership. */
 currentChampionships:{name:string;promotion:string;holderType:"PERSON"|"TEAM";
  teamName:string|null;startWeekIndex:number;defenses:number}[];
 /** Six most recent verified injury incidents; current clearance is in the dossier. */
 injuryHistory:InjuryIncident[];
 reputations?:EarnedReputation[];
}
const id=(s:string)=>typeof s==="string"&&s.length>0&&s.length<=200;
type MatchRow={
 show_id:string;match_id:string;show_name:string|null;promotion_name:string;
 year:number;week:number;format:"SINGLES"|"TAG";won:boolean;
 rating_stars:string|null;actual_minutes:number|null;actual_finish:string;
 injury_severity:string|null;injury_weeks_out:number|null;
 lineup_json:unknown;injury_history:unknown;
 total_matches:string;total_wins:string;total_singles:string;total_tags:string;
 total_rated:string;average_stars:string|null;best_stars:string|null;total_injuries:string;
};
export async function readWrestlerCareer(pool:TransactionPool,scope:CareerScope):Promise<CareerView>{
 if(!Object.values(scope).every(id))throw new Error("Invalid wrestler career scope");
 return withSqlClient(pool,async tx=>{
  const authority=await tx.query<{person_id:string}>([
   "SELECT person.person_id FROM ppw_promotion_controls c",
   "JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id",
   "AND m.status='ACTIVE' JOIN ppw_promotions owner",
   "ON owner.world_id=c.world_id AND owner.promotion_id=c.promotion_id",
   "AND owner.lifecycle='ACTIVE' JOIN ppw_people person",
   "ON person.world_id=c.world_id AND person.person_id=$4",
   "WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.player_id=$3",
   "AND c.active LIMIT 1"
  ].join(" "),[scope.worldId,scope.promotionId,scope.playerId,scope.personId]);
  if(authority.length!==1)throw new Error("Wrestler career access denied");
  // Person-keyed indexed activity, window totals, only 12 recent matches returned.
  // NULL report facts remain unknown rather than fabricated historical stars.
  const matches=await tx.query<MatchRow>([
   "WITH activity AS (SELECT e.world_id,e.show_id,e.match_id,e.won,",
   "e.injury_severity,e.injury_weeks_out,'SINGLES'::text AS format",
   "FROM ppw_individual_field_career_effects e",
   "WHERE e.world_id=$1 AND e.person_id=$2 UNION ALL",
   "SELECT e.world_id,e.show_id,e.match_id,e.won,e.injury_severity,",
   "e.injury_weeks_out,'TAG'::text AS format",
   "FROM ppw_tag_match_career_effects e WHERE e.world_id=$1 AND e.person_id=$2",
   "), career AS (",
   "SELECT a.show_id,a.match_id,a.won,a.format,a.injury_severity,a.injury_weeks_out,",
   "s.year,s.week,p.name AS promotion_name,d.show_name,m.actual_finish,",
   "lineup.lineup_json,",
   "f.rating_stars,f.actual_minutes FROM activity a",
   "JOIN ppw_completed_shows s ON s.world_id=a.world_id AND s.show_id=a.show_id",
   "JOIN ppw_promotions p ON p.world_id=s.world_id AND p.promotion_id=s.promotion_id",
   "JOIN ppw_completed_show_matches m ON m.world_id=a.world_id",
   "AND m.show_id=a.show_id AND m.match_id=a.match_id",
   "LEFT JOIN ppw_booking_drafts d ON d.world_id=s.world_id AND d.draft_id=s.show_id",
   "LEFT JOIN ppw_card_slots card ON card.world_id=a.world_id",
   "AND card.draft_id=a.show_id AND card.slot_id=a.match_id AND card.kind='MATCH'",
   "LEFT JOIN LATERAL (",
   "SELECT jsonb_agg(jsonb_build_array(perf.person_id,perf.name,",
   "side.item->>'sideId') ORDER BY side.ordinal,member.ordinal) AS lineup_json",
   "FROM jsonb_array_elements(CASE",
   "WHEN jsonb_typeof(card.payload->'sides')='array' THEN card.payload->'sides'",
   "ELSE '[]'::jsonb END)",
   "WITH ORDINALITY AS side(item,ordinal)",
   "CROSS JOIN LATERAL jsonb_array_elements(CASE",
   "WHEN jsonb_typeof(side.item->'participants')='array'",
   "THEN side.item->'participants' ELSE '[]'::jsonb END)",
   "WITH ORDINALITY AS member(item,ordinal)",
   "JOIN ppw_people perf ON perf.world_id=a.world_id",
   "AND perf.person_id=member.item->>'personId'",
   ") lineup ON TRUE",
   "LEFT JOIN ppw_completed_match_report_facts f ON f.world_id=a.world_id",
   "AND f.show_id=a.show_id AND f.match_id=a.match_id)",
   ", recent_injuries AS (",
   "SELECT show_id,match_id,year,week,format,injury_severity,",
   "injury_weeks_out,promotion_name FROM career",
   "WHERE injury_severity IS NOT NULL AND injury_weeks_out IS NOT NULL",
   "ORDER BY year DESC,week DESC,show_id DESC,match_id DESC LIMIT 6",
   "), injury_summary AS (",
   "SELECT coalesce(jsonb_agg(jsonb_build_object(",
   "'showId',inc.show_id,'matchId',inc.match_id,",
   "'year',inc.year,'week',inc.week,'severity',inc.injury_severity,",
   "'originalWeeksOut',inc.injury_weeks_out,'promotion',inc.promotion_name,",
   "'format',inc.format)",
   "ORDER BY inc.year DESC,inc.week DESC,inc.show_id DESC,inc.match_id DESC),",
   "'[]'::jsonb) AS injury_history FROM recent_injuries inc",
   ")",
   "SELECT career.*,injury_summary.injury_history,",
   "count(*) OVER()::text AS total_matches,",
   "count(*) FILTER(WHERE won) OVER()::text AS total_wins,",
   "count(*) FILTER(WHERE format='SINGLES') OVER()::text AS total_singles,",
   "count(*) FILTER(WHERE format='TAG') OVER()::text AS total_tags,",
   "count(rating_stars) OVER()::text AS total_rated,",
   "avg(rating_stars) OVER()::text AS average_stars,",
   "max(rating_stars) OVER()::text AS best_stars,",
   "count(*) FILTER(WHERE injury_severity IS NOT NULL) OVER()::text AS total_injuries",
   "FROM career CROSS JOIN injury_summary",
   "ORDER BY year DESC,week DESC,show_id DESC,match_id DESC LIMIT 12"
  ].join(" "),[scope.worldId,scope.personId]);
  const titles=await tx.query<{name:string;promotion_name:string;
   start_week_index:number;ended_week_index:number|null;defenses:number;
   holder_type:"PERSON"|"TEAM";team_name:string|null;is_current:boolean}>([
   "SELECT title.name,p.name AS promotion_name,reign.start_week_index,",
   "reign.ended_week_index,reign.defenses,reign.holder_type,",
   "team.name AS team_name,",
   "(title.status='ACTIVE' AND reign.status='ACTIVE'",
   "AND title.current_reign_id=reign.reign_id) AS is_current",
   "FROM ppw_championship_reigns reign",
   "JOIN ppw_championships title ON title.world_id=reign.world_id",
   "AND title.promotion_id=reign.promotion_id AND title.championship_id=reign.championship_id",
   "JOIN ppw_promotions p ON p.world_id=reign.world_id",
   "AND p.promotion_id=reign.promotion_id",
   "LEFT JOIN ppw_tag_team_members member ON member.world_id=reign.world_id",
   "AND member.team_id=reign.team_id AND member.person_id=$2 AND member.active",
   "LEFT JOIN ppw_tag_teams team ON team.world_id=reign.world_id",
   "AND team.team_id=member.team_id AND team.status='ACTIVE'",
   "WHERE reign.world_id=$1 AND (",
   "(reign.holder_type='PERSON' AND reign.person_id=$2) OR",
   "(reign.holder_type='TEAM' AND team.team_id IS NOT NULL",
   "AND title.status='ACTIVE' AND reign.status='ACTIVE'",
   "AND title.current_reign_id=reign.reign_id))",
   "ORDER BY reign.start_week_index DESC,reign.reign_id DESC LIMIT 17"
  ].join(" "),[scope.worldId,scope.personId]);
  // A single additional person-keyed read, ONLY on explicit dossier expansion.
  // Match effects and immutable completed angle stories are proof of a live
  // appearance. Never treat video packages, booking-date consumption or an
  // interrupted/declined off-screen pitch as proof of a completed in-person act.
  // Older shows without complete proof remain UNKNOWN, not a fabricated debut.
  const history=await tx.query<{
   promotion_id:string;promotion_name:string;recorded_shows:string;
   first_week_index:number|null;last_week_index:number|null;
   missing_proof:boolean;current_week_index:number;
  }>([
   "WITH physical AS (",
   "SELECT world_id,show_id FROM ppw_individual_field_career_effects",
   "WHERE world_id=$1 AND person_id=$2",
   "UNION SELECT world_id,show_id FROM ppw_tag_match_career_effects",
   "WHERE world_id=$1 AND person_id=$2",
   "UNION SELECT world_id,show_id FROM ppw_completed_show_segments",
   "WHERE world_id=$1 AND kind<>'VIDEO_PACKAGE'",
   "AND authored_outcome IN ('HAPPENS','INTERRUPTED')",
   "AND (story_json @> jsonb_build_object('actorIds',jsonb_build_array($2::text))",
   "OR story_json @> jsonb_build_object('targetIds',jsonb_build_array($2::text)))",
   "), visits AS (",
   "SELECT show.promotion_id,show.show_id,(show.year-1)*52+show.week-1 AS week_index",
   "FROM physical JOIN ppw_completed_shows show ON show.world_id=physical.world_id",
   "AND show.show_id=physical.show_id",
   "JOIN ppw_worlds w ON w.world_id=show.world_id",
   "WHERE (show.year-1)*52+show.week-1<=(w.year-1)*52+w.week-1",
   "), aggregates AS (",
   "SELECT promotion_id,count(*)::text AS recorded_shows,",
   "min(week_index)::integer AS first_week_index,",
   "max(week_index)::integer AS last_week_index FROM visits GROUP BY promotion_id",
   "), employers AS (",
   "SELECT promotion_id FROM aggregates UNION SELECT $3::text",
   ")",
   "SELECT p.promotion_id,p.name AS promotion_name,",
   "coalesce(a.recorded_shows,'0') AS recorded_shows,",
   "a.first_week_index,a.last_week_index,",
   "(SELECT (w.year-1)*52+w.week-1 FROM ppw_worlds w",
   "WHERE w.world_id=p.world_id) AS current_week_index,",
   "EXISTS(SELECT 1 FROM ppw_completed_shows done",
   "LEFT JOIN ppw_show_resolutions r ON r.world_id=done.world_id",
   "AND r.show_id=done.show_id",
   "WHERE done.world_id=p.world_id AND done.promotion_id=p.promotion_id",
   "AND (r.appearance_person_ids IS NULL",
   "OR EXISTS(SELECT 1 FROM ppw_completed_show_segments angle",
   "WHERE angle.world_id=done.world_id AND angle.show_id=done.show_id",
   "AND angle.kind<>'VIDEO_PACKAGE' AND angle.story_json IS NULL))",
   "LIMIT 1) AS missing_proof",
   "FROM employers e JOIN ppw_promotions p",
   "ON p.world_id=$1 AND p.promotion_id=e.promotion_id",
   "LEFT JOIN aggregates a ON a.promotion_id=p.promotion_id",
   "ORDER BY (p.promotion_id=$3) DESC,p.name,p.promotion_id LIMIT 17"
  ].join(" "),[scope.worldId,scope.personId,scope.promotionId]);
  if(history.length>16)throw new Error("Too many company appearance histories");
  const liveAppearances=history.map(h=>{
   const weeksSince=h.last_week_index===null?null:
    h.current_week_index-h.last_week_index;
   const status=liveAppearanceStatus(!h.missing_proof,h.last_week_index,h.current_week_index);
   return {promotionId:h.promotion_id,promotion:h.promotion_name,status,
    recordedShows:Number(h.recorded_shows),firstWeekIndex:h.first_week_index,
    lastWeekIndex:h.last_week_index,weeksSinceLast:weeksSince,
    historyComplete:!h.missing_proof};
  });
  const total=matches[0];
  const n=(v:string|null|undefined)=>v==null?0:Number(v);
  const count=n(total?.total_matches),wins=n(total?.total_wins);
  const record={personId:scope.personId,
   summary:{matches:count,wins,losses:count-wins,
    singles:n(total?.total_singles),tag:n(total?.total_tags),
    ratedMatches:n(total?.total_rated),
    averageStars:total?.average_stars==null?null:Number(total.average_stars),
    bestStars:total?.best_stars==null?null:Number(total.best_stars),
    injuries:n(total?.total_injuries)},
   liveAppearances,
   injuryHistory:readInjuryIncidents(total?.injury_history),
   recent:matches.map(m=>({
    showId:m.show_id,matchId:m.match_id,showName:m.show_name??"PPW event",
    promotion:m.promotion_name,year:m.year,week:m.week,format:m.format,
    won:m.won,stars:m.rating_stars==null?null:Number(m.rating_stars),
    minutes:m.actual_minutes,finish:m.actual_finish,
    injury:m.injury_severity,weeksOut:m.injury_weeks_out,
    ...careerMatchLineup(m.lineup_json,scope.personId)
   })),
   singlesTitles:titles.filter(t=>t.holder_type==="PERSON").slice(0,8)
    .map(t=>({name:t.name,promotion:t.promotion_name,
     startWeekIndex:t.start_week_index,endedWeekIndex:t.ended_week_index,
     defenses:t.defenses})),
   currentChampionships:titles.filter(t=>t.is_current).slice(0,8).map(t=>({
    name:t.name,promotion:t.promotion_name,holderType:t.holder_type,
    teamName:t.team_name,startWeekIndex:t.start_week_index,defenses:t.defenses
   }))};
  return {...record,reputations:earnedWrestlerReputations(record)};
 });
}
