/** Original PPW tag-pairing creative pitches sourced from actual completed
 * two-on-two partnership evidence, not synthetic interpersonal speculation.
 * One batched 12-week read + insert, ahead of ordinary weekly requests.
 */
import type {SqlRows} from "./world-operations.js";
export async function publishBackstageTagPitches(tx:SqlRows,
 worldId:string,weekIndex:number){
 if(!worldId||!Number.isSafeInteger(weekIndex)||weekIndex<0)
  throw new Error("Invalid Backstage pitch week");
 const created=await tx.query<{request_id:string}>([
  "WITH eligible AS (",
  "SELECT sh.promotion_id,a.person_a_id,a.person_b_id,",
  "count(DISTINCT a.show_id)::integer AS shared_shows,",
  "round(avg(a.execution_quality)::numeric,1) AS avg_quality",
  "FROM ppw_tag_working_pair_appearances a",
  "JOIN ppw_completed_shows sh ON sh.world_id=a.world_id AND sh.show_id=a.show_id",
  "JOIN ppw_completed_show_matches played ON played.world_id=a.world_id",
  "AND played.show_id=a.show_id AND played.match_id=a.match_id",
  "JOIN ppw_wrestler_relationships rel ON rel.world_id=a.world_id",
  "AND rel.person_a_id=a.person_a_id AND rel.person_b_id=a.person_b_id",
  "AND rel.professional_trust>=60 AND rel.familiarity>=1",
  "JOIN ppw_contracts first_deal ON first_deal.world_id=a.world_id",
  "AND first_deal.promotion_id=sh.promotion_id AND first_deal.person_id=a.person_a_id",
  "AND first_deal.status='SIGNED' AND first_deal.start_week_index<=$2",
  "AND first_deal.expires_week_index>=$2",
  "AND (first_deal.remaining_dates IS NULL OR first_deal.remaining_dates>0)",
  "JOIN ppw_contracts second_deal ON second_deal.world_id=a.world_id",
  "AND second_deal.promotion_id=sh.promotion_id AND second_deal.person_id=a.person_b_id",
  "AND second_deal.status='SIGNED' AND second_deal.start_week_index<=$2",
  "AND second_deal.expires_week_index>=$2",
  "AND (second_deal.remaining_dates IS NULL OR second_deal.remaining_dates>0)",
  "JOIN ppw_people first_person ON first_person.world_id=a.world_id",
  "AND first_person.person_id=a.person_a_id AND first_person.status='ACTIVE'",
  "JOIN ppw_people second_person ON second_person.world_id=a.world_id",
  "AND second_person.person_id=a.person_b_id AND second_person.status='ACTIVE'",
  "JOIN ppw_promotion_controls owner ON owner.world_id=sh.world_id",
  "AND owner.promotion_id=sh.promotion_id AND owner.active",
  "JOIN ppw_memberships member ON member.world_id=owner.world_id",
  "AND member.player_id=owner.player_id AND member.status='ACTIVE'",
  "WHERE a.world_id=$1 AND a.week_index BETWEEN greatest(0,$2-12) AND $2-1",
  "AND NOT EXISTS(SELECT 1 FROM ppw_tag_teams team",
  "JOIN ppw_tag_team_members am ON am.world_id=team.world_id",
  "AND am.team_id=team.team_id AND am.active AND am.person_id=a.person_a_id",
  "JOIN ppw_tag_team_members bm ON bm.world_id=team.world_id",
  "AND bm.team_id=team.team_id AND bm.active AND bm.person_id=a.person_b_id",
  "WHERE team.world_id=a.world_id AND team.status='ACTIVE')",
  "AND NOT EXISTS(SELECT 1 FROM ppw_backstage_requests earlier",
  "WHERE earlier.world_id=a.world_id AND earlier.promotion_id=sh.promotion_id",
  "AND earlier.person_id=a.person_a_id",
  "AND (earlier.status IN ('PENDING','PROMISED')",
  "OR earlier.created_week_index>=$2-8))",
  "AND NOT EXISTS(SELECT 1 FROM ppw_backstage_requests prior",
  "WHERE prior.world_id=a.world_id AND prior.promotion_id=sh.promotion_id",
  "AND prior.kind='TAG_TEAM_PITCH' AND prior.person_id=a.person_a_id",
  "AND prior.related_person_id=a.person_b_id",
  "AND prior.created_week_index>=greatest(0,$2-52))",
  "AND NOT EXISTS(SELECT 1 FROM ppw_backstage_requests this_week",
  "WHERE this_week.world_id=a.world_id AND this_week.promotion_id=sh.promotion_id",
  "AND this_week.created_week_index=$2)",
  "AND (SELECT count(*) FROM ppw_backstage_requests pending",
  "WHERE pending.world_id=a.world_id AND pending.promotion_id=sh.promotion_id",
  "AND pending.status='PENDING')<3",
  "GROUP BY sh.promotion_id,a.person_a_id,a.person_b_id",
  "HAVING count(DISTINCT a.show_id)>=2 AND avg(a.execution_quality)>=68",
  "AND avg(played.crowd_response)>=70",
  "), ranked AS (SELECT *,row_number() OVER(",
  "PARTITION BY promotion_id ORDER BY avg_quality DESC,",
  "shared_shows DESC,person_a_id,person_b_id) AS rank FROM eligible)",
  "INSERT INTO ppw_backstage_requests(",
  "world_id,request_id,promotion_id,person_id,related_person_id,",
  "kind,created_week_index,team_verified_matches,observed_execution_quality)",
  "SELECT $1,'backstage:team:'||promotion_id||':'||person_a_id||':'||",
  "person_b_id||':year'||($2/52+1)::text,",
  "promotion_id,person_a_id,person_b_id,'TAG_TEAM_PITCH',$2,",
  "shared_shows,avg_quality FROM ranked WHERE rank=1",
  "ON CONFLICT DO NOTHING RETURNING request_id"
 ].join(" "),[worldId,weekIndex]);
 if(created.length>128)throw new Error("Backstage tag proposals exceed World cap");
 return {newPitches:created.length};
}
/** The world observes what the booker actually did next. This is a history
 * fact, NOT an automatic tag team, storyline, stat bonus, or finish change.
 */
