/** Wrestler career: on-demand, exact-person history; nothing preloaded by lists. */
import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";
export interface CareerScope{worldId:string;playerId:string;promotionId:string;personId:string}
export interface CareerMatch{
 showId:string;matchId:string;showName:string;promotion:string;
 year:number;week:number;format:"SINGLES"|"TAG";won:boolean;
 stars:number|null;minutes:number|null;finish:string;
 injury:string|null;weeksOut:number|null;
}
export interface CareerView{
 personId:string;
 summary:{matches:number;wins:number;losses:number;singles:number;tag:number;
  ratedMatches:number;averageStars:number|null;bestStars:number|null;injuries:number};
 recent:CareerMatch[];
 singlesTitles:{name:string;promotion:string;startWeekIndex:number;
  endedWeekIndex:number|null;defenses:number}[];
}
const id=(s:string)=>typeof s==="string"&&s.length>0&&s.length<=200;
type MatchRow={
 show_id:string;match_id:string;show_name:string|null;promotion_name:string;
 year:number;week:number;format:"SINGLES"|"TAG";won:boolean;
 rating_stars:string|null;actual_minutes:number|null;actual_finish:string;
 injury_severity:string|null;injury_weeks_out:number|null;
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
   "f.rating_stars,f.actual_minutes FROM activity a",
   "JOIN ppw_completed_shows s ON s.world_id=a.world_id AND s.show_id=a.show_id",
   "JOIN ppw_promotions p ON p.world_id=s.world_id AND p.promotion_id=s.promotion_id",
   "JOIN ppw_completed_show_matches m ON m.world_id=a.world_id",
   "AND m.show_id=a.show_id AND m.match_id=a.match_id",
   "LEFT JOIN ppw_booking_drafts d ON d.world_id=s.world_id AND d.draft_id=s.show_id",
   "LEFT JOIN ppw_completed_match_report_facts f ON f.world_id=a.world_id",
   "AND f.show_id=a.show_id AND f.match_id=a.match_id)",
   "SELECT *,count(*) OVER()::text AS total_matches,",
   "count(*) FILTER(WHERE won) OVER()::text AS total_wins,",
   "count(*) FILTER(WHERE format='SINGLES') OVER()::text AS total_singles,",
   "count(*) FILTER(WHERE format='TAG') OVER()::text AS total_tags,",
   "count(rating_stars) OVER()::text AS total_rated,",
   "avg(rating_stars) OVER()::text AS average_stars,",
   "max(rating_stars) OVER()::text AS best_stars,",
   "count(*) FILTER(WHERE injury_severity IS NOT NULL) OVER()::text AS total_injuries",
   "FROM career ORDER BY year DESC,week DESC,show_id DESC,match_id DESC LIMIT 12"
  ].join(" "),[scope.worldId,scope.personId]);
  const titles=await tx.query<{name:string;promotion_name:string;
   start_week_index:number;ended_week_index:number|null;defenses:number}>([
   "SELECT title.name,p.name AS promotion_name,reign.start_week_index,",
   "reign.ended_week_index,reign.defenses FROM ppw_championship_reigns reign",
   "JOIN ppw_championships title ON title.world_id=reign.world_id",
   "AND title.promotion_id=reign.promotion_id AND title.championship_id=reign.championship_id",
   "JOIN ppw_promotions p ON p.world_id=reign.world_id",
   "AND p.promotion_id=reign.promotion_id",
   "WHERE reign.world_id=$1 AND reign.person_id=$2",
   "ORDER BY reign.start_week_index DESC,reign.reign_id DESC LIMIT 8"
  ].join(" "),[scope.worldId,scope.personId]);
  const total=matches[0];
  const n=(v:string|null|undefined)=>v==null?0:Number(v);
  const count=n(total?.total_matches),wins=n(total?.total_wins);
  return {personId:scope.personId,
   summary:{matches:count,wins,losses:count-wins,
    singles:n(total?.total_singles),tag:n(total?.total_tags),
    ratedMatches:n(total?.total_rated),
    averageStars:total?.average_stars==null?null:Number(total.average_stars),
    bestStars:total?.best_stars==null?null:Number(total.best_stars),
    injuries:n(total?.total_injuries)},
   recent:matches.map(m=>({
    showId:m.show_id,matchId:m.match_id,showName:m.show_name??"PPW event",
    promotion:m.promotion_name,year:m.year,week:m.week,format:m.format,
    won:m.won,stars:m.rating_stars==null?null:Number(m.rating_stars),
    minutes:m.actual_minutes,finish:m.actual_finish,
    injury:m.injury_severity,weeksOut:m.injury_weeks_out
   })),
   singlesTitles:titles.map(t=>({name:t.name,promotion:t.promotion_name,
    startWeekIndex:t.start_week_index,endedWeekIndex:t.ended_week_index,
    defenses:t.defenses}))};
 });
}
