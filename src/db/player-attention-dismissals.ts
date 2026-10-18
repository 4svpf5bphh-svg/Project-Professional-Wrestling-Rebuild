/** Narrow, non-World-changing acknowledgement of resolved contract news.
 * Never receives an actor identity from the browser, and never accepts booking
 * or action-required attention keys. No background writes or global snapshots.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
export interface DismissalScope{
 worldId:string;promotionId:string;playerId:string;attentionId:string;
}
export async function dismissResolvedOfferAttention(pool:TransactionPool,scope:DismissalScope){
 const {worldId,promotionId,playerId,attentionId}=scope;
 const prefix="offer-result:";
 if(![worldId,promotionId,playerId].every(x=>
  typeof x==="string"&&!!x.trim()&&x.length<=200)||
  typeof attentionId!=="string"||!attentionId.startsWith(prefix)||
  attentionId.length<=prefix.length||attentionId.length>230)
  throw new Error("Invalid dismissible contract news");
 const offerId=attentionId.slice(prefix.length);
 return withSqlClient(pool,async tx=>{
  const result=await tx.query<{permitted:boolean;inserted:boolean}>([
   "WITH permitted AS (",
   "SELECT offer.offer_id FROM ppw_contract_offers offer",
   "JOIN ppw_promotion_controls c ON c.world_id=offer.world_id",
   "AND c.promotion_id=offer.promotion_id AND c.player_id=$3 AND c.active",
   "JOIN ppw_memberships m ON m.world_id=c.world_id",
   "AND m.player_id=c.player_id AND m.status='ACTIVE'",
   "JOIN ppw_promotions owner ON owner.world_id=c.world_id",
   "AND owner.promotion_id=c.promotion_id AND owner.lifecycle='ACTIVE'",
   "JOIN ppw_worlds w ON w.world_id=offer.world_id",
   "WHERE offer.world_id=$1 AND offer.promotion_id=$2 AND offer.offer_id=$4",
   "AND offer.status IN ('ACCEPTED','REJECTED')",
   "AND offer.submitted_week_index BETWEEN",
   "greatest(0,(w.year-1)*52+w.week-1-3) AND (w.year-1)*52+w.week-1",
   "LIMIT 1",
   "), created AS (",
   "INSERT INTO ppw_player_attention_dismissals",
   "(world_id,player_id,promotion_id,attention_id)",
   "SELECT $1,$3,$2,$5 FROM permitted ON CONFLICT DO NOTHING",
   "RETURNING attention_id",
   ") SELECT EXISTS(SELECT 1 FROM permitted) AS permitted,",
   "EXISTS(SELECT 1 FROM created) AS inserted"
  ].join(" "),[worldId,promotionId,playerId,offerId,attentionId]);
  if(result.length!==1||!result[0]!.permitted)
   throw new Error("Contract news is unavailable or cannot be dismissed");
  return {dismissed:true,firstDismissal:result[0]!.inserted};
 });
}
