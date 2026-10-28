/** AI-only roster continuity at contract expiry; uses the same SQL
 * round-trip as the previous blanket expiration and leaves human decisions
 * and accepted proposals unchanged. One ledger summary per AI company.
 */
import type {SqlRows} from "./world-operations.js";
export async function expireAndRetainAiContracts(
 tx:SqlRows,worldId:string,year:number,week:number,
){
 const index=(year-1)*52+week-1;
 if(!worldId||!Number.isSafeInteger(index)||index<0||week<1||week>52)
  throw new Error("Invalid AI contract continuity week");
 return tx.query<{promotion_id:string;retained:number}>(`
 WITH candidates AS (
  SELECT c.contract_id,c.person_id,c.promotion_id,c.family,
   p.management_mode,p.lifecycle,p.financial_distress,
   t.booking_division,t.status AS talent_status,
   EXISTS(SELECT 1 FROM ppw_promotion_controls pc
    WHERE pc.world_id=c.world_id AND pc.promotion_id=c.promotion_id
     AND pc.active) AS owner_claimed,
   ROW_NUMBER() OVER(
    PARTITION BY c.promotion_id,t.booking_division
    ORDER BY (COALESCE(t.popularity,50)*4+
     COALESCE(t.match_craft,50)*3+COALESCE(t.presentation,50)*3-
     LEAST(120,COALESCE(c.weekly_guarantee,0)::numeric/300)
    ) DESC,c.person_id,c.contract_id
   ) AS division_rank
  FROM ppw_contracts c
  JOIN ppw_promotions p ON p.world_id=c.world_id
   AND p.promotion_id=c.promotion_id
  LEFT JOIN ppw_people t ON t.world_id=c.world_id AND t.person_id=c.person_id
  WHERE c.world_id=$1 AND c.status='SIGNED' AND c.expires_week_index=$2
 ), decisions AS (
  SELECT e.contract_id,
   (e.management_mode='AI' AND e.lifecycle='ACTIVE' AND
    NOT e.owner_claimed AND e.family IN ('EXCLUSIVE','LIMITED_NON_EXCLUSIVE')
    AND e.talent_status<>'RETIRED' AND e.booking_division IN ('MEN','WOMEN')
    AND e.division_rank<=CASE WHEN e.booking_division='WOMEN'
      THEN CASE WHEN e.financial_distress IN ('CRISIS','DISTRESSED') THEN 6 ELSE 8 END
      ELSE CASE WHEN e.financial_distress IN ('CRISIS','DISTRESSED') THEN 12 ELSE 16 END
     END) AS retain
  FROM candidates e
 ), updated AS (
  UPDATE ppw_contracts c SET
   status=CASE WHEN d.retain THEN 'SIGNED' ELSE 'EXPIRED' END,
   start_week_index=CASE WHEN d.retain THEN $2+1 ELSE c.start_week_index END,
   expires_week_index=CASE WHEN d.retain THEN $2+26 ELSE c.expires_week_index END,
   remaining_dates=CASE WHEN d.retain AND c.family<>'EXCLUSIVE'
    THEN LEAST(104,GREATEST(5,COALESCE(c.date_entitlement,c.remaining_dates,8)))
    ELSE c.remaining_dates END,
   date_entitlement=CASE WHEN d.retain AND c.family<>'EXCLUSIVE'
    THEN LEAST(104,GREATEST(5,COALESCE(c.date_entitlement,c.remaining_dates,8)))
    ELSE c.date_entitlement END,
   revision=c.revision+1
  FROM decisions d
  WHERE c.world_id=$1 AND c.contract_id=d.contract_id
   AND c.status='SIGNED' AND c.expires_week_index=$2
   AND NOT EXISTS(SELECT 1 FROM ppw_contract_renewal_proposals r
    WHERE r.world_id=c.world_id AND r.contract_id=c.contract_id
     AND r.status='ACCEPTED')
  RETURNING c.promotion_id,c.person_id,c.status,c.expires_week_index
 )
 INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
 SELECT $1,$3,$4,'AI_CONTRACTS_RETAINED',
  jsonb_build_object('promotionId',promotion_id,'count',count(*)::integer,
   'personIds',jsonb_agg(person_id ORDER BY person_id),'termWeeks',26)
 FROM updated
 WHERE status='SIGNED' AND expires_week_index=$2+26
 GROUP BY promotion_id
 RETURNING payload->>'promotionId' AS promotion_id,
  (payload->>'count')::integer AS retained
 `,[worldId,index,year,week]);
}

