/** A second wrestler responds only to an actual manager-mediated working
 * partnership issue. Willingness reflects verified professional trust and
 * current condition; neither speech nor managerial invitation changes it.
 */
import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
export type PartnerReplyChoice="INVITE"|"LEAVE";
export type PartnerReplyOutcome="READY"|"CAUTIOUS"|"DECLINED";
export interface PartnerReplyInput{
 worldId:string;promotionId:string;playerId:string;mailId:string;
 decision:PartnerReplyChoice;requestId:string;expectedRevision:number;
}
/** Owner/now are provided by the caller. The same two-person, current-contract
 * evidence backs the inbox, Home badge and authenticated command validation.
 * Once resolved, the original message remains readable but is not actionable.
 */
export const PARTNER_MEDIATION_CANDIDATES_SQL=String.raw`
 SELECT r.request_id,r.person_id,r.related_person_id AS partner_id,
  r.responded_week_index,r.follow_through_week_index,
  initiator.name AS initiating_name,other.name AS partner_name,
  other.fatigue AS partner_fatigue,relation.professional_trust
 FROM ppw_backstage_requests r
 JOIN ppw_people initiator ON initiator.world_id=r.world_id
  AND initiator.person_id=r.person_id AND initiator.status IN ('ACTIVE','INJURED')
 JOIN ppw_people other ON other.world_id=r.world_id
  AND other.person_id=r.related_person_id AND other.status IN ('ACTIVE','INJURED')
 JOIN ppw_wrestler_relationships relation ON relation.world_id=r.world_id
  AND relation.person_a_id=least(r.person_id,r.related_person_id)
  AND relation.person_b_id=greatest(r.person_id,r.related_person_id)
 WHERE r.world_id=$1 AND r.promotion_id=$2
  AND r.kind='PARTNERSHIP' AND r.decision='MEDIATE'
  AND r.status='ANSWERED' AND r.related_person_id IS NOT NULL
  AND r.responded_week_index BETWEEN greatest(0,o.now-12) AND o.now
  AND EXISTS(
   SELECT 1 FROM ppw_contracts signed
   WHERE signed.world_id=r.world_id AND signed.promotion_id=r.promotion_id
    AND signed.person_id=r.person_id AND signed.status='SIGNED'
    AND signed.start_week_index<=o.now AND signed.expires_week_index>=o.now)
  AND EXISTS(
   SELECT 1 FROM ppw_contracts signed
   WHERE signed.world_id=r.world_id AND signed.promotion_id=r.promotion_id
    AND signed.person_id=r.related_person_id AND signed.status='SIGNED'
    AND signed.start_week_index<=o.now AND signed.expires_week_index>=o.now)
 ORDER BY r.responded_week_index DESC,r.request_id DESC LIMIT 2`;

export function partnerMediationOutcome(decision:PartnerReplyChoice,
 trust:number,fatigue:number):PartnerReplyOutcome{
 if(decision==="LEAVE")return "DECLINED";
 if(!Number.isFinite(trust)||trust< -100||trust>100||
  !Number.isFinite(fatigue)||fatigue<0||fatigue>100)
  throw Error("Invalid verified partner condition");
 return trust>=45&&fatigue<75?"READY":"CAUTIOUS";
}
export async function respondToPartnerMediation(pool:TransactionPool,i:PartnerReplyInput){
 if(![i.worldId,i.promotionId,i.playerId,i.requestId].every(
  x=>typeof x==="string"&&!!x&&x.length<=200)||
  !/^backstage-world:[a-f0-9]{32}$/.test(i.mailId)||
  !["INVITE","LEAVE"].includes(i.decision))
  throw Error("Invalid partner mediation reply");
 return applyWorldCommand(pool,{worldId:i.worldId,playerId:i.playerId,
  requestId:i.requestId,expectedRevision:i.expectedRevision,
  commandType:"BACKSTAGE_PARTNER_MEDIATION",requiresOpenWeek:true,
  execute:async tx=>{
   const rows=await tx.query<{
    request_id:string;person_id:string;partner_id:string;
    professional_trust:number;partner_fatigue:number;
    follow_through_week_index:number|null;
    mail_id:string;now:number;
   }>(String.raw`
    WITH owner AS MATERIALIZED(
     SELECT (w.year-1)*52+w.week-1 AS now FROM ppw_worlds w
     JOIN ppw_promotion_controls c ON c.world_id=w.world_id
      AND c.promotion_id=$2 AND c.player_id=$3 AND c.active
     JOIN ppw_memberships m ON m.world_id=c.world_id
      AND m.player_id=c.player_id AND m.status='ACTIVE'
     JOIN ppw_promotions promotion ON promotion.world_id=c.world_id
      AND promotion.promotion_id=c.promotion_id AND promotion.lifecycle='ACTIVE'
     WHERE w.world_id=$1
    )
    SELECT p.request_id,p.person_id,p.partner_id,p.professional_trust,
     p.partner_fatigue,p.follow_through_week_index,o.now,
     'backstage-world:'||md5('partner-mediation:'||p.request_id) AS mail_id
    FROM owner o JOIN LATERAL (${PARTNER_MEDIATION_CANDIDATES_SQL}) p ON true LIMIT 2`,
    [i.worldId,i.promotionId,i.playerId]);
   if(rows.length===0)throw Error("Partner conversation is no longer actionable");
   const verified=rows.find(x=>x.mail_id===i.mailId);
   if(!verified||verified.follow_through_week_index!==null)
    throw Error("Partner conversation is no longer actionable");
   const prior=await tx.query<{mail_id:string}>([
    "SELECT mail_id FROM ppw_backstage_partner_replies",
    "WHERE world_id=$1 AND promotion_id=$2 AND",
    "(mail_id=$3 OR source_request_id=$4) LIMIT 1"
   ].join(" "),[i.worldId,i.promotionId,i.mailId,verified.request_id]);
   if(prior.length)throw Error("This partner has already received an answer");
   const outcome=partnerMediationOutcome(i.decision,
    verified.professional_trust,verified.partner_fatigue);
   await tx.query([
    "INSERT INTO ppw_backstage_partner_replies(world_id,promotion_id,mail_id,",
    "source_request_id,initiating_person_id,partner_person_id,",
    "player_id,decision,outcome,professional_trust_at_reply,responded_week_index)",
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)"
   ].join(" "),[i.worldId,i.promotionId,i.mailId,verified.request_id,
    verified.person_id,verified.partner_id,i.playerId,i.decision,outcome,
    verified.professional_trust,verified.now]);
   return {mailId:i.mailId,decision:i.decision,outcome,
    partnerPersonId:verified.partner_id};
  }});
}
