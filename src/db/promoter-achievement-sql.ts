/** Shared indexed certified-promotion facts for Home and Trophy Room.
 * Only pass hard-coded SQL identifiers/placeholders; never user input.
 */
export function promoterAchievementCountersSql(worldExpr:string,promotionExpr:string,
 extraSelect=""):string{
 return ` WITH certified AS MATERIALIZED(
  SELECT show_id,world_id,crowd_response FROM ppw_completed_shows
  WHERE world_id=${worldExpr} AND promotion_id=${promotionExpr}
 ),
 show_stats AS (
  SELECT count(*)::text AS "shows",
   count(*) FILTER (WHERE crowd_response>=80)::text AS "hotShows"
  FROM certified
 ),
 premium AS (
  SELECT count(*)::text AS "premiumShows",
   count(*) FILTER (WHERE e.net_result>0)::text AS "profitablePremiumShows"
  FROM certified c JOIN ppw_booking_drafts d
   ON d.world_id=c.world_id AND d.draft_id=c.show_id
   AND d.booking_class='PREMIUM'
  LEFT JOIN ppw_show_economics e
   ON e.world_id=c.world_id AND e.show_id=c.show_id
 ),
 financial AS (
  SELECT count(*) FILTER(WHERE e.net_result>0)::text AS "profitableShows",
   coalesce(sum(e.attendance),0)::text AS "totalAttendance"
  FROM certified c JOIN ppw_show_economics e
   ON e.world_id=c.world_id AND e.show_id=c.show_id
 ),
 ratings AS (
  SELECT count(*) FILTER(WHERE f.rating_stars>=4)::text AS "greatMatches",
   count(*) FILTER(WHERE f.rating_stars>=4.5)::text AS "excellentMatches",
   count(*) FILTER(WHERE f.rating_stars>=5)::text AS "fiveStarMatches"
  FROM certified c JOIN ppw_completed_match_report_facts f
   ON f.world_id=c.world_id AND f.show_id=c.show_id
 ),
 moments AS (
  SELECT count(*)::text AS "liveSegments",
   count(*) FILTER(WHERE a.crowd_response>=80)::text AS "hotSegments"
  FROM certified c JOIN ppw_completed_show_segments a
   ON a.world_id=c.world_id AND a.show_id=c.show_id
  WHERE a.kind<>'VIDEO_PACKAGE'
   AND a.authored_outcome IN ('HAPPENS','INTERRUPTED')
 ),
 rivalries AS (
  SELECT count(*) FILTER(WHERE activity_count>0)::text AS "rivalriesStarted",
   count(*) FILTER(WHERE ended_week_index IS NOT NULL AND activity_count>0)::text AS "rivalriesConcluded"
  FROM ppw_programmes
  WHERE world_id=${worldExpr} AND promotion_id=${promotionExpr}
 ),
 title_history AS (
  SELECT coalesce(sum(defenses),0)::text AS "titleDefences",
   count(*) FILTER(WHERE ended_week_index IS NOT NULL)::text AS "completedTitleReigns"
  FROM ppw_championship_reigns WHERE world_id=${worldExpr} AND promotion_id=${promotionExpr}
 )
 SELECT show_stats.*,premium.*,financial.*,ratings.*,moments.*,rivalries.*,title_history.*${extraSelect ? `,${extraSelect}` : ''}
 FROM show_stats CROSS JOIN premium CROSS JOIN financial CROSS JOIN ratings
 CROSS JOIN moments CROSS JOIN rivalries CROSS JOIN title_history

 `;
}
