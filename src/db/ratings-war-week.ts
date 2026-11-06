/** Apply the on-air Ratings War once in the existing certified weekly
 * rollover, before broadcasters award performance bonuses. Bounded World
 * reads and one batch update; never changes matches, gate money or PPVs.
 */
import type {SqlRows} from "./world-operations.js";
import {projectRatingsWarWeek,type RatingsWarEpisode}
 from "../domain/ratings-war-settlement.js";
interface EpisodeRow{
 show_id:string;promotion_id:string;show_day:number|null;airing_hour:number|string;
 crowd_response:number|string;
 tv_household_rating:string;estimated_viewers:string;
 ratings_war_base_rating:string|null;ratings_war_base_viewers:string|null;
}
export async function settleRatingsWarWorldWeek(tx:SqlRows,
 worldId:string,year:number,week:number){
 if(typeof worldId!=="string"||!worldId||worldId.length>200||
  !Number.isSafeInteger(year)||year<1||!Number.isSafeInteger(week)||
  week<1||week>52)throw new Error("Invalid Ratings War World week");
 const index=(year-1)*52+week-1;
 const rows=await tx.query<EpisodeRow>(`
  SELECT econ.show_id,econ.promotion_id,draft.show_day,
   done.crowd_response,
   econ.tv_household_rating::text,econ.estimated_viewers::text,
   econ.ratings_war_base_rating::text,
   econ.ratings_war_base_viewers::text,
   coalesce((SELECT d.airing_hour FROM ppw_commercial_deals d
    WHERE d.world_id=econ.world_id AND d.promotion_id=econ.promotion_id
     AND d.kind='BROADCAST'
     AND d.start_week_index<=$4 AND d.end_week_index>=$4
     AND (d.airing_day IS NULL OR d.airing_day=draft.show_day)
     AND d.airing_hour IS NOT NULL
    ORDER BY d.start_week_index DESC,d.deal_id DESC LIMIT 1),20)::integer AS airing_hour
  FROM ppw_show_economics econ
  JOIN ppw_completed_shows done ON done.world_id=econ.world_id
   AND done.show_id=econ.show_id AND done.promotion_id=econ.promotion_id
   AND done.year=econ.year AND done.week=econ.week
  JOIN ppw_booking_drafts draft ON draft.world_id=econ.world_id
   AND draft.draft_id=econ.show_id AND draft.promotion_id=econ.promotion_id
   AND draft.year=econ.year AND draft.week=econ.week
   AND draft.status='SUBMITTED' AND draft.booking_class='REGULAR'
  WHERE econ.world_id=$1 AND econ.year=$2 AND econ.week=$3
   AND econ.audience_format='TV' AND econ.tv_household_rating IS NOT NULL
   AND econ.estimated_viewers IS NOT NULL
  ORDER BY econ.promotion_id,econ.show_id LIMIT 129`,
 [worldId,year,week,index]);
 if(rows.length>128)throw new Error("Ratings War World week exceeds population");
 const episodes:RatingsWarEpisode[]=rows.map(r=>{
  if(r.show_day===null)throw new Error("Certified TV episode lacks show day");
  if((r.ratings_war_base_rating===null)!==(r.ratings_war_base_viewers===null))
   throw new Error("Incomplete original Ratings War evidence");
  return {showId:r.show_id,promotionId:r.promotion_id,day:r.show_day,
   hour:Number(r.airing_hour),crowdResponse:Number(r.crowd_response),
   householdRating:Number(r.ratings_war_base_rating??r.tv_household_rating),
   estimatedViewers:Number(r.ratings_war_base_viewers??r.estimated_viewers)};
 });
 if(!episodes.length)return {broadcasts:0,contested:0,changed:0};
 const results=projectRatingsWarWeek(episodes);
 // Save original episode baselines. Reruns never transfer the already
 // adjusted audiences a second time, even after a contract has expired.
 const updated=await tx.query<{show_id:string}>(`
  WITH projected AS (
   SELECT * FROM jsonb_to_recordset($4::jsonb) AS x(
    show_id text,promotion_id text,household_rating numeric,
    viewers bigint,base_rating numeric,base_viewers bigint,opponents smallint)
  )
  UPDATE ppw_show_economics e
   SET tv_household_rating=x.household_rating,
    estimated_viewers=x.viewers,
    ratings_war_base_rating=x.base_rating,
    ratings_war_base_viewers=x.base_viewers,
    ratings_war_opponents=x.opponents
   FROM projected x
   WHERE e.world_id=$1 AND e.year=$2 AND e.week=$3
    AND e.show_id=x.show_id AND e.promotion_id=x.promotion_id
    AND e.audience_format='TV'
   RETURNING e.show_id
 `,[worldId,year,week,JSON.stringify(results.map(x=>({
  show_id:x.showId,promotion_id:x.promotionId,household_rating:x.householdRating,
  viewers:x.estimatedViewers,base_rating:x.baseRating,
  base_viewers:x.baseViewers,opponents:x.opponents
 })))]);
 if(updated.length!==results.length)
  throw new Error("Ratings War could not record every certified TV audience");
 return {broadcasts:results.length,contested:results.filter(x=>x.opponents>0).length,
  changed:results.filter(x=>x.change!==0).length};
}
