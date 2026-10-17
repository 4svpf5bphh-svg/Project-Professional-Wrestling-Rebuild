/** Mediation is an invitation, not instant chemistry. Verify a later
 * completed, well-executed collaborative tag match in this promotion.
 * Existing match settlement owns ALL underlying professional trust changes.
 */
import type {SqlRows} from "./world-operations.js";
export async function settleBackstageMediations(
 tx:SqlRows,worldId:string,weekIndex:number,
){
 const rows=await tx.query<{request_id:string}>([
  "WITH evidence AS (SELECT DISTINCT ON (r.request_id)",
  "r.request_id,a.week_index FROM ppw_backstage_requests r",
  "JOIN ppw_tag_working_pair_appearances a ON a.world_id=r.world_id",
  "AND a.person_a_id=least(r.person_id,r.related_person_id)",
  "AND a.person_b_id=greatest(r.person_id,r.related_person_id)",
  "AND a.week_index>r.responded_week_index AND a.week_index<=$2",
  "AND a.execution_quality>=68",
  "JOIN ppw_completed_show_matches match ON match.world_id=a.world_id",
  "AND match.show_id=a.show_id AND match.match_id=a.match_id",
  "JOIN ppw_completed_shows sh ON sh.world_id=a.world_id",
  "AND sh.show_id=a.show_id AND sh.promotion_id=r.promotion_id",
  "WHERE r.world_id=$1 AND r.kind='PARTNERSHIP' AND r.status='ANSWERED'",
  "AND r.decision='MEDIATE' AND r.related_person_id IS NOT NULL",
  "AND r.follow_through_week_index IS NULL",
  "AND r.responded_week_index>=$2-26",
  "ORDER BY r.request_id,a.week_index,a.show_id,a.match_id)",
  "UPDATE ppw_backstage_requests r SET follow_through_week_index=e.week_index,",
  "follow_through_kind='MEDIATION_MATCH_COMPLETED'",
  "FROM evidence e WHERE r.world_id=$1 AND r.request_id=e.request_id",
  "AND r.follow_through_week_index IS NULL RETURNING r.request_id"
 ].join(" "),[worldId,weekIndex]);
 if(rows.length>512)throw new Error("Backstage mediations exceed bounded batch");
 return {mediated:rows.length};
}
