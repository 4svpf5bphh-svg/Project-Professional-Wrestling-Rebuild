/** AI retention uses the same flexible calendar rules as human offers.
 * Existing signed terms remain intact until expiry; candidate ranking and
 * autonomous roster targets are preserved. No per-wrestler round trips. */
import type {SqlRows} from "./world-operations.js";
import {maxPurchasedDates,type ExistingCommitment,type Stage} from "../domain/contract-economics.js";
type Candidate={contract_id:string;person_id:string;family:ExistingCommitment["family"];
 date_entitlement:number|null;remaining_dates:number|null;career_stage:Stage|null;
 stamina:number|null;fatigue:number|null;weekly_service_capacity:number|null;commitments:ExistingCommitment[]|null};
export async function expireAndRetainAiContracts(tx:SqlRows,worldId:string,year:number,week:number){
 const index=(year-1)*52+week-1;
 if(!worldId||!Number.isSafeInteger(index)||index<0||week<1||week>52)
  throw Error("Invalid AI contract continuity week");
 const candidates=await tx.query<Candidate>(`
 WITH scored AS (
  SELECT c.contract_id,c.person_id,c.promotion_id,c.family,c.date_entitlement,c.remaining_dates,
   t.career_stage,t.stamina,t.fatigue,t.weekly_service_capacity,
   p.management_mode,p.lifecycle,p.financial_distress,
   t.booking_division,t.status AS talent_status,
   EXISTS(SELECT 1 FROM ppw_promotion_controls pc
    WHERE pc.world_id=c.world_id AND pc.promotion_id=c.promotion_id
     AND pc.active) AS owner_claimed,
   affiliate.promotion_id AS affiliate_id,
   (COALESCE(t.popularity,50)*4+COALESCE(t.match_craft,50)*3+
    COALESCE(t.presentation,50)*3-
    LEAST(120,COALESCE(c.weekly_guarantee,0)::numeric/300)) AS retention_score
  FROM ppw_contracts c
  JOIN ppw_promotions p ON p.world_id=c.world_id
   AND p.promotion_id=c.promotion_id
  LEFT JOIN ppw_people t ON t.world_id=c.world_id AND t.person_id=c.person_id
  LEFT JOIN LATERAL (
   SELECT a.promotion_id FROM ppw_wrestler_promotion_affiliations a
   JOIN ppw_promotions child USING(world_id,promotion_id)
   WHERE a.world_id=c.world_id AND a.person_id=c.person_id
    AND a.basis='PARENT_COMPANY' AND a.role='PRIMARY'
    AND child.lifecycle='ACTIVE' AND child.parent_promotion_id=c.promotion_id
    AND p.management_mode='AI' AND t.status='ACTIVE'
    AND c.family IN ('EXCLUSIVE','LIMITED_NON_EXCLUSIVE')
   ORDER BY a.promotion_id LIMIT 1
  ) affiliate ON true
  WHERE c.world_id=$1 AND c.status='SIGNED' AND c.expires_week_index=$2
 ), distinct_affiliates AS (
  SELECT DISTINCT ON (promotion_id,affiliate_id,booking_division,person_id)
   promotion_id,affiliate_id,booking_division,person_id,contract_id,retention_score
  FROM scored WHERE affiliate_id IS NOT NULL
  ORDER BY promotion_id,affiliate_id,booking_division,person_id,retention_score DESC,contract_id
 ), affiliate_ranked AS (
  SELECT contract_id,ROW_NUMBER() OVER (
   PARTITION BY promotion_id,affiliate_id,booking_division
   ORDER BY retention_score DESC,person_id,contract_id) AS affiliate_rank
  FROM distinct_affiliates
 ), candidates AS (
  -- A same-division pair can keep an already affiliated show bookable.
  -- Reserve those places within the parent's existing renewal cap.
  SELECT scored.*,ROW_NUMBER() OVER (
   PARTITION BY promotion_id,booking_division
   ORDER BY COALESCE(affiliate_rank<=2,false) DESC,
    retention_score DESC,person_id,contract_id) AS division_rank
  FROM scored LEFT JOIN affiliate_ranked USING(contract_id)
 ), decisions AS (
  SELECT e.*,
   (e.management_mode='AI' AND e.lifecycle='ACTIVE' AND
    NOT e.owner_claimed AND e.family IN ('EXCLUSIVE','LIMITED_NON_EXCLUSIVE')
    AND e.talent_status<>'RETIRED' AND e.booking_division IN ('MEN','WOMEN')
    AND e.division_rank<=CASE WHEN e.booking_division='WOMEN'
      THEN CASE WHEN e.financial_distress IN ('CRISIS','DISTRESSED') THEN 6 ELSE 8 END
      ELSE CASE WHEN e.financial_distress IN ('CRISIS','DISTRESSED') THEN 12 ELSE 16 END
     END) AS retain
  FROM candidates e

 )
 SELECT d.contract_id,d.person_id,d.family,d.date_entitlement,d.remaining_dates,d.career_stage,d.stamina,d.fatigue,d.weekly_service_capacity,
  (SELECT jsonb_agg(jsonb_build_object('contractId',c.contract_id,'family',c.family,'status',c.status,
   'remainingDates',c.remaining_dates,'startWeekIndex',c.start_week_index,'expiresWeekIndex',c.expires_week_index))
   FROM ppw_signed_service_windows c WHERE c.world_id=$1 AND c.person_id=d.person_id AND c.status='SIGNED'
    AND c.expires_week_index>$2) AS commitments
 FROM decisions d WHERE d.retain
 AND NOT EXISTS(SELECT 1 FROM ppw_contract_renewal_proposals r WHERE r.world_id=$1 AND r.contract_id=d.contract_id AND r.status='ACCEPTED')
 ORDER BY d.person_id,d.division_rank,d.contract_id
 `,[worldId,index]);
 const allocations=new Map<string,ExistingCommitment[]>();
 const retained:{contract_id:string;dates:number|null}[]=[];
 for(const candidate of candidates){
  const commitments=allocations.get(candidate.person_id)??[...(candidate.commitments??[])];
  allocations.set(candidate.person_id,commitments);
  const profile={careerStage:candidate.career_stage??"PRIME",stamina:candidate.stamina??50,fatigue:candidate.fatigue??0,weeklyServiceCapacity:candidate.weekly_service_capacity};
  const overlaps=commitments.filter(c=>c.startWeekIndex<=index+26&&c.expiresWeekIndex>=index+1);
  if(candidate.family==="EXCLUSIVE"&&overlaps.length)continue;
  const dates=candidate.family==="EXCLUSIVE"?null:Math.min(
   Math.max(32,candidate.date_entitlement??candidate.remaining_dates??8),
   maxPurchasedDates(profile,index+1,26,commitments,index+1));
  if(dates===0)continue;
  retained.push({contract_id:candidate.contract_id,dates});
  commitments.push({contractId:candidate.contract_id,family:candidate.family,status:"SIGNED",
   remainingDates:dates,startWeekIndex:index+1,expiresWeekIndex:index+26});
 }
 return tx.query<{promotion_id:string;retained:number}>(`
 WITH retained AS (
  SELECT * FROM jsonb_to_recordset($5::jsonb) AS r(contract_id text,dates integer)
 ), updated AS (
  UPDATE ppw_contracts c SET
   status=CASE WHEN r.contract_id IS NOT NULL THEN 'SIGNED' ELSE 'EXPIRED' END,
   start_week_index=CASE WHEN r.contract_id IS NOT NULL THEN $2+1 ELSE c.start_week_index END,
   expires_week_index=CASE WHEN r.contract_id IS NOT NULL THEN $2+26 ELSE c.expires_week_index END,
   remaining_dates=CASE WHEN r.contract_id IS NOT NULL AND c.family<>'EXCLUSIVE' THEN r.dates ELSE c.remaining_dates END,
   date_entitlement=CASE WHEN r.contract_id IS NOT NULL AND c.family<>'EXCLUSIVE' THEN r.dates ELSE c.date_entitlement END,
   revision=c.revision+1
  FROM (SELECT expiring.contract_id,keep.contract_id AS retained_id,keep.dates
   FROM ppw_contracts expiring LEFT JOIN retained keep ON keep.contract_id=expiring.contract_id
   WHERE expiring.world_id=$1 AND expiring.status='SIGNED' AND expiring.expires_week_index=$2) d
  LEFT JOIN retained r ON r.contract_id=d.retained_id
  WHERE c.world_id=$1 AND c.contract_id=d.contract_id
   AND c.status='SIGNED' AND c.expires_week_index=$2
   AND NOT EXISTS(SELECT 1 FROM ppw_contract_renewal_proposals p WHERE p.world_id=c.world_id AND p.contract_id=c.contract_id AND p.status='ACCEPTED')
  RETURNING c.promotion_id,c.person_id,c.status,c.expires_week_index
 )
 INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
 SELECT $1,$3,$4,'AI_CONTRACTS_RETAINED',
  jsonb_build_object('promotionId',promotion_id,'count',count(*)::integer,
   'personIds',jsonb_agg(person_id ORDER BY person_id),'termWeeks',26)
 FROM updated WHERE status='SIGNED' AND expires_week_index=$2+26 GROUP BY promotion_id
 RETURNING payload->>'promotionId' AS promotion_id,(payload->>'count')::integer AS retained
 `,[worldId,index,year,week,JSON.stringify(retained)]);
}
