/** Private, bounded conversation archive. Never holds a World lock or adds
 * simulation power. One authenticated per-thread receipt rather than scans.
 */
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
export async function setBackstageThreadArchive(pool:TransactionPool,input:{
 worldId:string;promotionId:string;playerId:string;personId:string;
 archived:boolean;
}){
 if(![input.worldId,input.promotionId,input.playerId,input.personId]
  .every(x=>typeof x==="string"&&x.trim().length>0&&x.length<=200)||
  typeof input.archived!=="boolean")
  throw new Error("Invalid Backstage archive request");
 return withWorldTransaction(pool,async tx=>{
  const rows=await tx.query<{archived_through_week_index:number}>([
   "INSERT INTO ppw_backstage_thread_archives(",
   "world_id,promotion_id,player_id,person_id,archived_through_week_index)",
   "SELECT r.world_id,r.promotion_id,c.player_id,r.person_id,",
   "CASE WHEN $5::boolean THEN max(r.created_week_index) ELSE -1 END",
   "FROM ppw_backstage_requests r",
   "JOIN ppw_worlds w ON w.world_id=r.world_id",
   "JOIN ppw_promotion_controls c ON c.world_id=r.world_id",
   "AND c.promotion_id=r.promotion_id AND c.player_id=$4 AND c.active",
   "JOIN ppw_memberships m ON m.world_id=c.world_id",
   "AND m.player_id=c.player_id AND m.status='ACTIVE'",
   "JOIN ppw_promotions promo ON promo.world_id=r.world_id",
   "AND promo.promotion_id=r.promotion_id AND promo.lifecycle='ACTIVE'",
   "WHERE r.world_id=$1 AND r.promotion_id=$2 AND r.person_id=$3",
   "AND EXISTS(SELECT 1 FROM ppw_contracts deal",
   "WHERE deal.world_id=r.world_id AND deal.promotion_id=r.promotion_id",
   "AND deal.person_id=r.person_id AND deal.status='SIGNED'",
   "AND deal.start_week_index<=(w.year-1)*52+w.week-1",
   "AND deal.expires_week_index>=(w.year-1)*52+w.week-1)",
   "GROUP BY r.world_id,r.promotion_id,c.player_id,r.person_id",
   "ON CONFLICT(world_id,promotion_id,player_id,person_id) DO UPDATE",
   "SET archived_through_week_index=EXCLUDED.archived_through_week_index",
   "RETURNING archived_through_week_index"
  ].join(" "),[input.worldId,input.promotionId,input.personId,
   input.playerId,input.archived]);
  if(rows.length!==1)throw new Error("Backstage thread unavailable");
  return {personId:input.personId,
   archivedThroughWeekIndex:rows[0]!.archived_through_week_index};
 });
}
