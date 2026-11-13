/** Replies to certified broadcaster warnings. Game outcomes use only the
 * existing independently certified TV audit. No AI, polling or inbox writes.
 */
import {applyWorldCommand} from "./world-commands.js";
import type {TransactionPool} from "./transaction.js";
import type {SqlRows} from "./world-operations.js";
import type {NetworkAudit} from "./broadcast-network-audit.js";

export type NetworkDecision="COMMIT_RECOVERY"|"STAND_FIRM";
export type NetworkStatus="PENDING"|"ACKNOWLEDGED"|"KEPT"|"BROKEN"|"EXCUSED";
export interface NetworkReplyInput {
 worldId:string;promotionId:string;playerId:string;mailId:string;
 decision:NetworkDecision;requestId:string;expectedRevision:number;
}
export async function replyToBroadcaster(pool:TransactionPool,i:NetworkReplyInput){
 if(![i.worldId,i.promotionId,i.playerId,i.requestId].every(
  x=>typeof x==="string"&&!!x&&x.length<=200)||
  !/^backstage-world:[a-f0-9]{32}$/.test(i.mailId)||
  !["COMMIT_RECOVERY","STAND_FIRM"].includes(i.decision))
  throw new Error("Invalid broadcaster reply");
 return applyWorldCommand(pool,{worldId:i.worldId,playerId:i.playerId,
  requestId:i.requestId,expectedRevision:i.expectedRevision,
  commandType:"BACKSTAGE_NETWORK_REPLY",requiresOpenWeek:true,
  execute:async tx=>{
   const rows=await tx.query<{deal_id:string;week_index:number}>([
    "SELECT d.deal_id,(w.year-1)*52+w.week-1 AS week_index",
    "FROM ppw_world_news_items n",
    "JOIN ppw_worlds w ON w.world_id=n.world_id",
    "JOIN ppw_promotion_controls c ON c.world_id=n.world_id",
    "AND c.promotion_id=n.promotion_id AND c.player_id=$3 AND c.active",
    "JOIN ppw_memberships m ON m.world_id=c.world_id",
    "AND m.player_id=c.player_id AND m.status='ACTIVE'",
    "JOIN ppw_promotions p ON p.world_id=n.world_id",
    "AND p.promotion_id=n.promotion_id AND p.lifecycle='ACTIVE'",
    "JOIN ppw_commercial_deals d ON d.world_id=n.world_id",
    "AND d.promotion_id=n.promotion_id AND d.kind='BROADCAST'",
    "AND d.status='ACTIVE' AND d.offer_code=split_part(n.story_key,':',3)",
    "AND d.start_week_index<=(w.year-1)*52+w.week-1",
    "AND d.end_week_index>=(w.year-1)*52+w.week-1",
    "WHERE n.world_id=$1 AND n.promotion_id=$2",
    "AND n.desk='OFFICIAL' AND n.certainty='CONFIRMED'",
    "AND n.source_kind='EVENT'",
    "AND (n.story_key LIKE 'broadcast:network:%:warning:%'",
    "OR n.story_key LIKE 'broadcast:network:%:final-warning:%')",
    "AND 'backstage-world:'||md5('network:'||n.story_key)=$4",
    "AND (n.year-1)*52+n.week-1 BETWEEN",
    "greatest(0,(w.year-1)*52+w.week-13) AND (w.year-1)*52+w.week-1",
    "LIMIT 2"
   ].join(" "),[i.worldId,i.promotionId,i.playerId,i.mailId]);
   if(rows.length!==1)throw new Error("This broadcaster warning is no longer actionable");
   const already=await tx.query<{mail_id:string}>([
    "SELECT mail_id FROM ppw_backstage_network_replies",
    "WHERE world_id=$1 AND promotion_id=$2 AND mail_id=$3 LIMIT 1"
   ].join(" "),[i.worldId,i.promotionId,i.mailId]);
   if(already.length)throw new Error("This broadcaster already received a reply");
   const now=rows[0]!.week_index;
   const status:NetworkStatus=i.decision==="COMMIT_RECOVERY"?"PENDING":"ACKNOWLEDGED";
   await tx.query([
    "INSERT INTO ppw_backstage_network_replies",
    "(world_id,promotion_id,mail_id,deal_id,player_id,decision,status,",
    "responded_week_index,due_week_index,settled_week_index)",
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)"
   ].join(" "),[i.worldId,i.promotionId,i.mailId,rows[0]!.deal_id,
    i.playerId,i.decision,status,now,now+3,status==="ACKNOWLEDGED"?now:null]);
   return {mailId:i.mailId,decision:i.decision,status,dueWeekIndex:now+3};
  }});
}

/** Settles in the same certified World-week transaction that publishes
 * broadcaster criticism and awards actual TV bonuses. One bounded SQL call.
 * An expired agreement excuses an unfinished promise; replies never rewrite pay.
 */
export async function settleNetworkReplies(tx:SqlRows,worldId:string,
 weekIndex:number,audits:readonly NetworkAudit[]){
 if(!worldId||worldId.length>200||!Number.isSafeInteger(weekIndex)||weekIndex<0||
  audits.length>128)throw new Error("Invalid network promise settlement");
 const evidence=audits.map(a=>({deal_id:a.dealId,
  week_index:a.review.reviewWeekIndex,status:a.review.status}));
 const updated=await tx.query<{mail_id:string}>([
  "WITH performance AS (SELECT deal_id,week_index,status",
  "FROM jsonb_to_recordset($3::jsonb)",
  "AS p(deal_id text,week_index integer,status text))",
  "UPDATE ppw_backstage_network_replies r SET",
  "status=CASE WHEN d.end_week_index<$2 THEN 'EXCUSED'",
  "WHEN performance.status='ON_TARGET' AND performance.week_index=$2",
  "THEN 'KEPT' ELSE 'BROKEN' END,settled_week_index=$2",
  "FROM ppw_commercial_deals d",
  "LEFT JOIN performance ON performance.deal_id=d.deal_id",
  "WHERE r.world_id=$1 AND r.status='PENDING'",
  "AND r.responded_week_index<$2",
  "AND d.world_id=r.world_id AND d.deal_id=r.deal_id",
  "AND (d.end_week_index<$2 OR r.due_week_index<=$2",
  "OR (performance.status='ON_TARGET' AND performance.week_index=$2))",
  "RETURNING r.mail_id"
 ].join(" "),[worldId,weekIndex,JSON.stringify(evidence)]);
 if(updated.length>128)throw new Error("Network reply settlement exceeded World bound");
 return {settled:updated.length};
}
