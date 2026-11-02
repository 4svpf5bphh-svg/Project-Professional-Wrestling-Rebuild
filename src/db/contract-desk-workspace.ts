import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {contractDeskEntry} from "../domain/contract-desk.js";
import {forecastTalentBudget} from "../domain/talent-budget.js";
import type {ContractAvailabilityInput} from "../domain/contract-availability.js";

/** One consistent World-clock snapshot, including pending negotiations.
 * No client-supplied week, and no second unguarded roster request. */
export async function readContractDesk(
 pool:TransactionPool,worldId:string,playerId:string,promotionId:string,
){
 if(!worldId||!playerId||!promotionId)throw new Error("Invalid contract desk identity");
 return withSqlClient(pool,async tx=>{
  const auth=await tx.query<{year:number;week:number;
   revision:string|number;can_edit:boolean;cash:string;
    weekly_media_income:string|null;weekly_sponsor_income:string|null;
    weekly_fixed_overhead:string|null;staff_payroll:string;
    plan_weekly_wage_limit:string|null;
    plan_show_talent_limit:string|null;plan_cash_reserve:string|null}>(`
   SELECT w.year,w.week,w.revision,p.cash::text,
     p.weekly_media_income::text,p.weekly_sponsor_income::text,
     p.weekly_fixed_overhead::text,
     plan.weekly_wage_limit::text AS plan_weekly_wage_limit,
     plan.show_talent_limit::text AS plan_show_talent_limit,
     plan.cash_reserve::text AS plan_cash_reserve,
     COALESCE((SELECT sum(e.weekly_salary) FROM ppw_staff_employments e
      WHERE e.world_id=p.world_id AND e.promotion_id=p.promotion_id AND e.status='ACTIVE'
      AND e.start_week_index<=(w.year-1)*52+w.week-1
      AND e.expires_week_index>=(w.year-1)*52+w.week-1),0)::text AS staff_payroll,
    (w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS can_edit
   FROM ppw_worlds w
   JOIN ppw_promotion_controls c ON c.world_id=w.world_id
   JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
   JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
   LEFT JOIN ppw_promotion_spending_plans plan
    ON plan.world_id=p.world_id AND plan.promotion_id=p.promotion_id
   WHERE w.world_id=$1 AND c.player_id=$2 AND c.promotion_id=$3
     AND c.active AND m.status='ACTIVE' AND p.lifecycle='ACTIVE'`,
   [worldId,playerId,promotionId]);
  if(auth.length!==1)throw new Error("Promotion access denied");
  const currentWeekIndex=(auth[0]!.year-1)*52+auth[0]!.week-1;
  const contracts=await tx.query<{
   contract_id:string;person_id:string;name:string;
   family:ContractAvailabilityInput["family"];status:ContractAvailabilityInput["status"];
   remaining_dates:number|null;expires_week_index:number;start_week_index:number;
   date_entitlement:number|null;weekly_guarantee:string;appearance_fee:string;signing_bonus:string;
   creative_control:string;role_expectation:string;
   backstage_contract_request_id:string|null;renewal_secured:boolean;
  }>(`
   SELECT c.contract_id,c.person_id,p.name,c.family,c.status,
     c.remaining_dates,c.expires_week_index,c.start_week_index,c.date_entitlement,c.weekly_guarantee,
     c.appearance_fee,c.signing_bonus,c.creative_control,c.role_expectation,
     EXISTS(SELECT 1 FROM ppw_contract_offers accepted
      WHERE accepted.world_id=c.world_id AND accepted.promotion_id=c.promotion_id
       AND accepted.person_id=c.person_id
       AND accepted.source_contract_id=c.contract_id
       AND accepted.status='ACCEPTED'
       AND (accepted.terms->>'startWeekIndex')::integer
           BETWEEN $3 AND c.expires_week_index+2) AS renewal_secured,
     (SELECT request_id FROM ppw_backstage_requests r
      WHERE r.world_id=c.world_id AND r.promotion_id=c.promotion_id
        AND r.person_id=c.person_id AND r.kind='CONTRACT'
        AND r.decision='EXPLORE_RENEWAL' AND r.status='ANSWERED'
        AND r.responded_week_index BETWEEN greatest(0,$3-12) AND $3
        AND r.created_week_index>=greatest(0,$3-26)
      ORDER BY r.created_week_index DESC,r.request_id DESC LIMIT 1)
       AS backstage_contract_request_id
   FROM ppw_contracts c JOIN ppw_people p
     ON p.world_id=c.world_id AND p.person_id=c.person_id
   WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.status='SIGNED'
   ORDER BY c.expires_week_index,p.name,c.contract_id LIMIT 200`,
   [worldId,promotionId,currentWeekIndex]);
  const requests=await tx.query<{
   request_id:string;contract_id:string;person_id:string;
   additional_dates:number;additional_payment:string|number;
   status:string;created_week_index:number;
  }>(`
   SELECT request_id,contract_id,person_id,additional_dates,additional_payment,status,created_week_index
   FROM ppw_contract_date_requests
   WHERE world_id=$1 AND promotion_id=$2 AND status='PENDING'
   ORDER BY created_week_index,request_id LIMIT 200`,
   [worldId,promotionId]);
  type RenewalRow={proposal_id:string;contract_id:string;person_id:string;
   status:string;created_week_index:number;proposed_terms:unknown};
  type DateDecisionRow={event_id:string|number;year:number;week:number;
   contract_id:string;person_id:string;name:string;
   status:"ACCEPTED"|"REJECTED";additional_dates:number;
   additional_payment:string|number};
  // Both short histories share the fourth bounded read: no sixth Neon query.
  const [deskHistory]=await tx.query<{renewals:RenewalRow[];
   date_decisions:DateDecisionRow[]}>(`
   SELECT coalesce((SELECT jsonb_agg(to_jsonb(r)
    ORDER BY r.created_week_index,r.proposal_id)
    FROM (SELECT proposal_id,contract_id,person_id,status,
      created_week_index,proposed_terms
     FROM ppw_contract_renewal_proposals
     WHERE world_id=$1 AND promotion_id=$2 AND status IN ('PENDING','ACCEPTED')
     ORDER BY created_week_index,proposal_id LIMIT 200) r),
    '[]'::jsonb) AS renewals,
    coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.event_id DESC)
      FROM (SELECT e.event_id,e.year,e.week,
    e.payload->>'contractId' AS contract_id,
    e.payload->>'personId' AS person_id,person.name,
    e.payload->>'status' AS status,
    (e.payload->>'additionalDates')::integer AS additional_dates,
    (e.payload->>'additionalPayment')::bigint AS additional_payment
   FROM ppw_ledger_events e
   JOIN ppw_people person ON person.world_id=e.world_id
    AND person.person_id=e.payload->>'personId'
   WHERE e.world_id=$1 AND e.event_type='CONTRACT_EXTRA_DATES_DECIDED'
    AND e.payload->>'promotionId'=$2
    AND (e.year-1)*52+e.week-1 BETWEEN greatest(0,$3-25) AND $3
   ORDER BY e.event_id DESC LIMIT 20) d),
      '[]'::jsonb) AS date_decisions`,
    [worldId,promotionId,currentWeekIndex]);
  const renewalRecords=deskHistory?.renewals??[];
   const renewals=renewalRecords.filter(r=>r.status==='PENDING');
   const arrangedIds=new Set(renewalRecords.filter(r=>r.status==='ACCEPTED').map(r=>r.contract_id));
  const dateDecisions=deskHistory?.date_decisions??[];
  // The very same fifth SQL read now includes recent decisions, allowing Home's
  // contract news to lead into a meaningful detail view without extra reads.
  const offers=await tx.query<{offer_id:string;person_id:string;person_name:string;
   source_contract_id:string|null;terms:unknown;submitted_week_index:number;
   status:"PENDING"|"ACCEPTED"|"REJECTED";rejection_reason:string|null}>(`
   SELECT o.offer_id,o.person_id,p.name AS person_name,o.source_contract_id,
    o.terms,o.submitted_week_index,o.status,o.rejection_reason
   FROM ppw_contract_offers o JOIN ppw_people p
    ON p.world_id=o.world_id AND p.person_id=o.person_id
   WHERE o.world_id=$1 AND o.promotion_id=$2
    AND (o.status='PENDING' OR
     (o.status IN ('ACCEPTED','REJECTED') AND o.submitted_week_index
       BETWEEN greatest(0,$3::integer-3) AND $3::integer))
   ORDER BY CASE WHEN o.status='PENDING' THEN 0 ELSE 1 END,
    o.submitted_week_index DESC,o.offer_id DESC LIMIT 200`,
   [worldId,promotionId,currentWeekIndex]);
  const pendingOffers=offers.filter(o=>o.status==="PENDING");
  const decidedOffers=offers.filter(o=>o.status!=="PENDING").slice(0,8);
  const byContract=new Map(contracts.map(c=>[c.contract_id,c]));
  const roster=contracts.map(c=>{
   const entry=contractDeskEntry({
    contractId:c.contract_id,personId:c.person_id,name:c.name,
    family:c.family,status:c.status,remainingDates:c.remaining_dates,
    expiresWeekIndex:c.expires_week_index,startWeekIndex:c.start_week_index,currentWeekIndex});
   return c.renewal_secured?{...entry,expiringSoon:false,
    needsAttention:entry.reason==="NO_DATES",renewalEligible:false}:entry;
  });
  const talentBudget=forecastTalentBudget(contracts.map(c=>({
    personId:c.person_id,contractId:c.contract_id,status:c.status,family:c.family,
    startWeekIndex:c.start_week_index,expiresWeekIndex:c.expires_week_index,
    remainingDates:c.remaining_dates,weeklyGuarantee:Number(c.weekly_guarantee),
    appearanceFee:Number(c.appearance_fee)
   })),currentWeekIndex,{
    cash:Number(auth[0]!.cash),staffPayroll:Number(auth[0]!.staff_payroll),
    weeklyMediaIncome:auth[0]!.weekly_media_income===null?null:Number(auth[0]!.weekly_media_income),
    weeklySponsorIncome:auth[0]!.weekly_sponsor_income===null?null:Number(auth[0]!.weekly_sponsor_income),
    weeklyFixedOverhead:auth[0]!.weekly_fixed_overhead===null?null:Number(auth[0]!.weekly_fixed_overhead)
   });
   const pendingIds=new Set(requests.map(q=>q.contract_id));
  const renewalIds=new Set(renewals.map(q=>q.contract_id));
  return {
   currentWeekIndex,year:auth[0]!.year,week:auth[0]!.week,
    talentBudget,
    spendingPlan:auth[0]!.plan_weekly_wage_limit===null?null:{
     weeklyWageLimit:Number(auth[0]!.plan_weekly_wage_limit),
     showTalentLimit:Number(auth[0]!.plan_show_talent_limit),
     cashReserve:Number(auth[0]!.plan_cash_reserve)},
   worldRevision:Number(auth[0]!.revision),canEdit:auth[0]!.can_edit,
   roster:roster.map(c=>{const cost=byContract.get(c.contractId)!;return {...c,
    dateEntitlement:cost.date_entitlement,weeklyGuarantee:Number(cost.weekly_guarantee),
    appearanceFee:Number(cost.appearance_fee),signingBonus:Number(cost.signing_bonus),
    roleExpectation:cost.role_expectation,creativeControl:cost.creative_control,
    pendingNegotiation:pendingIds.has(c.contractId),pendingRenewal:renewalIds.has(c.contractId),
     renewalArranged:arrangedIds.has(c.contractId),
    backstageContractConversationId:cost.backstage_contract_request_id};}),
   requests:requests.map(q=>({...q,additional_payment:Number(q.additional_payment)})),
   renewals,offers:pendingOffers,
   dateDecisions:dateDecisions.map(d=>({id:"contract-dates:"+d.event_id,
    contractId:d.contract_id,personId:d.person_id,name:d.name,status:d.status,
    additionalDates:d.additional_dates,additionalPayment:Number(d.additional_payment),
    year:d.year,week:d.week})),
   resolvedOffers:decidedOffers.map(o=>({offerId:o.offer_id,
    personId:o.person_id,name:o.person_name,status:o.status,
    sourceContractId:o.source_contract_id,
    submittedWeekIndex:o.submitted_week_index,
    // Never surface database rejection codes as wrestler dialogue.
    reason:o.rejection_reason==="existing exclusive contract blocks outside work"||
     o.rejection_reason==="exclusive offer overlaps another signed contract"?
      "Another exclusive commitment prevents the deal.":
     o.rejection_reason==="service capacity exceeded"?
      "Their current schedule cannot accommodate the dates.":
      null})),
   summary:{
    signed:roster.length,expiringSoon:roster.filter(c=>c.expiringSoon).length,
    noDates:roster.filter(c=>c.reason==="NO_DATES").length,
    backstageContractDiscussions:contracts.filter(c=>c.backstage_contract_request_id!==null).length,
    pendingNegotiations:requests.length,
    pendingRenewals:renewals.length,pendingOffers:pendingOffers.length,
    weeklyGuarantees:talentBudget.currentGuarantees,
   },
  };
 });
}
