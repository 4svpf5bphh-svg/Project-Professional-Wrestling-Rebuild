/** Private wrestler correspondence, generated only at World publication. */
import type {SqlRows} from "./world-operations.js";
import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {backstageDecisionEffect,type BackstageKind,type BackstageDecision}
 from "../domain/backstage-conversations.js";
export interface BackstageDecisionInput {
 worldId:string;promotionId:string;playerId:string;requestId:string;
 expectedRevision:number;conversationId:string;decision:BackstageDecision;
}
export async function decideBackstageRequest(pool:TransactionPool,i:BackstageDecisionInput){
 if(![i.worldId,i.promotionId,i.playerId,i.requestId,i.conversationId]
  .every(x=>typeof x==="string"&&x.length>0&&x.length<=200))
  throw new Error("Invalid Backstage command");
 return applyWorldCommand(pool,{worldId:i.worldId,playerId:i.playerId,
  requestId:i.requestId,expectedRevision:i.expectedRevision,
  commandType:"BACKSTAGE_DECISION",requiresOpenWeek:true,
  execute:async tx=>{
   const found=await tx.query<{person_id:string;related_person_id:string|null;
    kind:BackstageKind;year:number;week:number;morale:number|null}>([
    "SELECT r.person_id,r.related_person_id,r.kind,w.year,w.week,p.morale",
    "FROM ppw_backstage_requests r JOIN ppw_worlds w ON w.world_id=r.world_id",
    "JOIN ppw_people p ON p.world_id=r.world_id AND p.person_id=r.person_id",
    "JOIN ppw_promotion_controls c ON c.world_id=r.world_id",
    "AND c.promotion_id=r.promotion_id AND c.player_id=$4 AND c.active",
    "JOIN ppw_memberships m ON m.world_id=c.world_id",
    "AND m.player_id=c.player_id AND m.status='ACTIVE'",
    "JOIN ppw_promotions promo ON promo.world_id=r.world_id",
    "AND promo.promotion_id=r.promotion_id AND promo.lifecycle='ACTIVE'",
    "WHERE r.world_id=$1 AND r.request_id=$2 AND r.promotion_id=$3",
    "AND r.status='PENDING' AND p.status='ACTIVE'",
    "AND EXISTS(SELECT 1 FROM ppw_contracts deal",
    "WHERE deal.world_id=r.world_id AND deal.promotion_id=r.promotion_id",
    "AND deal.person_id=r.person_id AND deal.status='SIGNED'",
    "AND deal.start_week_index<=(w.year-1)*52+w.week-1",
    "AND deal.expires_week_index>=(w.year-1)*52+w.week-1)",
    "FOR UPDATE OF r"
   ].join(" "),[i.worldId,i.conversationId,i.promotionId,i.playerId]);
   if(found.length!==1)throw new Error("Wrestler request unavailable or already answered");
   const r=found[0]!,effect=backstageDecisionEffect(r.kind,i.decision);
   const weekIndex=(r.year-1)*52+r.week-1;
   const changed=await tx.query<{request_id:string}>([
    "UPDATE ppw_backstage_requests SET status=$4,decision=$5,",
    "responded_week_index=$6,due_week_index=$7",
    "WHERE world_id=$1 AND request_id=$2 AND promotion_id=$3 AND status='PENDING'",
    "RETURNING request_id"
   ].join(" "),[i.worldId,i.conversationId,i.promotionId,
    effect.status,i.decision,weekIndex,effect.promise?weekIndex+2:null]);
   if(changed.length!==1)throw new Error("Backstage request changed");
   await tx.query([
    "UPDATE ppw_people SET morale=greatest(0,least(100,morale+$3))",
    "WHERE world_id=$1 AND person_id=$2 AND morale IS NOT NULL"
   ].join(" "),[i.worldId,r.person_id,effect.moraleDelta]);
   if(i.decision==="MEDIATE"&&r.related_person_id){
    const [a,b]=[r.person_id,r.related_person_id].sort();
    await tx.query([
     "UPDATE ppw_wrestler_relationships SET",
     "professional_trust=least(100,professional_trust+3)",
     "WHERE world_id=$1 AND person_a_id=$2 AND person_b_id=$3"
    ].join(" "),[i.worldId,a,b]);
   }
   await tx.query([
    "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
    "VALUES($1,$2,$3,'BACKSTAGE_RESPONSE',",
    "jsonb_build_object('promotionId',$4::text,'personId',$5::text,",
    "'conversationId',$6::text,'decision',$7::text))"
   ].join(" "),[i.worldId,r.year,r.week,i.promotionId,r.person_id,
    i.conversationId,i.decision]);
   return {conversationId:i.conversationId,personId:r.person_id,
    status:effect.status,decision:i.decision,
    dueWeekIndex:effect.promise?weekIndex+2:null,
    moraleDelta:r.morale===null?0:effect.moraleDelta};
  }});
}
/** Promise fulfillment is checked against completed card MATCH slots of this
 * promotion only; the match result and outcome remain player-authored.
 */
