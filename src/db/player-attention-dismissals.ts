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
  ].join(" "),isBackstage?
   [worldId,promotionId,playerId,attentionId.slice(backstagePrefix.length),attentionId]:
   [worldId,promotionId,playerId,offerId,attentionId]);
  if(result.length!==1||!result[0]!.permitted)
   throw new Error("This update is unavailable or cannot be dismissed");
  return {dismissed:true,firstDismissal:result[0]!.inserted};
 });
}

/** Clear up to ten published, resolved notices in ONE atomic and owner-scoped
 * statement. Any forged/expired item aborts the entire set.
 */
export async function dismissResolvedAttentionBatch(pool:TransactionPool,s:{
 worldId:string;promotionId:string;playerId:string;attentionIds:readonly string[];
}){
 const {worldId,promotionId,playerId,attentionIds}=s;
 const valid=(id:string)=>(
  id.startsWith("offer-result:")&&id.length>13&&id.length<=230
 )||/^backstage-result:[1-9][0-9]{0,14}$/.test(id);
 if(![worldId,promotionId,playerId].every(x=>
  typeof x==="string"&&x.trim().length>0&&x.length<=200)||
  !Array.isArray(attentionIds)||attentionIds.length<1||attentionIds.length>10||
  attentionIds.some(x=>typeof x!=="string"||!valid(x))||
  new Set(attentionIds).size!==attentionIds.length)
  throw new Error("Invalid settled updates");
 return withSqlClient(pool,async tx=>{
  const rows=await tx.query<{permitted_count:number;inserted_count:number}>([
   "WITH owner AS (",
   "SELECT w.year,w.week,w.world_id FROM ppw_worlds w",
   "JOIN ppw_promotion_controls c ON c.world_id=w.world_id",
   "AND c.promotion_id=$2 AND c.player_id=$3 AND c.active",
   "JOIN ppw_memberships m ON m.world_id=c.world_id",
   "AND m.player_id=c.player_id AND m.status='ACTIVE'",
   "JOIN ppw_promotions p ON p.world_id=c.world_id",
   "AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'",
   "WHERE w.world_id=$1",
   "), requested AS (SELECT unnest($4::text[]) AS attention_id),",
   "permitted AS (",
   "SELECT requested.attention_id FROM requested CROSS JOIN owner w",
   "WHERE EXISTS (SELECT 1 FROM ppw_contract_offers offer",
   "WHERE offer.world_id=w.world_id AND offer.promotion_id=$2",
   "AND requested.attention_id='offer-result:'||offer.offer_id",
   "AND offer.status IN ('ACCEPTED','REJECTED')",
   "AND offer.submitted_week_index BETWEEN",
   "greatest(0,(w.year-1)*52+w.week-1-3) AND (w.year-1)*52+w.week-1)",
   "OR EXISTS (SELECT 1 FROM ppw_ledger_events event",
   "JOIN ppw_backstage_requests request ON request.world_id=event.world_id",
   "AND request.request_id=event.payload->>'conversationId'",
   "AND request.promotion_id=$2",
   "WHERE event.world_id=w.world_id",
   "AND requested.attention_id='backstage-result:'||event.event_id::text",
   "AND event.event_type IN ('BACKSTAGE_PROMISE_FULFILLED','BACKSTAGE_PROMISE_BROKEN')",
   "AND event.payload->>'promotionId'=$2",
   "AND event.payload->>'personId'=request.person_id",
   "AND request.status=CASE",
   "WHEN event.event_type='BACKSTAGE_PROMISE_FULFILLED'",
   "THEN 'FULFILLED' ELSE 'BROKEN' END",
   "AND (event.year-1)*52+event.week-1 BETWEEN",
   "greatest(0,(w.year-1)*52+w.week-1-3) AND (w.year-1)*52+w.week-1)",
   "), inserted AS (",
   "INSERT INTO ppw_player_attention_dismissals",
   "(world_id,player_id,promotion_id,attention_id)",
   "SELECT $1,$3,$2,attention_id FROM permitted",
   "WHERE (SELECT count(*) FROM permitted)=cardinality($4::text[])",
   "ON CONFLICT DO NOTHING RETURNING attention_id",
   ") SELECT (SELECT count(*)::integer FROM permitted) AS permitted_count,",
   "(SELECT count(*)::integer FROM inserted) AS inserted_count"
  ].join(" "),[worldId,promotionId,playerId,attentionIds]);
  if(rows.length!==1||Number(rows[0]!.permitted_count)!==attentionIds.length)
   throw new Error("One or more updates are unavailable or cannot be dismissed");
  return {dismissed:attentionIds.length,
   firstDismissals:Number(rows[0]!.inserted_count)};
 });
}
