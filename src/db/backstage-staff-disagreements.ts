/** Contracted fatigued talent in a stale programme gives Medical and Creative
 * two genuine, disagreeing priorities. No synthetic staff, booking or morale
 * manipulation when a page is opened.
 */
import type {TransactionPool} from "./transaction.js";
import type {SqlRows} from "./world-operations.js";
import {applyWorldCommand} from "./world-commands.js";
export type DisagreementDecision="PRIORITISE_HEALTH"|"REFRESH_PROGRAMME"|"DEFER";
export type DisagreementStatus="PENDING"|"ACKNOWLEDGED"|"KEPT"|"BROKEN"|"EXCUSED";
export interface DisagreementInput{
 worldId:string;promotionId:string;playerId:string;mailId:string;
 decision:DisagreementDecision;requestId:string;expectedRevision:number;
}
export const STAFF_DISAGREEMENT_LATERAL_SQL=String.raw`
 SELECT med.employment_id AS medical_id,med.staff_id AS medical_staff_id,
 creative.employment_id AS creative_id,creative.staff_id AS creative_staff_id,
 programme.programme_id,person.person_id,person.name,person.fatigue,
 programme.repetition
 FROM ppw_staff_employments med
 JOIN ppw_staff_employments creative ON creative.world_id=med.world_id
  AND creative.promotion_id=med.promotion_id
  AND creative.role='CREATIVE' AND creative.status='ACTIVE'
  AND creative.start_week_index<=o.now AND creative.expires_week_index>=o.now
 JOIN ppw_programmes programme ON programme.world_id=med.world_id
  AND programme.promotion_id=med.promotion_id
  AND programme.status='ACTIVE' AND programme.repetition>=3
 JOIN ppw_programme_side_refs side ON side.world_id=programme.world_id
  AND side.promotion_id=programme.promotion_id AND side.programme_id=programme.programme_id
  AND side.ref_kind='PERSON'
 JOIN ppw_people person ON person.world_id=programme.world_id
  AND person.person_id=side.ref_id AND person.status IN ('ACTIVE','INJURED')
  AND person.fatigue>=70
 WHERE med.world_id=$1 AND med.promotion_id=$2
  AND med.role='MEDICAL' AND med.status='ACTIVE'
  AND med.start_week_index<=o.now AND med.expires_week_index>=o.now
  AND EXISTS(
   SELECT 1 FROM ppw_contracts deal
   WHERE deal.world_id=person.world_id
    AND deal.person_id=person.person_id
    AND deal.promotion_id=med.promotion_id AND deal.status='SIGNED'
    AND deal.start_week_index<=o.now AND deal.expires_week_index>=o.now)
  AND NOT EXISTS(
   SELECT 1 FROM ppw_backstage_staff_disagreements answered
   WHERE answered.world_id=med.world_id
    AND answered.promotion_id=med.promotion_id
    AND answered.programme_id=programme.programme_id
    AND answered.person_id=person.person_id
    AND answered.responded_week_index BETWEEN greatest(0,o.now-12) AND o.now)
 ORDER BY person.fatigue DESC,programme.repetition DESC,
 programme.programme_id,person.person_id
 LIMIT 1`;
