/** Owner-only promotion records, requested solely when Industry Records is opened.
 * The same certified match evidence and ordering as the original Staff ranking.
 * No wages, contracts or other private details leave this endpoint.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
export async function readPromotionRecordBook(pool:TransactionPool,input:{
 worldId:string;promotionId:string;playerId:string
}){
 const {worldId,promotionId,playerId}=input;
 if(![worldId,promotionId,playerId].every(v=>typeof v==="string"&&v.length>0&&v.length<=200))
  throw new Error("Invalid promotion record scope");
 return withSqlClient(pool,async tx=>{
  const rows=await tx.query<{owner_rankings:{
   personId:string;name:string;matches:number;wins:number;averageStars:number|null
  }[]}>(`
   SELECT COALESCE((SELECT jsonb_agg(to_jsonb(ranked)) FROM (
      SELECT person.person_id AS "personId",person.name,
       count(bout.match_id)::integer AS "matches",
       count(*) FILTER(WHERE bout.won)::integer AS "wins",
       round(avg(bout.stars)::numeric,2)::double precision AS "averageStars"
      FROM (
       SELECT DISTINCT c.person_id FROM ppw_contracts c
       WHERE c.world_id=w.world_id AND c.promotion_id=$3
        AND c.status='SIGNED' AND c.start_week_index<=(w.year-1)*52+w.week-1
        AND c.expires_week_index>=(w.year-1)*52+w.week-1
      ) roster JOIN ppw_people person ON person.world_id=w.world_id
       AND person.person_id=roster.person_id AND person.status='ACTIVE'
      LEFT JOIN LATERAL (
       SELECT e.match_id,e.won,f.rating_stars::double precision AS stars
       FROM ppw_individual_field_career_effects e
       JOIN ppw_completed_shows done ON done.world_id=e.world_id
        AND done.show_id=e.show_id AND done.promotion_id=$3
       LEFT JOIN ppw_completed_match_report_facts f ON f.world_id=e.world_id
        AND f.show_id=e.show_id AND f.match_id=e.match_id
       WHERE e.world_id=w.world_id AND e.person_id=roster.person_id
       UNION ALL
       SELECT e.match_id,e.won,f.rating_stars::double precision AS stars
       FROM ppw_tag_match_career_effects e
       JOIN ppw_completed_shows done ON done.world_id=e.world_id
        AND done.show_id=e.show_id AND done.promotion_id=$3
       LEFT JOIN ppw_completed_match_report_facts f ON f.world_id=e.world_id
        AND f.show_id=e.show_id AND f.match_id=e.match_id
       WHERE e.world_id=w.world_id AND e.person_id=roster.person_id
      ) bout ON TRUE
      GROUP BY person.person_id,person.name
      HAVING count(bout.match_id)>0
      ORDER BY count(*) FILTER(WHERE bout.won) DESC,
       count(bout.match_id) DESC,person.name,person.person_id
      LIMIT 8
    ) ranked),'[]'::jsonb) AS owner_rankings
   FROM ppw_worlds w
   JOIN ppw_promotion_controls c ON c.world_id=w.world_id
    AND c.player_id=$2 AND c.promotion_id=$3 AND c.active
   JOIN ppw_memberships m ON m.world_id=w.world_id AND m.player_id=$2
    AND m.status='ACTIVE'
   JOIN ppw_promotions p ON p.world_id=w.world_id AND p.promotion_id=$3
    AND p.lifecycle='ACTIVE'
   WHERE w.world_id=$1
  `,[worldId,playerId,promotionId]);
  if(rows.length!==1)throw new Error("Promotion records access denied");
  return {leaders:rows[0]!.owner_rankings.slice(0,8)};
 });
}
