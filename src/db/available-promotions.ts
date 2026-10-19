import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";

export interface AvailablePromotion {
 id:string;name:string;tier:string;lifecycle:string;
 homeMarketName:string|null;rosterSize:number;
}

/** Choosing a company is a one-shot, bounded read. The public home market and
 * wrestler count come from the selected companies only; no rival salaries,
 * contract terms, private cards, or full rosters are transferred.
 * Claiming still rechecks eligibility and ownership in a World transaction.
 */
export async function listAvailablePromotions(
 pool:TransactionPool,worldId:string,afterId:string|null=null,limit=25,
):Promise<AvailablePromotion[]>{
 if(!worldId||worldId.length>200||!Number.isSafeInteger(limit)||limit<1||limit>50)
  throw new Error("Invalid promotion selection");
 return withSqlClient(pool,async tx=>{
  const rows=await tx.query<{promotion_id:string;name:string;tier:string;
   lifecycle:string;home_market_name:string|null;roster_size:number}>(`
   WITH eligible AS (
    SELECT p.world_id,p.promotion_id,p.name,p.tier,p.lifecycle,p.home_market_id
    FROM ppw_promotions p WHERE p.world_id=$1 AND p.lifecycle='ACTIVE'
      AND p.takeover_eligibility='STANDARD' AND p.promotion_id>$2
      AND NOT EXISTS (SELECT 1 FROM ppw_promotion_controls c
       WHERE c.world_id=p.world_id AND c.promotion_id=p.promotion_id AND c.active)
    ORDER BY p.promotion_id LIMIT $3
   )
   SELECT e.promotion_id,e.name,e.tier,e.lifecycle,m.name AS home_market_name,
    (SELECT count(*)::integer FROM ppw_contracts c
     WHERE c.world_id=e.world_id AND c.promotion_id=e.promotion_id
      AND c.status='SIGNED') AS roster_size
   FROM eligible e LEFT JOIN ppw_markets m
    ON m.world_id=e.world_id AND m.market_id=e.home_market_id
   ORDER BY e.promotion_id
  `,[worldId,afterId??"",limit]);
  return rows.map(r=>({id:r.promotion_id,name:r.name,tier:r.tier,
   lifecycle:r.lifecycle,homeMarketName:r.home_market_name,
   rosterSize:r.roster_size}));
 });
}