export async function respondToStaffDisagreement(pool:TransactionPool,i:DisagreementInput){
 if(![i.worldId,i.promotionId,i.playerId,i.requestId].every(
  v=>typeof v==="string"&&v.length>0&&v.length<=200)||
  !/^backstage-world:[a-f0-9]{32}$/.test(i.mailId)||
  !["PRIORITISE_HEALTH","REFRESH_PROGRAMME","DEFER"].includes(i.decision))
  throw Error("Invalid staff disagreement");
 return applyWorldCommand(pool,{worldId:i.worldId,playerId:i.playerId,
  requestId:i.requestId,expectedRevision:i.expectedRevision,
  commandType:"BACKSTAGE_STAFF_DISAGREEMENT",requiresOpenWeek:true,
  execute:async tx=>{
   const rows=await tx.query<{
    medical_id:string;creative_id:string;programme_id:string;
    person_id:string;now:number;mail_id:string
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
    SELECT issue.medical_id,issue.creative_id,issue.programme_id,
     issue.person_id,o.now,
     'backstage-world:'||md5('staff-dispute:'||issue.medical_id||':'||
      issue.creative_id||':'||issue.programme_id||':'||issue.person_id||':'||
      floor(o.now/4)::integer) AS mail_id
    FROM owner o JOIN LATERAL (${STAFF_DISAGREEMENT_LATERAL_SQL}) issue ON true LIMIT 2`,
    [i.worldId,i.promotionId,i.playerId]);
   if(rows.length!==1||rows[0]!.mail_id!==i.mailId)
    throw Error("This staff disagreement is no longer actionable");
   const r=rows[0]!,status:DisagreementStatus=i.decision==="DEFER"?"ACKNOWLEDGED":"PENDING";
   await tx.query([
    "INSERT INTO ppw_backstage_staff_disagreements",
    "(world_id,promotion_id,mail_id,medical_employment_id,",
    "creative_employment_id,programme_id,person_id,player_id,decision,",
    "status,responded_week_index,due_week_index,settled_week_index)",
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)"
   ].join(" "),[i.worldId,i.promotionId,i.mailId,r.medical_id,r.creative_id,
    r.programme_id,r.person_id,i.playerId,i.decision,status,r.now,
    r.now+3,status==="ACKNOWLEDGED"?r.now:null]);
   return {mailId:i.mailId,decision:i.decision,status,dueWeekIndex:r.now+3};
  }});
}
/** One atomic weekly settlement, based on genuine fatigue / programme state.
 * Only the supported department's employee morale can change, once.
 */
export async function settleStaffDisagreements(tx:SqlRows,worldId:string,weekIndex:number){
 if(!worldId||worldId.length>200||!Number.isSafeInteger(weekIndex)||weekIndex<0)
  throw Error("Invalid staff disagreement settlement");
 const rows=await tx.query<{settled:number}>(String.raw`
 WITH outcomes AS(
  UPDATE ppw_backstage_staff_disagreements r SET
   status=CASE
    WHEN medical.status<>'ACTIVE' OR creative.status<>'ACTIVE'
     OR medical.expires_week_index<$2 OR creative.expires_week_index<$2
     OR NOT EXISTS(
      SELECT 1 FROM ppw_contracts c
      WHERE c.world_id=r.world_id AND c.promotion_id=r.promotion_id
       AND c.person_id=r.person_id AND c.status='SIGNED'
       AND c.start_week_index<=$2 AND c.expires_week_index>=$2)
     THEN 'EXCUSED'
    WHEN r.decision='PRIORITISE_HEALTH' AND person.fatigue<70 THEN 'KEPT'
    WHEN r.decision='REFRESH_PROGRAMME'
     AND (programme.status<>'ACTIVE' OR programme.repetition<3) THEN 'KEPT'
    ELSE 'BROKEN' END,
   settled_week_index=$2
  FROM ppw_staff_employments medical,ppw_staff_employments creative,
    ppw_people person,ppw_programmes programme
  WHERE r.world_id=$1 AND r.status='PENDING'
   AND r.responded_week_index<$2
   AND medical.world_id=r.world_id
   AND medical.employment_id=r.medical_employment_id
   AND creative.world_id=r.world_id
   AND creative.employment_id=r.creative_employment_id
   AND person.world_id=r.world_id AND person.person_id=r.person_id
   AND programme.world_id=r.world_id AND programme.promotion_id=r.promotion_id
   AND programme.programme_id=r.programme_id
   AND (r.due_week_index<=$2
    OR medical.status<>'ACTIVE' OR creative.status<>'ACTIVE'
    OR medical.expires_week_index<$2 OR creative.expires_week_index<$2
    OR NOT EXISTS(
     SELECT 1 FROM ppw_contracts c
     WHERE c.world_id=r.world_id AND c.promotion_id=r.promotion_id
      AND c.person_id=r.person_id AND c.status='SIGNED'
      AND c.start_week_index<=$2 AND c.expires_week_index>=$2)
    OR (r.decision='PRIORITISE_HEALTH' AND person.fatigue<70)
    OR (r.decision='REFRESH_PROGRAMME'
     AND (programme.status<>'ACTIVE' OR programme.repetition<3)))
  RETURNING r.medical_employment_id,r.creative_employment_id,r.decision,r.status
 ), impacts AS(
  /* Multiple genuine disputes can resolve in the same World week.
   * PostgreSQL UPDATE ... FROM against duplicate employee rows picks ONE
   * arbitrary result, so aggregate every verified gain/loss first. */
  SELECT CASE WHEN decision='PRIORITISE_HEALTH'
   THEN medical_employment_id ELSE creative_employment_id END AS employment_id,
   sum(CASE WHEN status='KEPT' THEN 2
    WHEN status='BROKEN' THEN -2 ELSE 0 END)::integer AS delta
  FROM outcomes GROUP BY 1
 ), morale AS(
  UPDATE ppw_staff_employments staff SET
   morale=greatest(0,least(100,staff.morale+impacts.delta))
  FROM impacts WHERE staff.world_id=$1 AND staff.status='ACTIVE'
   AND staff.employment_id=impacts.employment_id AND impacts.delta<>0
  RETURNING staff.employment_id
 )
 SELECT count(*)::integer AS settled FROM outcomes`,[worldId,weekIndex]);
 return {settled:rows[0]?.settled??0};
}