export async function settleBackstageTagFollowThrough(tx:SqlRows,
 worldId:string,weekIndex:number){
 const results=await tx.query<{request_id:string}>([
  "WITH evidence AS (",
  "SELECT DISTINCT ON (r.request_id) r.request_id,a.week_index",
  "FROM ppw_backstage_requests r",
  "JOIN ppw_tag_working_pair_appearances a ON a.world_id=r.world_id",
  "AND a.person_a_id=least(r.person_id,r.related_person_id)",
  "AND a.person_b_id=greatest(r.person_id,r.related_person_id)",
  "JOIN ppw_completed_shows sh ON sh.world_id=a.world_id AND sh.show_id=a.show_id",
  "AND sh.promotion_id=r.promotion_id",
  "WHERE r.world_id=$1 AND r.kind='TAG_TEAM_PITCH'",
  "AND r.decision='EXPLORE_TEAM' AND r.status='ANSWERED'",
  "AND r.follow_through_week_index IS NULL",
  "AND r.responded_week_index>=$2-26",
  "AND a.week_index>r.responded_week_index AND a.week_index<=$2",
  "ORDER BY r.request_id,a.week_index,a.show_id,a.match_id",
  ") UPDATE ppw_backstage_requests r SET",
  "follow_through_week_index=e.week_index,follow_through_kind='TAG_MATCH_BOOKED'",
  "FROM evidence e WHERE r.world_id=$1 AND r.request_id=e.request_id",
  "AND r.follow_through_week_index IS NULL",
  "RETURNING r.request_id"
 ].join(" "),[worldId,weekIndex]);
 if(results.length>512)throw new Error("Backstage follow-through exceeds bounded limit");
 return {followedThrough:results.length};
}