export async function settleBackstagePromises(tx:SqlRows,worldId:string,weekIndex:number){
 const rows=await tx.query<{person_id:string;status:string;
  promotion_id:string;request_id:string}>([
  "UPDATE ppw_backstage_requests r SET status=CASE WHEN EXISTS(",
  "SELECT 1 FROM ppw_completed_shows sh",
  "JOIN ppw_card_slots s ON s.world_id=sh.world_id AND s.draft_id=sh.show_id",
  "WHERE sh.world_id=r.world_id AND sh.promotion_id=r.promotion_id",
  "AND (sh.year-1)*52+sh.week-1 BETWEEN r.responded_week_index AND $2",
  "AND ((r.decision='PROMISE_APPEARANCE' AND s.kind='MATCH' AND EXISTS(",
  "SELECT 1 FROM ppw_completed_show_matches played",
  "WHERE played.world_id=s.world_id AND played.show_id=sh.show_id",
  "AND played.match_id=s.slot_id))",
  "OR (r.decision='PROMISE_SEGMENT' AND s.kind='SEGMENT' AND EXISTS(",
  "SELECT 1 FROM ppw_completed_show_segments played",
  "WHERE played.world_id=s.world_id AND played.show_id=sh.show_id",
  "AND played.slot_id=s.slot_id)))",
  "AND s.payload->'participants' @>",
  "jsonb_build_array(jsonb_build_object('personId',r.person_id)))",
  "THEN 'FULFILLED' ELSE 'BROKEN' END",
  "WHERE r.world_id=$1 AND r.status='PROMISED' AND",
  "(r.due_week_index<=$2 OR EXISTS(",
  "SELECT 1 FROM ppw_completed_shows sh",
  "JOIN ppw_card_slots s ON s.world_id=sh.world_id AND s.draft_id=sh.show_id",
  "WHERE sh.world_id=r.world_id AND sh.promotion_id=r.promotion_id",
  "AND (sh.year-1)*52+sh.week-1 BETWEEN r.responded_week_index AND $2",
  "AND ((r.decision='PROMISE_APPEARANCE' AND s.kind='MATCH' AND EXISTS(",
  "SELECT 1 FROM ppw_completed_show_matches played",
  "WHERE played.world_id=s.world_id AND played.show_id=sh.show_id",
  "AND played.match_id=s.slot_id))",
  "OR (r.decision='PROMISE_SEGMENT' AND s.kind='SEGMENT' AND EXISTS(",
  "SELECT 1 FROM ppw_completed_show_segments played",
  "WHERE played.world_id=s.world_id AND played.show_id=sh.show_id",
  "AND played.slot_id=s.slot_id)))",
  "AND s.payload->'participants' @>",
  "jsonb_build_array(jsonb_build_object('personId',r.person_id))))",
  "RETURNING r.person_id,r.status,r.promotion_id,r.request_id"
 ].join(" "),[worldId,weekIndex]);
 if(rows.length>512)throw new Error("Backstage promise settlement overflow");
 if(!rows.length)return {settled:0};
 const byPerson=new Map<string,{person_id:string;morale_delta:number;momentum_delta:number}>();
 for(const row of rows){
  const entry=byPerson.get(row.person_id)??{person_id:row.person_id,
   morale_delta:0,momentum_delta:0};
  entry.morale_delta+=row.status==="FULFILLED"?6:-6;
  entry.momentum_delta+=row.status==="FULFILLED"?4:-4;
  byPerson.set(row.person_id,entry);
 }
 await tx.query([
  "UPDATE ppw_people p SET",
  "morale=CASE WHEN p.morale IS NULL THEN NULL ELSE",
  "greatest(0,least(100,p.morale+x.morale_delta)) END,",
  "momentum=CASE WHEN p.momentum IS NULL THEN NULL ELSE",
  "greatest(0,least(100,p.momentum+x.momentum_delta)) END",
  "FROM jsonb_to_recordset($2::jsonb) AS x(",
  "person_id text,morale_delta integer,momentum_delta integer)",
  "WHERE p.world_id=$1 AND p.person_id=x.person_id"
 ].join(" "),[worldId,JSON.stringify([...byPerson.values()])]);
 await tx.query([
  "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
  "SELECT $1,$2,$3,'BACKSTAGE_PROMISE_'||x.status,",
  "jsonb_build_object('promotionId',x.promotion_id,'personId',x.person_id,",
  "'conversationId',x.request_id)",
  "FROM jsonb_to_recordset($4::jsonb) AS x(",
  "person_id text,status text,promotion_id text,request_id text)"
 ].join(" "),[worldId,Math.floor(weekIndex/52)+1,weekIndex%52+1,JSON.stringify(rows)]);
 return {settled:rows.length};
}
/** One batched INSERT for all human promotions, at most two conversations each.
 * Eight-week per-person cooldown; no messages for uncontracted wrestlers.
 */
