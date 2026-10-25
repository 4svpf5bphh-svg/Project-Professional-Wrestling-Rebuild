
/** Canonical championship and event prestige, once per certified World week.
 * Sources: completed shows, true recorded title contests and immutable match
 * report facts. Nothing is inferred from booked-but-unplayed cards, future
 * brand importance, audience popularity or Groq commentary.
 */
import type {SqlRows} from "./world-operations.js";
export async function settleWorldHeritage(tx:SqlRows,worldId:string,
 year:number,week:number):Promise<{applied:boolean}>{
 if(!worldId||worldId.length>200||!Number.isSafeInteger(year)||year<1||
  !Number.isSafeInteger(week)||week<1||week>52)
  throw new Error("Invalid certified heritage week");
 const index=(year-1)*52+week-1;
 const inserted=await tx.query<{world_id:string}>(`
  INSERT INTO ppw_heritage_week_settlements(world_id,year,week)
  VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING world_id
 `,[worldId,year,week]);
 if(!inserted.length)return {applied:false};
 // Title credit is capped per certified week, not one credit for every
 // contestant. The winning side and finish come from canonical settlement.
 // Protected finishes still count as bouts, never false transfers.
 await tx.query(`
  WITH certified AS (
   SELECT x.promotion_id,x.championship_id,
    SUM(0.45+
      CASE WHEN facts.rating_stars>=3.5 THEN 0.65 ELSE 0 END+
      CASE WHEN x.title_changed THEN 0.4 ELSE 0 END+
      CASE WHEN bout.position=(SELECT max(other.position)
        FROM ppw_completed_show_matches other
        WHERE other.world_id=bout.world_id AND other.show_id=bout.show_id)
        THEN 0.25 ELSE 0 END)::numeric AS merit
   FROM ppw_completed_shows done
   JOIN ppw_championship_contests x ON x.world_id=done.world_id
    AND x.show_id=done.show_id AND x.promotion_id=done.promotion_id
   JOIN ppw_completed_show_matches bout ON bout.world_id=x.world_id
    AND bout.show_id=x.show_id AND bout.match_id=x.slot_id
   LEFT JOIN ppw_completed_match_report_facts facts ON facts.world_id=x.world_id
    AND facts.show_id=x.show_id AND facts.match_id=x.slot_id
   WHERE done.world_id=$1 AND done.year=$2 AND done.week=$3
   GROUP BY x.promotion_id,x.championship_id
  ), merits AS (
   SELECT c.world_id,c.promotion_id,c.championship_id,
    CASE WHEN activity.merit IS NOT NULL THEN
      least(2.2,activity.merit)::double precision
     WHEN c.last_contest_week_index IS NOT NULL
      AND $4-c.last_contest_week_index>8 THEN -0.18::double precision
     ELSE 0::double precision END AS delta,
    (activity.merit IS NOT NULL) AS competed
   FROM ppw_championships c
   LEFT JOIN certified activity ON activity.promotion_id=c.promotion_id
    AND activity.championship_id=c.championship_id
   WHERE c.world_id=$1 AND c.status='ACTIVE'
  )
  UPDATE ppw_championships c SET
   prestige=round(greatest(0::numeric,least(100::numeric,
    (c.prestige+m.delta)::numeric)),2)::double precision,
   last_prestige_change=m.delta,
   last_contest_week_index=CASE WHEN m.competed THEN $4
    ELSE c.last_contest_week_index END
  FROM merits m WHERE c.world_id=m.world_id AND c.promotion_id=m.promotion_id
   AND c.championship_id=m.championship_id
 `,[worldId,year,week,index]);
 // Event heritage counts an edition ONLY when the linked show was truly
 // completed. A skipped scheduled edition cools the brand slightly.
 await tx.query(`
  WITH editions AS (
   SELECT d.promotion_id,d.show_series_id,
    count(DISTINCT done.show_id)::integer AS appearances,
    max(done.crowd_response)::double precision AS crowd,
    max(facts.rating_stars)::double precision AS best_bout
   FROM ppw_completed_shows done
   JOIN ppw_booking_drafts d ON d.world_id=done.world_id
    AND d.draft_id=done.show_id AND d.promotion_id=done.promotion_id
   LEFT JOIN ppw_completed_show_matches bout ON bout.world_id=done.world_id
    AND bout.show_id=done.show_id
   LEFT JOIN ppw_completed_match_report_facts facts ON facts.world_id=bout.world_id
    AND facts.show_id=bout.show_id AND facts.match_id=bout.match_id
   WHERE done.world_id=$1 AND done.year=$2 AND done.week=$3
    AND d.show_series_id IS NOT NULL
   GROUP BY d.promotion_id,d.show_series_id
  ), movements AS (
   SELECT s.world_id,s.promotion_id,s.series_id,
    coalesce(e.appearances,0) AS appearances,
    CASE WHEN e.appearances>0 THEN
     CASE WHEN e.crowd>=85 AND e.best_bout>=4 THEN 2.4
          WHEN e.crowd>=70 THEN 1.3 ELSE 0.45 END
     WHEN $4>=s.anchor_week AND ($4-s.anchor_week)%s.cadence_weeks=0
      THEN CASE WHEN s.event_type='MAJOR' THEN -0.75 ELSE -0.2 END
     ELSE 0 END::double precision AS delta
   FROM ppw_show_series s LEFT JOIN editions e
    ON e.promotion_id=s.promotion_id AND e.show_series_id=s.series_id
   WHERE s.world_id=$1 AND s.active
  )
  UPDATE ppw_show_series s SET
   earned_prestige=round(greatest(0::numeric,
    least(100::numeric,(s.earned_prestige+m.delta)::numeric)),2)::double precision,
   celebrated_editions=s.celebrated_editions+m.appearances,
   last_celebrated_week_index=CASE WHEN m.appearances>0 THEN $4
    ELSE s.last_celebrated_week_index END,
   last_prestige_change=m.delta
  FROM movements m WHERE s.world_id=m.world_id AND
   s.promotion_id=m.promotion_id AND s.series_id=m.series_id
 `,[worldId,year,week,index]);
 return {applied:true};
}
