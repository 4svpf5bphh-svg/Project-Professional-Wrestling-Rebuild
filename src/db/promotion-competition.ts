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
 completed_shows:number;average_crowd:string|null;
 average_attendance:string|null;average_tv_rating:string|null;
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
    avg(e.attendance)::numeric(12,1)::text AS average_attendance,
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
   recent.average_crowd,recent.average_attendance,recent.average_tv_rating,
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
  averageAttendance:r.average_attendance===null?null:Number(r.average_attendance),
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
   own_avg_attendance,rival_avg_attendance,
   own_reach,rival_reach,own_tv_rating,rival_tv_rating)
  SELECT $1,x.promotion_id,x.rival_id,x.target_id,
   x.since_week,$2,x.own_shows,x.rival_shows,x.own_crowd,x.rival_crowd,
   x.own_attendance,x.rival_attendance,
   x.own_reach,x.rival_reach,x.own_tv,x.rival_tv
  FROM jsonb_to_recordset($3::jsonb) AS x(
   promotion_id text,rival_id text,target_id text,since_week integer,
   own_shows integer,rival_shows integer,own_crowd numeric,rival_crowd numeric,
   own_attendance numeric,rival_attendance numeric,
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
   own_avg_attendance=excluded.own_avg_attendance,
   rival_avg_attendance=excluded.rival_avg_attendance,
   own_reach=excluded.own_reach,rival_reach=excluded.rival_reach,
   own_tv_rating=excluded.own_tv_rating,
   rival_tv_rating=excluded.rival_tv_rating
 `,[worldId,idx,JSON.stringify(selections.map(s=>({
  promotion_id:s.promotionId,rival_id:s.rivalId,target_id:s.nextTargetId,
  since_week:s.sinceWeekIndex,own_shows:s.ownShows,rival_shows:s.rivalShows,
  own_crowd:s.ownCrowd,rival_crowd:s.rivalCrowd,
  own_attendance:s.ownAttendance,rival_attendance:s.rivalAttendance,
  own_reach:s.ownReach,rival_reach:s.rivalReach,
  own_tv:s.ownTvRating,rival_tv:s.rivalTvRating
 })))]);
 return {evaluated:selections.length,changed:selections.filter(s=>s.changed).length};
}

/** Cached bounded public rivalry projected in existing one-query owner
 * Home and Business workspaces. Never sends private opponent information.
 */
export interface CompetitionShowPulse{
 year:number;week:number;showName:string;crowdResponse:number;
 tvRating:number|null;
}
export interface PromotionCompetitionCard {
 /** Ephemeral starting rival while World Lock has not reviewed the circuit. */
 provisional?:boolean;
 ownLatestShow?:CompetitionShowPulse|null;
 rivalLatestShow?:CompetitionShowPulse|null;
 promotionId:string;name:string;tier:string;humanManaged:boolean;
 sinceWeekIndex:number;reviewedWeekIndex:number;
 ownShowCount:number;rivalShowCount:number;
 ownAvgCrowd:number|null;rivalAvgCrowd:number|null;
 ownAvgAttendance:number|null;rivalAvgAttendance:number|null;
 ownReach:number|null;rivalReach:number|null;
 ownTvRating:number|null;rivalTvRating:number|null;
 targetName:string|null;targetTier:string|null;
}

/** The existing one-query Home/Business snapshot can use a public, bounded
 * provisional peer before the first eight-week World rivalry review. This is
 * strictly a read projection: official World selection remains the authority
 * and no rival or financial state is persisted on page visit.
 */
export function promotionCompetitionProjectionSql(world:string,owner:string):string{
 const latest=(promotion:string)=>`(
  SELECT jsonb_build_object(
   'year',s.year,'week',s.week,'showName',draft.show_name,
   'crowdResponse',s.crowd_response,
   'tvRating',CASE WHEN econ.audience_format='TV' THEN
    econ.tv_household_rating ELSE NULL END)
  FROM ppw_completed_shows s
  JOIN ppw_booking_drafts draft ON draft.world_id=s.world_id
   AND draft.draft_id=s.show_id AND draft.status='SUBMITTED'
  LEFT JOIN ppw_show_economics econ ON econ.world_id=s.world_id
   AND econ.show_id=s.show_id AND econ.promotion_id=s.promotion_id
  JOIN ppw_worlds clock ON clock.world_id=s.world_id
  WHERE s.world_id=${world} AND s.promotion_id=${promotion}
   AND (s.year-1)*52+s.week-1 BETWEEN
    greatest(0,(clock.year-1)*52+clock.week-7)
    AND (clock.year-1)*52+clock.week-1
  ORDER BY s.year DESC,s.week DESC,s.show_id DESC LIMIT 1
 )`;
 const cached=`(
  SELECT jsonb_build_object(
   'promotionId',r.promotion_id,'name',r.name,'tier',r.tier,
   'provisional',false,
   'humanManaged',EXISTS(SELECT 1 FROM ppw_promotion_controls human
    WHERE human.world_id=r.world_id AND human.promotion_id=r.promotion_id
    AND human.active),
   'sinceWeekIndex',c.rival_since_week_index,
   'reviewedWeekIndex',c.reviewed_week_index,
   'ownShowCount',c.own_show_count,'rivalShowCount',c.rival_show_count,
   'ownAvgCrowd',c.own_avg_crowd,'rivalAvgCrowd',c.rival_avg_crowd,
   'ownAvgAttendance',c.own_avg_attendance,
   'rivalAvgAttendance',c.rival_avg_attendance,
   'ownReach',c.own_reach,'rivalReach',c.rival_reach,
   'ownTvRating',c.own_tv_rating,'rivalTvRating',c.rival_tv_rating,
   'targetName',target.name,'targetTier',target.tier)
  FROM ppw_promotion_competition c
  JOIN ppw_promotions r ON r.world_id=c.world_id
   AND r.promotion_id=c.rival_promotion_id AND r.lifecycle='ACTIVE'
  LEFT JOIN ppw_promotions target ON target.world_id=c.world_id
   AND target.promotion_id=c.target_promotion_id AND target.lifecycle='ACTIVE'
  WHERE c.world_id=${world} AND c.promotion_id=${owner}
  LIMIT 1
 )`;
 const tierRank=(value:string)=>`(CASE ${value}
  WHEN 'LOCAL' THEN 0 WHEN 'REGIONAL' THEN 1
  WHEN 'INDEPENDENT' THEN 1 WHEN 'RISING' THEN 2
  WHEN 'NATIONAL' THEN 3 WHEN 'GLOBAL' THEN 4 ELSE 0 END)`;
 const provisional=`(
  WITH own AS (
   SELECT p.world_id,p.promotion_id,p.tier,p.media_reach,p.home_market_id
   FROM ppw_promotions p WHERE p.world_id=${world}
    AND p.promotion_id=${owner} AND p.lifecycle='ACTIVE' LIMIT 1
  ), candidate AS (
   SELECT r.world_id,r.promotion_id,r.name,r.tier,r.media_reach,
    EXISTS(SELECT 1 FROM ppw_promotion_controls human
     WHERE human.world_id=r.world_id AND human.promotion_id=r.promotion_id
      AND human.active) AS human_managed
   FROM ppw_promotions r JOIN own ON own.world_id=r.world_id
   WHERE r.lifecycle='ACTIVE' AND r.promotion_id<>own.promotion_id
   ORDER BY (
    abs(${tierRank("r.tier")}-${tierRank("own.tier")})*33+
    least(26,abs(coalesce(r.media_reach,0)-coalesce(own.media_reach,0))/3.0)
    - CASE WHEN own.home_market_id IS NOT NULL AND
      r.home_market_id=own.home_market_id THEN 19 ELSE 0 END
    - CASE WHEN EXISTS(SELECT 1 FROM ppw_promotion_controls human
      WHERE human.world_id=r.world_id AND human.promotion_id=r.promotion_id
       AND human.active)
      THEN CASE WHEN r.tier=own.tier THEN 25 ELSE 10 END ELSE 0 END
   ),r.promotion_id LIMIT 1
  ), recent AS (
   SELECT s.promotion_id,count(*)::integer AS completed_shows,
    round(avg(s.crowd_response)::numeric,1) AS avg_crowd,
    round(avg(econ.attendance)::numeric,1) AS avg_attendance,
    round(avg(econ.tv_household_rating)
     FILTER (WHERE draft.booking_class='REGULAR'
      AND econ.audience_format='TV')::numeric,2) AS avg_tv
   FROM ppw_completed_shows s
   JOIN ppw_booking_drafts draft ON draft.world_id=s.world_id
    AND draft.draft_id=s.show_id AND draft.status='SUBMITTED'
   LEFT JOIN ppw_show_economics econ ON econ.world_id=s.world_id
    AND econ.show_id=s.show_id AND econ.promotion_id=s.promotion_id
   JOIN ppw_worlds clock ON clock.world_id=s.world_id
   WHERE s.world_id=${world}
    AND s.promotion_id IN (SELECT promotion_id FROM own
      UNION ALL SELECT promotion_id FROM candidate)
    AND (s.year-1)*52+s.week-1 BETWEEN
     greatest(0,(clock.year-1)*52+clock.week-13)
     AND (clock.year-1)*52+clock.week-1
   GROUP BY s.promotion_id
  )
  SELECT jsonb_build_object(
   'promotionId',candidate.promotion_id,
   'name',candidate.name,'tier',candidate.tier,
   'humanManaged',candidate.human_managed,
   'provisional',true,
   'sinceWeekIndex',(clock.year-1)*52+clock.week-1,
   'reviewedWeekIndex',(clock.year-1)*52+clock.week-1,
   'ownShowCount',coalesce(ownFacts.completed_shows,0),
   'rivalShowCount',coalesce(rivalFacts.completed_shows,0),
   'ownAvgCrowd',ownFacts.avg_crowd,'rivalAvgCrowd',rivalFacts.avg_crowd,
   'ownAvgAttendance',ownFacts.avg_attendance,
   'rivalAvgAttendance',rivalFacts.avg_attendance,
   'ownReach',own.media_reach,'rivalReach',candidate.media_reach,
   'ownTvRating',ownFacts.avg_tv,'rivalTvRating',rivalFacts.avg_tv,
   'targetName',NULL,'targetTier',NULL)
  FROM own JOIN candidate ON true
  JOIN ppw_worlds clock ON clock.world_id=own.world_id
  LEFT JOIN recent ownFacts ON ownFacts.promotion_id=own.promotion_id
  LEFT JOIN recent rivalFacts ON rivalFacts.promotion_id=candidate.promotion_id
  -- Do not emit a large speculative rivalry object for a fresh World with
  -- no certified show from either company. The existing Home empty state
  -- explains when the first evidence-driven rival can appear.
  WHERE coalesce(ownFacts.completed_shows,0)+
   coalesce(rivalFacts.completed_shows,0)>0
 )`;
 return `(
  SELECT base.card||jsonb_build_object(
   'ownLatestShow',${latest(owner)},
   'rivalLatestShow',${latest("(base.card->>'promotionId')")})
  FROM (SELECT coalesce(${cached},${provisional}) AS card) base
  WHERE base.card IS NOT NULL
 )`;
}
