/** A real circuit rivalry every eight certified World weeks (and year-end).
 * One bounded indexed 13-week World result read, one batch upsert. Zero
 * extra page reads and no AI/cron. The current World transaction owns it.
 */
import type {SqlRows} from "./world-operations.js";
import {selectPromotionCompetition,type CompetitionCandidate}
 from "../domain/promotion-competition.js";
type Row={
 promotion_id:string;tier:string;media_reach:number|string|null;
 home_market_id:string|null;human_managed:boolean;
 completed_shows:number;average_crowd:string|null;average_tv_rating:string|null;
 previous_rival_id:string|null;previous_since_week_index:number|null;
};
export async function reviewWorldPromotionCompetition(
 tx:SqlRows,worldId:string,year:number,week:number
):Promise<{evaluated:number;changed:number}>{
 if(!worldId||worldId.length>200||!Number.isSafeInteger(year)||year<1||
  !Number.isSafeInteger(week)||week<1||week>52)
  throw new Error("Invalid World competition assessment");
 const idx=(year-1)*52+week-1;
 if(idx%8!==0&&week!==52)return {evaluated:0,changed:0};
 const low=Math.max(0,idx-12),lowYear=Math.floor(low/52)+1,
  lowWeek=low%52+1;
 const rows=await tx.query<Row>(`
  WITH recent AS (
   SELECT c.promotion_id,count(*)::integer AS completed_shows,
    avg(c.crowd_response)::numeric(5,1)::text AS average_crowd,
    avg(e.tv_household_rating) FILTER(
     WHERE d.booking_class='REGULAR' AND e.audience_format='TV'
    )::numeric(5,2)::text AS average_tv_rating
   FROM ppw_completed_shows c
   JOIN ppw_booking_drafts d ON d.world_id=c.world_id
    AND d.draft_id=c.show_id AND d.status='SUBMITTED'
   LEFT JOIN ppw_show_economics e ON e.world_id=c.world_id
    AND e.show_id=c.show_id AND e.promotion_id=c.promotion_id
   WHERE c.world_id=$1 AND (c.year,c.week)>=($2,$3)
    AND (c.year,c.week)<=($4,$5)
   GROUP BY c.promotion_id
  )
  SELECT p.promotion_id,p.tier,p.media_reach,p.home_market_id,
   EXISTS(SELECT 1 FROM ppw_promotion_controls control
    WHERE control.world_id=p.world_id AND
     control.promotion_id=p.promotion_id AND control.active) AS human_managed,
   coalesce(recent.completed_shows,0) AS completed_shows,
   recent.average_crowd,recent.average_tv_rating,
   prior.rival_promotion_id AS previous_rival_id,
   prior.rival_since_week_index AS previous_since_week_index
  FROM ppw_promotions p LEFT JOIN recent ON
   recent.promotion_id=p.promotion_id
  LEFT JOIN ppw_promotion_competition prior ON prior.world_id=p.world_id
   AND prior.promotion_id=p.promotion_id
  WHERE p.world_id=$1 AND p.lifecycle='ACTIVE'
  ORDER BY p.promotion_id LIMIT 129
 `,[worldId,lowYear,lowWeek,year,week]);
 if(rows.length>128)throw new Error("World competition exceeds safe population");
 const companies:CompetitionCandidate[]=rows.map(r=>({
  promotionId:r.promotion_id,tier:r.tier,
  mediaReach:r.media_reach===null?null:Number(r.media_reach),
  homeMarketId:r.home_market_id,humanManaged:r.human_managed,
  completedShows:r.completed_shows,
  averageCrowd:r.average_crowd===null?null:Number(r.average_crowd),
  averageTvRating:r.average_tv_rating===null?null:Number(r.average_tv_rating),
  previousRivalId:r.previous_rival_id,
  previousSinceWeekIndex:r.previous_since_week_index
 }));
 const selections=selectPromotionCompetition(companies,idx);
 if(selections.length)await tx.query(`
  INSERT INTO ppw_promotion_competition(
   world_id,promotion_id,rival_promotion_id,target_promotion_id,
   rival_since_week_index,reviewed_week_index,
   own_show_count,rival_show_count,own_avg_crowd,rival_avg_crowd,
   own_reach,rival_reach,own_tv_rating,rival_tv_rating)
  SELECT $1,x.promotion_id,x.rival_id,x.target_id,
   x.since_week,$2,x.own_shows,x.rival_shows,x.own_crowd,x.rival_crowd,
   x.own_reach,x.rival_reach,x.own_tv,x.rival_tv
  FROM jsonb_to_recordset($3::jsonb) AS x(
   promotion_id text,rival_id text,target_id text,since_week integer,
   own_shows integer,rival_shows integer,own_crowd numeric,rival_crowd numeric,
   own_reach numeric,rival_reach numeric,own_tv numeric,rival_tv numeric)
  ON CONFLICT(world_id,promotion_id) DO UPDATE SET
   rival_promotion_id=excluded.rival_promotion_id,
   target_promotion_id=excluded.target_promotion_id,
   rival_since_week_index=excluded.rival_since_week_index,
   reviewed_week_index=excluded.reviewed_week_index,
   own_show_count=excluded.own_show_count,
   rival_show_count=excluded.rival_show_count,
   own_avg_crowd=excluded.own_avg_crowd,
   rival_avg_crowd=excluded.rival_avg_crowd,
   own_reach=excluded.own_reach,rival_reach=excluded.rival_reach,
   own_tv_rating=excluded.own_tv_rating,
   rival_tv_rating=excluded.rival_tv_rating
 `,[worldId,idx,JSON.stringify(selections.map(s=>({
  promotion_id:s.promotionId,rival_id:s.rivalId,target_id:s.nextTargetId,
  since_week:s.sinceWeekIndex,own_shows:s.ownShows,rival_shows:s.rivalShows,
  own_crowd:s.ownCrowd,rival_crowd:s.rivalCrowd,
  own_reach:s.ownReach,rival_reach:s.rivalReach,
  own_tv:s.ownTvRating,rival_tv:s.rivalTvRating
 })))]);
 return {evaluated:selections.length,changed:selections.filter(s=>s.changed).length};
}
