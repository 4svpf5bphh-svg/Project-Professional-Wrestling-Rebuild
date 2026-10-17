/** Opted-in Talent Manager: one deterministic, low-transfer proposal batch at
 * weekly World Lock. Does not sign, extend, debit or reset any wrestler deal.
 * The existing wrestler-led renewal resolver independently decides acceptance.
 */
import {createHash} from "node:crypto";
import type {SqlRows} from "./world-operations.js";
import {sameTermsRenewal} from "../domain/renewal-terms.js";
type Candidate={
 contract_id:string;person_id:string;promotion_id:string;
 family:"ONE_OFF"|"LIMITED_NON_EXCLUSIVE"|"EXCLUSIVE";
 status:"SIGNED"|"EXPIRED"|"TERMINATED";
 start_week_index:number;expires_week_index:number;
 date_entitlement:number|null;weekly_guarantee:string;
 appearance_fee:string;role_expectation:string;creative_control:string;
};
export async function prepareDelegatedSameTermsRenewals(tx:SqlRows,
 worldId:string,currentWeekIndex:number){
 if(!worldId||!Number.isSafeInteger(currentWeekIndex)||currentWeekIndex<0)
  throw new Error("Invalid staff renewal World week");
 const due=await tx.query<Candidate>(`
  SELECT c.contract_id,c.person_id,c.promotion_id,c.family,c.status,
   c.start_week_index,c.expires_week_index,c.date_entitlement,
   c.weekly_guarantee::text,c.appearance_fee::text,
   c.role_expectation,c.creative_control
  FROM ppw_contracts c
  JOIN ppw_staff_continuity_settings s ON s.world_id=c.world_id
   AND s.promotion_id=c.promotion_id AND s.auto_renew_same_terms=true
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
  ORDER BY c.expires_week_index,c.promotion_id,c.contract_id LIMIT 201
 `,[worldId,currentWeekIndex]);
 const planned:{proposal_id:string;contract_id:string;person_id:string;
  promotion_id:string;created_week_index:number;terms:unknown}[]=[];
 for(const c of due.slice(0,200)){
  const terms=sameTermsRenewal({
   family:c.family,status:c.status,
   startWeekIndex:c.start_week_index,expiresWeekIndex:c.expires_week_index,
   dateEntitlement:c.date_entitlement,
   weeklyGuarantee:Number(c.weekly_guarantee),
   appearanceFee:Number(c.appearance_fee),
   roleExpectation:c.role_expectation,creativeControl:c.creative_control
  });
  if(!terms)continue;
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
  reachedBatchCap:due.length>200};
}
