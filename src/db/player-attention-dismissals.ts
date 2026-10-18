/** Narrow, non-World-changing acknowledgement of resolved contract and
 * locker-room news. Action-required items cannot be hidden. No background writes.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
export interface DismissalScope{
 worldId:string;promotionId:string;playerId:string;attentionId:string;
}
export async function dismissResolvedOfferAttention(pool:TransactionPool,scope:DismissalScope){
 const {worldId,promotionId,playerId,attentionId}=scope;
 const prefix="offer-result:",backstagePrefix="backstage-result:";
 const isBackstage=typeof attentionId==="string"&&attentionId.startsWith(backstagePrefix);
 if(![worldId,promotionId,playerId].every(x=>
  typeof x==="string"&&!!x.trim()&&x.length<=200)||
  typeof attentionId!=="string"||
  !(attentionId.startsWith(prefix)||isBackstage)||
  attentionId.length>230||
  (isBackstage?!/^[1-9][0-9]{0,14}$/.test(attentionId.slice(backstagePrefix.length)):
   attentionId.length<=prefix.length))
  throw new Error("Invalid dismissible news");
 const offerId=isBackstage?"":attentionId.slice(prefix.length);
 return withSqlClient(pool,async tx=>{
  const result=await tx.query<{permitted:boolean;inserted:boolean}>(isBackstage?[
   "WITH permitted AS (",
   "SELECT event.event_id FROM ppw_ledger_events event",
   "JOIN ppw_backstage_requests request ON request.world_id=event.world_id",
   "AND request.request_id=event.payload->>'conversationId'",
   "AND request.promotion_id=$2",
   "JOIN ppw_promotion_controls c ON c.world_id=event.world_id",
   "AND c.promotion_id=$2 AND c.player_id=$3 AND c.active",
   "JOIN ppw_memberships m ON m.world_id=c.world_id",
   "AND m.player_id=c.player_id AND m.status='ACTIVE'",
   "JOIN ppw_promotions owner ON owner.world_id=c.world_id",
   "AND owner.promotion_id=c.promotion_id AND owner.lifecycle='ACTIVE'",
   "JOIN ppw_worlds w ON w.world_id=event.world_id",
   "WHERE event.world_id=$1 AND event.event_id=$4::bigint",
   "AND event.event_type IN ('BACKSTAGE_PROMISE_FULFILLED','BACKSTAGE_PROMISE_BROKEN')",
   "AND event.payload->>'promotionId'=$2",
   "AND event.payload->>'personId'=request.person_id",
   "AND request.status=CASE",
   "WHEN event.event_type='BACKSTAGE_PROMISE_FULFILLED'",
   "THEN 'FULFILLED' ELSE 'BROKEN' END",
   "AND (event.year-1)*52+event.week-1 BETWEEN",
   "greatest(0,(w.year-1)*52+w.week-1-3) AND (w.year-1)*52+w.week-1",
   "LIMIT 1",
   "), created AS (",
   "INSERT INTO ppw_player_attention_dismissals",
   "(world_id,player_id,promotion_id,attention_id)",
   "SELECT $1,$3,$2,$5 FROM permitted ON CONFLICT DO NOTHING",
   "RETURNING attention_id",
   ") SELECT EXISTS(SELECT 1 FROM permitted) AS permitted,",
   "EXISTS(SELECT 1 FROM created) AS inserted"
  ].join(" "):[
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
  ].join(" "),[worldId,promotionId,playerId,offerId,attentionId]:
   [worldId,promotionId,playerId,attentionId.slice(backstagePrefix.length),attentionId]);
  if(result.length!==1||!result[0]!.permitted)
   throw new Error("This update is unavailable or cannot be dismissed");
  return {dismissed:true,firstDismissal:result[0]!.inserted};
 });
}
