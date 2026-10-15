import type { TransactionPool } from "./transaction.js";
import { withSqlClient } from "./postgres.js";

export interface AvailablePromotion {
  id:string;
  name:string;
  tier:string;
  lifecycle:string;
}

/** Bounded cursor-free initial selection list. Offset pagination is avoided
 * because ownership can change between requests; keyset ordering is stable.
 * A listing is advisory; claimPromotion remains the authoritative lock.
 */
export async function listAvailablePromotions(
  pool:TransactionPool, worldId:string, afterId:string|null=null, limit=25,
):Promise<AvailablePromotion[]> {
  if (!Number.isSafeInteger(limit) || limit<1 || limit>50) throw new Error("Invalid page size");
  return withSqlClient(pool,async tx=>{
    const rows=await tx.query<{promotion_id:string;name:string;tier:string;lifecycle:string}>(
      "SELECT p.promotion_id,p.name,p.tier,p.lifecycle FROM ppw_promotions p WHERE p.world_id=$1 AND p.lifecycle='ACTIVE' AND p.promotion_id>$2 AND NOT EXISTS (SELECT 1 FROM ppw_promotion_controls c WHERE c.world_id=p.world_id AND c.promotion_id=p.promotion_id AND c.active=true) ORDER BY p.promotion_id LIMIT $3",
      [worldId,afterId??"",limit],
    );
    return rows.map(r=>({id:r.promotion_id,name:r.name,tier:r.tier,lifecycle:r.lifecycle}));
  });
}
