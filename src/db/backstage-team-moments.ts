/** Original PPW's passive team moment. Source is verified completed
 * tag work and existing locker-room relationships, not automatic booking.
 * One batched 12-week read and insert; no additional client polling.
 */
import type {SqlRows} from "./world-operations.js";
export async function publishBackstageTeamMoments(
 tx:SqlRows,worldId:string,weekIndex:number,
){
 if(!worldId||!Number.isSafeInteger(weekIndex)||weekIndex<0)
  throw new Error("Invalid Backstage good-news week");
 const rows=await tx.query<{request_id:string}>([
  "WITH moments AS (",
  "SELECT sh.promotion_id,t.team_id,a.person_a_id,a.person_b_id,",
  "count(DISTINCT a.show_id)::integer AS match_shows,",
  "round(avg(m.crowd_response)::numeric,1) AS crowd_average",
  "FROM ppw_tag_working_pair_appearances a",
  "JOIN ppw_completed_show_matches m ON m.world_id=a.world_id",
  "AND m.show_id=a.show_id AND m.match_id=a.match_id",
  "JOIN ppw_completed_shows sh ON sh.world_id=m.world_id",
  "AND sh.show_id=m.show_id",
  "JOIN ppw_tag_team_members member_a ON member_a.world_id=a.world_id",
  "AND member_a.person_id=a.person_a_id AND member_a.active",
  "JOIN ppw_tag_team_members member_b ON member_b.world_id=member_a.world_id",
  "AND member_b.team_id=member_a.team_id",
  "AND member_b.person_id=a.person_b_id AND member_b.active",
  "JOIN ppw_tag_teams t ON t.world_id=member_a.world_id",
  "AND t.team_id=member_a.team_id AND t.status='ACTIVE'",
  "JOIN ppw_wrestler_relationships rel ON rel.world_id=a.world_id",
  "AND rel.person_a_id=a.person_a_id AND rel.person_b_id=a.person_b_id",
  "AND rel.professional_trust>=60 AND rel.familiarity>=1",
  "JOIN ppw_promotions promo ON promo.world_id=sh.world_id",
  "AND promo.promotion_id=sh.promotion_id AND promo.lifecycle='ACTIVE'",
  "JOIN ppw_promotion_controls owner ON owner.world_id=sh.world_id",
  "AND owner.promotion_id=sh.promotion_id AND owner.active",
  "JOIN ppw_memberships member ON member.world_id=owner.world_id",
  "AND member.player_id=owner.player_id AND member.status='ACTIVE'",
  "WHERE a.world_id=$1 AND a.week_index BETWEEN greatest(0,$2-12) AND $2-1",
  "AND EXISTS(SELECT 1 FROM ppw_contracts c",
  "JOIN ppw_people p ON p.world_id=c.world_id AND p.person_id=c.person_id",
  "WHERE c.world_id=a.world_id AND c.promotion_id=sh.promotion_id",
  "AND c.person_id=a.person_a_id AND c.status='SIGNED'",
  "AND c.start_week_index<=$2 AND c.expires_week_index>=$2",
  "AND p.status='ACTIVE')",
  "AND EXISTS(SELECT 1 FROM ppw_contracts c",
  "JOIN ppw_people p ON p.world_id=c.world_id AND p.person_id=c.person_id",
  "WHERE c.world_id=a.world_id AND c.promotion_id=sh.promotion_id",
  "AND c.person_id=a.person_b_id AND c.status='SIGNED'",
  "AND c.start_week_index<=$2 AND c.expires_week_index>=$2",
  "AND p.status='ACTIVE')",
  "AND NOT EXISTS(SELECT 1 FROM ppw_backstage_requests already",
  "WHERE already.world_id=$1 AND already.promotion_id=sh.promotion_id",
  "AND already.created_week_index=$2)",
  "AND NOT EXISTS(SELECT 1 FROM ppw_backstage_requests prior",
  "WHERE prior.world_id=$1 AND prior.request_id=",
  "'backstage:moment:'||sh.promotion_id||':'||t.team_id||",
  "':year'||($2/52+1)::text)",
  "GROUP BY sh.promotion_id,t.team_id,a.person_a_id,a.person_b_id",
  "HAVING count(DISTINCT a.show_id)>=2 AND avg(m.crowd_response)>=70",
  "AND avg(a.execution_quality)>=60",
  "), ranked AS (SELECT *,row_number() OVER(PARTITION BY promotion_id",
  "ORDER BY crowd_average DESC,match_shows DESC,team_id,person_a_id)",
  "AS rank FROM moments)",
  "INSERT INTO ppw_backstage_requests(world_id,request_id,promotion_id,",
  "person_id,related_person_id,kind,status,created_week_index,",
  "team_verified_matches,observed_average_crowd)",
  "SELECT $1,'backstage:moment:'||promotion_id||':'||team_id||",
  "':year'||($2/52+1)::text,promotion_id,person_a_id,person_b_id,",
  "'TEAM_MOMENT','NOTED',$2,match_shows,crowd_average",
  "FROM ranked WHERE rank=1 ON CONFLICT DO NOTHING RETURNING request_id"
 ].join(" "),[worldId,weekIndex]);
 if(rows.length>128)throw new Error("Backstage passive news exceeds World capacity");
 return {newNotes:rows.length};
}
