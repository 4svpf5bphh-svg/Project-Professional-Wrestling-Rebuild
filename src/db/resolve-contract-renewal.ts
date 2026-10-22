import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {canAcceptTerms,offerUtility,requireEconomics,validateOfferTerms,
 type OfferTerms,type PersonEconomics,type ExistingCommitment} from "../domain/contract-economics.js";

export interface RenewalDecision {
 worldId:string;playerId:string;promotionId:string;proposalId:string;
 requestId:string;expectedRevision:number;decision:"ACCEPTED"|"REJECTED";
}
/** Original wrestler utility also governs legacy same-terms renewal proposals.
 * A trusted resolver may decline a deal but cannot rubber-stamp an underpaid,
 * over-capacity or overlapping renewal. No current-term date reset.
 */
export async function resolveRenewal(pool:TransactionPool,input:RenewalDecision,
 authorization:{source:"WORLD_RESOLUTION";worldId:string}){
 if(authorization.source!=="WORLD_RESOLUTION"||authorization.worldId!==input.worldId)
  throw new Error("World resolution authority required");
 if(!input.proposalId||!input.promotionId||!["ACCEPTED","REJECTED"].includes(input.decision))
  throw new Error("Invalid renewal decision");
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,commandType:"RESOLVE_RENEWAL",
  execute:async tx=>{
   const rows=await tx.query<{contract_id:string;person_id:string;promotion_id:string;
    proposed_terms:{family:OfferTerms["family"];termWeeks:number;dateEntitlement:number;
     weeklyGuarantee:number;appearanceFee:number;roleExpectation:OfferTerms["roleExpectation"];
     creativeControl:OfferTerms["creativeControl"];signingBonus:number};
   }>(`SELECT contract_id,person_id,promotion_id,proposed_terms
    FROM ppw_contract_renewal_proposals
    WHERE world_id=$1 AND proposal_id=$2 AND status='PENDING' FOR UPDATE`,
    [input.worldId,input.proposalId]);
   if(rows.length!==1)throw new Error("Pending renewal not found");
   const proposal=rows[0]!;
   if(proposal.promotion_id!==input.promotionId)throw new Error("Promotion mismatch");
   const contracts=await tx.query<{status:string;family:OfferTerms["family"];
    expires_week_index:number}>(`SELECT status,family,expires_week_index FROM ppw_contracts
    WHERE world_id=$1 AND contract_id=$2 AND promotion_id=$3 FOR UPDATE`,
    [input.worldId,proposal.contract_id,input.promotionId]);
   if(contracts.length!==1)throw new Error("Contract missing");
   const clocks=await tx.query<{year:number;week:number;seed:string|number;offer_acceptance_threshold:number}>(`
    SELECT year,week,seed,offer_acceptance_threshold FROM ppw_worlds WHERE world_id=$1`,[input.worldId]);
   const {year,week}=clocks[0]!,current=(year-1)*52+week-1;
   const old=contracts[0]!;
   let decision:RenewalDecision["decision"]=input.decision;
   if(old.status!=="SIGNED"||old.expires_week_index<current)decision="REJECTED";
   if(decision==="ACCEPTED"){
    const exists=await tx.query<{proposal_id:string}>(`SELECT proposal_id
     FROM ppw_contract_renewal_proposals WHERE world_id=$1 AND contract_id=$2
     AND proposal_id<>$3 AND status='ACCEPTED' LIMIT 1`,
     [input.worldId,proposal.contract_id,input.proposalId]);
    if(exists.length)decision="REJECTED";
   }
   if(decision==="ACCEPTED"){
    const t=proposal.proposed_terms;
    const terms:OfferTerms={family:t.family,termWeeks:t.termWeeks,dateEntitlement:t.dateEntitlement,
     startWeekIndex:old.expires_week_index+1,weeklyGuarantee:t.weeklyGuarantee,
     appearanceFee:t.appearanceFee,signingBonus:0,roleExpectation:t.roleExpectation,
     creativeControl:t.creativeControl};
    validateOfferTerms(terms,current);
    if(old.family!==t.family||old.family==="ONE_OFF")decision="REJECTED";
    if(decision==="ACCEPTED"){
     const pRows=await tx.query<{career_stage:PersonEconomics["careerStage"];
      recognition:number;popularity:number;in_ring_quality:number;match_craft:number;
      presentation:number;stamina:number;fatigue:number;morale:number;
      contract_priorities:PersonEconomics["priorities"]}>(`
      SELECT career_stage,recognition,popularity,in_ring_quality,match_craft,
       presentation,stamina,fatigue,morale,contract_priorities FROM ppw_people
       WHERE world_id=$1 AND person_id=$2`,[input.worldId,proposal.person_id]);
     if(pRows.length!==1)throw new Error("Wrestler missing");
     const r=pRows[0]!;
     const person:PersonEconomics={careerStage:r.career_stage,recognition:r.recognition,
      popularity:r.popularity,inRingQuality:r.in_ring_quality,matchCraft:r.match_craft,
      presentation:r.presentation,stamina:r.stamina,fatigue:r.fatigue,morale:r.morale,
      priorities:r.contract_priorities};
     requireEconomics(person);
     const signed=await tx.query<{contract_id:string;family:ExistingCommitment["family"];
      status:string;remaining_dates:number|null;start_week_index:number;expires_week_index:number}>(`
      SELECT contract_id,family,status,remaining_dates,start_week_index,expires_week_index
      FROM ppw_contracts WHERE world_id=$1 AND person_id=$2 AND status='SIGNED'
      ORDER BY contract_id LIMIT 100`,[input.worldId,proposal.person_id]);
     const active:ExistingCommitment[]=signed.map(c=>({contractId:c.contract_id,
      family:c.family,status:c.status,remainingDates:c.remaining_dates,
      startWeekIndex:c.start_week_index,expiresWeekIndex:c.expires_week_index}));
     const invalid=canAcceptTerms(person,terms,active,current);
     if(invalid)decision="REJECTED";
     if(decision==="ACCEPTED"){
      const promotions=await tx.query<{tier:string;media_reach:number|null;backstage_trust:number}>(`
       SELECT p.tier,p.media_reach,
        CASE WHEN annual.trust IS NULL THEN coalesce(t.trust,50)
         ELSE round((coalesce(t.trust,50)+annual.trust)/2,1) END AS backstage_trust
       FROM ppw_promotions p LEFT JOIN ppw_backstage_promotion_trust t
       ON t.world_id=p.world_id AND t.promotion_id=p.promotion_id
       AND t.person_id=$3
       LEFT JOIN ppw_promotion_talent_trust annual
        ON annual.world_id=p.world_id AND annual.promotion_id=p.promotion_id
         AND annual.person_id=$3
       WHERE p.world_id=$1 AND p.promotion_id=$2`,
       [input.worldId,input.promotionId,proposal.person_id]);
      if(promotions.length!==1||promotions[0]!.media_reach===null)
       throw new Error("Original promotion contract economics not imported");
      const raw=offerUtility(person,terms,{tier:promotions[0]!.tier,
       mediaReach:promotions[0]!.media_reach!,hasPriorRelationship:true,
       trust:promotions[0]!.backstage_trust,
       seed:String(clocks[0]!.seed),offerId:input.proposalId});
      // Port of original renewalRelationshipPenalty(morale,trust).
      const penalty=Math.round(Math.max(0,
       55-(person.morale+promotions[0]!.backstage_trust)/2)*.2*10)/10;
      if(raw-penalty<clocks[0]!.offer_acceptance_threshold)decision="REJECTED";
     }
    }
   }
   await tx.query(`UPDATE ppw_contract_renewal_proposals SET status=$3
    WHERE world_id=$1 AND proposal_id=$2 AND status='PENDING'`,
    [input.worldId,input.proposalId,decision]);
   return {proposalId:input.proposalId,contractId:proposal.contract_id,decision};
  }});
}
