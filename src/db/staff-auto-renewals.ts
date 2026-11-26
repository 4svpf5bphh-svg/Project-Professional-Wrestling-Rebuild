/** Opted-in Talent Manager: one deterministic, low-transfer proposal batch at
 * weekly World Lock. Does not sign, extend, debit or reset any wrestler deal.
 * The existing wrestler-led renewal resolver independently decides acceptance.
 */
import {createHash} from "node:crypto";
import type {SqlRows} from "./world-operations.js";
import {sameTermsRenewal} from "../domain/renewal-terms.js";
import {maxExclusiveTermWeeks,maxPurchasedDates,minimumExclusiveWeeklyGuarantee,
 unpackSignedCommitments,type CompactSignedCommitment,type Stage} from "../domain/contract-economics.js";
type Candidate={
 contract_id:string;person_id:string;promotion_id:string;
 family:"ONE_OFF"|"LIMITED_NON_EXCLUSIVE"|"EXCLUSIVE";
 status:"SIGNED"|"EXPIRED"|"TERMINATED";
 start_week_index:number;expires_week_index:number;
 date_entitlement:number|null;weekly_guarantee:string;
 appearance_fee:string;role_expectation:string;creative_control:string;
 career_stage:Stage|null;stamina:number|null;fatigue:number|null;weekly_service_capacity:number|null;
 market_value:number|null;commitments:CompactSignedCommitment[]|null;
};
export async function prepareDelegatedSameTermsRenewals(tx:SqlRows,
 worldId:string,currentWeekIndex:number){
 if(!worldId||!Number.isSafeInteger(currentWeekIndex)||currentWeekIndex<0)
  throw new Error("Invalid staff renewal World week");
 const due=await tx.query<Candidate>(`
  SELECT c.contract_id,c.person_id,c.promotion_id,c.family,c.status,
   c.start_week_index,c.expires_week_index,c.date_entitlement,
   c.weekly_guarantee::text,c.appearance_fee::text,
   c.role_expectation,c.creative_control,person.career_stage,person.stamina,person.fatigue,
   person.weekly_service_capacity,
   round((500+person.recognition*50+person.popularity*30+
    (person.in_ring_quality+person.match_craft+person.presentation)*25.0/3)*
    CASE person.career_stage WHEN 'SPECIAL_ATTRACTION' THEN 1.35
     WHEN 'VETERAN' THEN 1.1 WHEN 'PROSPECT' THEN 0.75 ELSE 1 END)::integer AS market_value,
   (SELECT jsonb_agg(jsonb_build_array(service.family='EXCLUSIVE',service.remaining_dates,
     service.start_week_index,service.expires_week_index))
    FROM ppw_signed_service_windows service
    WHERE service.world_id=c.world_id AND service.person_id=c.person_id
     AND service.status='SIGNED' AND service.contract_id<>c.contract_id
     AND service.expires_week_index>c.expires_week_index) AS commitments
  FROM ppw_contracts c
  JOIN ppw_people person ON person.world_id=c.world_id AND person.person_id=c.person_id
   AND person.status IN ('ACTIVE','INJURED')
  JOIN ppw_staff_continuity_settings s ON s.world_id=c.world_id
   AND s.promotion_id=c.promotion_id AND s.auto_renew_same_terms=true
  JOIN ppw_staff_employments manager ON manager.world_id=c.world_id
   AND manager.promotion_id=c.promotion_id AND manager.role='TALENT_MANAGER' AND manager.status='ACTIVE'
   AND $2 BETWEEN manager.start_week_index AND manager.expires_week_index
  JOIN ppw_promotion_controls owner ON owner.world_id=c.world_id
   AND owner.promotion_id=c.promotion_id AND owner.player_id=s.owner_player_id
   AND owner.active
  JOIN ppw_memberships m ON m.world_id=owner.world_id
   AND m.player_id=owner.player_id AND m.status='ACTIVE'
  JOIN ppw_promotions p ON p.world_id=c.world_id
   AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'
  WHERE c.world_id=$1 AND c.status='SIGNED'
   AND c.family<>'ONE_OFF'
   AND c.start_week_index <= $2
   AND c.expires_week_index BETWEEN $2::integer AND $2::integer+2
   AND NOT EXISTS(
    SELECT 1 FROM ppw_contract_renewal_proposals prior
    WHERE prior.world_id=c.world_id AND prior.contract_id=c.contract_id)
  ORDER BY c.expires_week_index,c.promotion_id,c.contract_id LIMIT 1025
 `,[worldId,currentWeekIndex]);
 if(due.length>1024)throw new Error("Talent Manager weekly proposal capacity exceeded; no renewals omitted");
 const planned:{proposal_id:string;contract_id:string;person_id:string;
  promotion_id:string;created_week_index:number;terms:unknown}[]=[];
 for(const c of due){
  const terms=sameTermsRenewal({
   family:c.family,status:c.status,
   startWeekIndex:c.start_week_index,expiresWeekIndex:c.expires_week_index,
   dateEntitlement:c.date_entitlement,
   weeklyGuarantee:Number(c.weekly_guarantee),
   appearanceFee:Number(c.appearance_fee),
   roleExpectation:c.role_expectation,creativeControl:c.creative_control
  });
  if(!terms)continue;
  const start=c.expires_week_index+1;
  const commitments=unpackSignedCommitments(c.commitments);
  if(terms.family==="EXCLUSIVE"&&(terms.termWeeks>maxExclusiveTermWeeks(start,commitments)||
    (c.market_value!==null&&terms.weeklyGuarantee<minimumExclusiveWeeklyGuarantee(c.market_value))))continue;
  if(terms.family==="LIMITED_NON_EXCLUSIVE"){
   if(commitments.some(other=>other.family==="EXCLUSIVE"&&
    other.startWeekIndex<start+terms.termWeeks))continue;
   if(c.career_stage&&c.stamina!==null&&c.fatigue!==null&&
    maxPurchasedDates({careerStage:c.career_stage,stamina:c.stamina,
     fatigue:c.fatigue,weeklyServiceCapacity:c.weekly_service_capacity},start,
    terms.termWeeks,commitments,currentWeekIndex)<terms.dateEntitlement)continue;
  }
  const proposalId="staff-renew-"+createHash("sha256")
   .update(JSON.stringify([worldId,c.contract_id,currentWeekIndex]))
   .digest("hex").slice(0,32);
  planned.push({proposal_id:proposalId,contract_id:c.contract_id,
   person_id:c.person_id,promotion_id:c.promotion_id,
   created_week_index:currentWeekIndex,terms});
 }
 if(planned.length){
  const saved=await tx.query<{proposal_id:string}>(`
   INSERT INTO ppw_contract_renewal_proposals
    (world_id,proposal_id,contract_id,promotion_id,person_id,
     created_week_index,proposed_terms)
   SELECT $1,v.proposal_id,v.contract_id,v.promotion_id,v.person_id,
    v.created_week_index,v.terms
   FROM jsonb_to_recordset($2::jsonb) AS v(
    proposal_id text,contract_id text,promotion_id text,
    person_id text,created_week_index integer,terms jsonb)
   RETURNING proposal_id
  `,[worldId,JSON.stringify(planned)]);
  if(saved.length!==planned.length)
   throw new Error("Talent Manager renewal proposal batch was incomplete");
  const year=Math.floor(currentWeekIndex/52)+1,week=currentWeekIndex%52+1;
  await tx.query(`
   INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   VALUES($1,$2,$3,'STAFF_SAME_TERMS_RENEWALS',
    jsonb_build_object('proposalCount',$4::integer,'scope','CONSENTED_OWNER'))`,
   [worldId,year,week,planned.length]);
 }
 return {proposed:planned.length,candidateCount:due.length,
  reachedBatchCap:false};
}