export async function publishBackstageRequests(tx:SqlRows,worldId:string,weekIndex:number){
 const rows=await tx.query<{request_id:string}>([
  "WITH eligible AS (SELECT DISTINCT ON (c.promotion_id,c.person_id)",
  "c.promotion_id,c.person_id,p.morale,p.momentum,p.recognition,c.expires_week_index,",
  "(SELECT CASE WHEN rel.person_a_id=p.person_id THEN rel.person_b_id",
  "ELSE rel.person_a_id END FROM ppw_wrestler_relationships rel",
  "WHERE rel.world_id=p.world_id AND",
  "(rel.person_a_id=p.person_id OR rel.person_b_id=p.person_id)",
  "AND rel.professional_trust<25",
  "ORDER BY rel.professional_trust,rel.person_a_id,rel.person_b_id LIMIT 1)",
  "AS related_person_id",
  "FROM ppw_contracts c JOIN ppw_people p ON p.world_id=c.world_id",
  "AND p.person_id=c.person_id",
  "JOIN ppw_promotions promo ON promo.world_id=c.world_id",
  "AND promo.promotion_id=c.promotion_id AND promo.lifecycle='ACTIVE'",
  "JOIN ppw_promotion_controls owner ON owner.world_id=c.world_id",
  "AND owner.promotion_id=c.promotion_id AND owner.active",
  "JOIN ppw_memberships member ON member.world_id=owner.world_id",
  "AND member.player_id=owner.player_id AND member.status='ACTIVE'",
  "WHERE c.world_id=$1 AND c.status='SIGNED' AND p.status='ACTIVE'",
  "AND c.start_week_index<=$2 AND c.expires_week_index>=$2",
  "AND NOT EXISTS(SELECT 1 FROM ppw_backstage_requests earlier",
  "WHERE earlier.world_id=c.world_id AND earlier.promotion_id=c.promotion_id",
  "AND earlier.person_id=c.person_id",
  "AND (earlier.status IN ('PENDING','PROMISED')",
  "OR earlier.created_week_index>=$2-8))",
  "ORDER BY c.promotion_id,c.person_id,c.expires_week_index),",
  "candidates AS (SELECT e.*,CASE",
  "WHEN e.expires_week_index<=$2+3 THEN 'CONTRACT'",
  "WHEN e.morale<35 THEN 'MORALE'",
  "WHEN e.momentum<25 THEN 'MOMENTUM'",
  "WHEN e.recognition>=55 AND e.momentum<55 THEN 'CREATIVE'",
  "WHEN e.related_person_id IS NOT NULL THEN 'PARTNERSHIP'",
  "ELSE NULL END AS kind FROM eligible e),",
  "ranked AS (SELECT *,row_number() OVER(PARTITION BY promotion_id",
  "ORDER BY CASE kind WHEN 'CONTRACT' THEN 0 WHEN 'MORALE' THEN 1",
  "WHEN 'MOMENTUM' THEN 2 WHEN 'CREATIVE' THEN 3 ELSE 4 END,",
  "coalesce(morale,50),person_id) AS rank",
  "FROM candidates WHERE kind IS NOT NULL)",
  "INSERT INTO ppw_backstage_requests(",
  "world_id,request_id,promotion_id,person_id,related_person_id,kind,created_week_index)",
  "SELECT $1,'backstage:'||$2::text||':'||promotion_id||':'||person_id,",
  "promotion_id,person_id,related_person_id,kind,$2 FROM ranked",
  "WHERE rank<=2 ON CONFLICT DO NOTHING RETURNING request_id"
 ].join(" "),[worldId,weekIndex]);
 if(rows.length>256)throw new Error("Backstage generation exceeds World limit");
 return {newMessages:rows.length};
}
