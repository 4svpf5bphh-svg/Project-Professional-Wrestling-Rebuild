/** A reply to an actual uncontracted wrestler's published-show approach.
 * An invitation is a conversation, never an offer or a signing. Subsequent
 * status is read exclusively from canonical contract offers.
 */
import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";

export type RecruitmentDecision="INVITE"|"PASS";
export interface RecruitmentResponseInput{
 worldId:string;promotionId:string;playerId:string;mailId:string;
 decision:RecruitmentDecision;requestId:string;expectedRevision:number;
}
export async function respondToFreeAgent(pool:TransactionPool,i:RecruitmentResponseInput){
 if(![i.worldId,i.promotionId,i.playerId,i.requestId].every(
  s=>typeof s==="string"&&s.length>0&&s.length<=200)||
  !/^backstage-world:[a-f0-9]{32}$/.test(i.mailId)||
  !["INVITE","PASS"].includes(i.decision))
  throw new Error("Invalid recruitment conversation");
 return applyWorldCommand(pool,{worldId:i.worldId,playerId:i.playerId,
  requestId:i.requestId,expectedRevision:i.expectedRevision,
  commandType:"BACKSTAGE_FREE_AGENT_REPLY",requiresOpenWeek:true,
  execute:async tx=>{
   // Same genuine completed/published show and ranked available wrestler as
   // the single World inbox source. A rival, stale contact, fabricated ID,
   // or a wrestler who has signed elsewhere cannot receive this reply.
   const sources=await tx.query<{person_id:string;now:number}>([
    "WITH owner AS (",
    " SELECT (w.year-1)*52+w.week-1 AS now FROM ppw_worlds w",
    " JOIN ppw_promotion_controls c ON c.world_id=w.world_id",
    " AND c.promotion_id=$2 AND c.player_id=$3 AND c.active",
    " JOIN ppw_memberships m ON m.world_id=c.world_id",
    " AND m.player_id=c.player_id AND m.status='ACTIVE'",
    " JOIN ppw_promotions company ON company.world_id=c.world_id",
    " AND company.promotion_id=c.promotion_id AND company.lifecycle='ACTIVE'",
    " WHERE w.world_id=$1",
    "), stimulus AS (",
    " SELECT min((done.year-1)*52+done.week-1)::integer AS first_week",
    " FROM ppw_completed_shows done",
    " JOIN ppw_world_news_weeks news ON news.world_id=done.world_id",
    " AND news.year=done.year AND news.week=done.week",
    " JOIN owner o ON true",
    " WHERE done.world_id=$1 AND done.promotion_id=$2",
    " AND (done.year-1)*52+done.week-1",
    " BETWEEN (floor(o.now/8)*8)::integer AND o.now",
    "), available AS (",
    " SELECT p.person_id FROM ppw_people p JOIN owner o ON true",
    " WHERE p.world_id=$1 AND p.status='ACTIVE'",
    " AND p.popularity BETWEEN 25 AND 70",
    " AND NOT EXISTS (SELECT 1 FROM ppw_contracts c",
    " WHERE c.world_id=p.world_id AND c.person_id=p.person_id",
    " AND c.status='SIGNED' AND c.start_week_index<=o.now",
    " AND c.expires_week_index>=o.now)",
    " ORDER BY p.popularity DESC,p.person_id LIMIT 1",
    ")",
    " SELECT available.person_id,o.now FROM owner o",
    " JOIN stimulus ON stimulus.first_week IS NOT NULL",
    " JOIN available ON true",
    " WHERE 'backstage-world:'||md5('free-agent:'||available.person_id||",
    " ':'||floor(o.now/8)::integer)=$4",
    " LIMIT 2"
   ].join(" "),[i.worldId,i.promotionId,i.playerId,i.mailId]);
   if(sources.length!==1)throw new Error("This wrestler's approach is no longer active");
   const prior=await tx.query<{mail_id:string}>([
    "SELECT mail_id FROM ppw_backstage_free_agent_replies",
    "WHERE world_id=$1 AND promotion_id=$2 AND mail_id=$3 LIMIT 1"
   ].join(" "),[i.worldId,i.promotionId,i.mailId]);
   if(prior.length)throw new Error("You have already answered this approach");
   const personId=sources[0]!.person_id;
   await tx.query([
    "INSERT INTO ppw_backstage_free_agent_replies",
    "(world_id,promotion_id,mail_id,person_id,player_id,decision,responded_week_index)",
    "VALUES($1,$2,$3,$4,$5,$6,$7)"
   ].join(" "),[i.worldId,i.promotionId,i.mailId,personId,
    i.playerId,i.decision,sources[0]!.now]);
   return {mailId:i.mailId,personId,decision:i.decision,
    status:i.decision==="INVITE"?"INVITED":"DECLINED"};
  }});
}
