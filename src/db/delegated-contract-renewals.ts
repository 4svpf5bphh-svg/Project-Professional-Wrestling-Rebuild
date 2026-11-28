import type {SqlRows} from "./world-operations.js";
import {agreedNextTermSql} from "./contract-renewal-status-sql.js";
import {worldStaff} from "../domain/world-staff.js";
import {delegatedRenewalTerms,type RenewalStrategy} from "../domain/delegated-renewal.js";
import {marketWeeklyValue,canAcceptTerms,type PersonEconomics,
 type ExistingCommitment,type OfferTerms} from "../domain/contract-economics.js";
import type {RenewalContract} from "../domain/renewal-terms.js";

type Task={
 request_id:string;promotion_id:string;person_id:string;contract_id:string;strategy:RenewalStrategy;
 max_weekly_guarantee:string;max_appearance_fee:string;staff_id:string|null;seed:string;
 eligible:boolean;cash:string;cash_reserve:string|null;weekly_wage_limit:string|null;
 show_talent_limit:string|null;committed_wages:string;
 contract:RenewalContract;person:PersonEconomics;trust:number;commitments:ExistingCommitment[];
};

/** World Lock stages explicit instructions in the existing offer desk. The
 * wrestler resolver considers these alongside competing offers. */
export async function prepareDelegatedContractRenewals(tx:SqlRows,worldId:string,week:number){
 const tasks=await tx.query<Task>(`
  SELECT q.request_id,q.promotion_id,c.person_id,q.contract_id,q.strategy,
   q.max_weekly_guarantee::text,q.max_appearance_fee::text,manager.staff_id,w.seed::text,
   (owner.player_id IS NOT NULL AND membership.status='ACTIVE' AND company.lifecycle='ACTIVE'
    AND c.status='SIGNED' AND c.family<>'ONE_OFF' AND person.status IN ('ACTIVE','INJURED')
    AND c.start_week_index=q.source_start_week_index
    AND $2 BETWEEN c.start_week_index AND c.expires_week_index
    AND NOT EXISTS (${agreedNextTermSql("c")})
    AND NOT EXISTS(SELECT 1 FROM ppw_contract_renewal_proposals r WHERE r.world_id=c.world_id
     AND r.contract_id=c.contract_id AND r.status='PENDING')
    AND NOT EXISTS(SELECT 1 FROM ppw_contract_offers o WHERE o.world_id=c.world_id
     AND o.promotion_id=c.promotion_id AND o.person_id=c.person_id AND o.status='PENDING')) AS eligible,
   company.cash::text,plan.cash_reserve::text,plan.weekly_wage_limit::text,plan.show_talent_limit::text,
   coalesce(wages.total,0)::text AS committed_wages,
   jsonb_build_object('family',c.family,'status',c.status,'startWeekIndex',c.start_week_index,
    'expiresWeekIndex',c.expires_week_index,'dateEntitlement',c.date_entitlement,'weeklyGuarantee',c.weekly_guarantee,
    'appearanceFee',c.appearance_fee,'roleExpectation',c.role_expectation,'creativeControl',c.creative_control) AS contract,
   jsonb_build_object('careerStage',person.career_stage,'recognition',person.recognition,'popularity',person.popularity,
    'inRingQuality',person.in_ring_quality,'matchCraft',person.match_craft,'presentation',person.presentation,
    'stamina',person.stamina,'fatigue',person.fatigue,'weeklyServiceCapacity',person.weekly_service_capacity,
    'morale',person.morale,'priorities',person.contract_priorities) AS person,
   coalesce((trust.trust+annual.trust)/2.0,trust.trust,annual.trust,50)::double precision AS trust,
   coalesce(services.commitments,'[]'::jsonb) AS commitments
  FROM ppw_delegated_contract_renewals q
  JOIN ppw_worlds w ON w.world_id=q.world_id
  JOIN ppw_promotions company ON company.world_id=q.world_id AND company.promotion_id=q.promotion_id
  JOIN ppw_contracts c ON c.world_id=q.world_id AND c.contract_id=q.contract_id AND c.promotion_id=q.promotion_id
  JOIN ppw_people person ON person.world_id=c.world_id AND person.person_id=c.person_id
  LEFT JOIN ppw_promotion_controls owner ON owner.world_id=q.world_id AND owner.promotion_id=q.promotion_id
   AND owner.player_id=q.owner_player_id AND owner.active
  LEFT JOIN ppw_memberships membership ON membership.world_id=q.world_id AND membership.player_id=q.owner_player_id
  LEFT JOIN ppw_promotion_spending_plans plan ON plan.world_id=q.world_id AND plan.promotion_id=q.promotion_id
  LEFT JOIN ppw_backstage_promotion_trust trust ON trust.world_id=c.world_id AND trust.promotion_id=c.promotion_id
   AND trust.person_id=c.person_id
  LEFT JOIN ppw_promotion_talent_trust annual ON annual.world_id=c.world_id AND annual.promotion_id=c.promotion_id
   AND annual.person_id=c.person_id
  LEFT JOIN LATERAL (
   SELECT e.staff_id FROM ppw_staff_employments e WHERE e.world_id=q.world_id AND e.promotion_id=q.promotion_id
    AND e.role='TALENT_MANAGER' AND e.status='ACTIVE' AND $2 BETWEEN e.start_week_index AND e.expires_week_index
   ORDER BY e.employment_id LIMIT 1
  ) manager ON true
  LEFT JOIN LATERAL (
   SELECT jsonb_agg(jsonb_build_object('contractId',s.contract_id,'family',s.family,'status',s.status,
    'remainingDates',s.remaining_dates,'startWeekIndex',s.start_week_index,'expiresWeekIndex',s.expires_week_index)) commitments
   FROM ppw_signed_service_windows s WHERE s.world_id=c.world_id AND s.person_id=c.person_id
    AND s.status='SIGNED' AND s.expires_week_index>c.expires_week_index
  ) services ON manager.staff_id IS NOT NULL
  LEFT JOIN LATERAL (
   SELECT sum(guarantees.wage) AS total FROM (
    SELECT live.weekly_guarantee AS wage FROM ppw_contracts live
    WHERE live.world_id=q.world_id AND live.promotion_id=q.promotion_id AND live.status='SIGNED'
     AND c.expires_week_index+1 BETWEEN live.start_week_index AND live.expires_week_index
    UNION ALL
    SELECT (renewal.proposed_terms->>'weeklyGuarantee')::bigint
    FROM ppw_contract_renewal_proposals renewal
    JOIN ppw_contracts live ON live.world_id=renewal.world_id AND live.contract_id=renewal.contract_id
    WHERE renewal.world_id=q.world_id AND renewal.promotion_id=q.promotion_id AND renewal.status='ACCEPTED'
     AND live.status='SIGNED' AND c.expires_week_index+1 BETWEEN live.expires_week_index+1
      AND live.expires_week_index+(renewal.proposed_terms->>'termWeeks')::integer
    UNION ALL
    SELECT (offer.terms->>'weeklyGuarantee')::bigint FROM ppw_contract_offers offer
    WHERE offer.world_id=q.world_id AND offer.promotion_id=q.promotion_id AND offer.status='PENDING'
     AND c.expires_week_index+1 BETWEEN (offer.terms->>'startWeekIndex')::integer
      AND (offer.terms->>'startWeekIndex')::integer+(offer.terms->>'termWeeks')::integer-1
   ) guarantees
  ) wages ON manager.staff_id IS NOT NULL AND plan.weekly_wage_limit IS NOT NULL
  WHERE q.world_id=$1 AND q.status='QUEUED' AND q.created_week_index<=$2
  ORDER BY c.expires_week_index,q.promotion_id,q.request_id LIMIT 201
 `,[worldId,week]);
 if(tasks.length>200)throw new Error("Talent Manager delegation exceeds the World offer capacity");
 if(!tasks.length)return {queued:0,submitted:0};
 const staff=new Map(worldStaff(tasks[0]!.seed).map(x=>[x.staffId,x]));
 const reserved=new Map<string,{fees:number;terms:OfferTerms[]}>();
 const reservedPeople=new Set<string>();
 const decisions=tasks.map(task=>{
  const budget=reserved.get(task.promotion_id)??{fees:0,terms:[]};
  const key=JSON.stringify([task.promotion_id,task.person_id]);
  if(!task.eligible||!task.staff_id||reservedPeople.has(key))return {id:task.request_id,terms:null};
  let terms:OfferTerms|null;
  try{
   terms=delegatedRenewalTerms(task.contract,{
    strategy:task.strategy,maxWeeklyGuarantee:Number(task.max_weekly_guarantee),
    maxAppearanceFee:Number(task.max_appearance_fee),
   },{insight:staff.get(task.staff_id)?.insight??55,morale:task.person.morale,
    trust:task.trust,marketValue:marketWeeklyValue(task.person),popularity:task.person.popularity});
   if(!terms||canAcceptTerms(task.person,terms,task.commitments,week))return {id:task.request_id,terms:null};
  }catch{
   // Incomplete legacy economics cannot be quoted safely, so this job has
   // no offer. It must not stall unrelated World Lock work.
   return {id:task.request_id,terms:null};
  }
  const wages=Number(task.committed_wages)+terms.weeklyGuarantee+
   budget.terms.reduce((sum,pending)=>terms.startWeekIndex<pending.startWeekIndex+pending.termWeeks&&
    pending.startWeekIndex<terms.startWeekIndex+terms.termWeeks?sum+pending.weeklyGuarantee:sum,0);
  const increase=Math.max(0,terms.weeklyGuarantee-task.contract.weeklyGuarantee)*terms.termWeeks+
   Math.max(0,terms.appearanceFee-task.contract.appearanceFee)*terms.dateEntitlement;
  if((task.weekly_wage_limit!==null&&wages>Number(task.weekly_wage_limit))||
   (task.show_talent_limit!==null&&terms.appearanceFee>Number(task.show_talent_limit))||
   (increase>0&&budget.fees+increase>Math.max(0,Number(task.cash)-Number(task.cash_reserve))))
   return {id:task.request_id,terms:null};
  budget.fees+=increase;
  budget.terms.push(terms);reserved.set(task.promotion_id,budget);
  reservedPeople.add(key);
  return {id:task.request_id,terms};
 });
 await tx.query(`
  WITH decisions AS (
   SELECT id,terms FROM jsonb_to_recordset($3::jsonb) AS d(id text,terms jsonb)
  ), offered AS (
   INSERT INTO ppw_contract_offers
    (world_id,offer_id,person_id,promotion_id,source_contract_id,submitted_week_index,terms)
   SELECT q.world_id,q.request_id,c.person_id,q.promotion_id,q.contract_id,$2,d.terms
   FROM decisions d JOIN ppw_delegated_contract_renewals q ON q.world_id=$1 AND q.request_id=d.id
    AND q.status='QUEUED'
   JOIN ppw_contracts c ON c.world_id=q.world_id AND c.contract_id=q.contract_id
   WHERE d.terms IS NOT NULL
   RETURNING offer_id
  )
  UPDATE ppw_delegated_contract_renewals q SET processed_week_index=$2,
   status=CASE WHEN offered.offer_id IS NULL THEN 'UNABLE' ELSE 'SUBMITTED' END
  FROM decisions d LEFT JOIN offered ON offered.offer_id=d.id
  WHERE q.world_id=$1 AND q.request_id=d.id AND q.status='QUEUED'
 `,[worldId,week,JSON.stringify(decisions)]);
 return {queued:tasks.length,submitted:decisions.filter(x=>x.terms!==null).length};
}
