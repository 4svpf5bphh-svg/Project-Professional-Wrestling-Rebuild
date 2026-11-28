import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {readRenewalDelegation,type RenewalDelegation} from "../domain/delegated-renewal.js";
import {agreedNextTermSql} from "./contract-renewal-status-sql.js";
import {sameTermsRenewal} from "../domain/renewal-terms.js";

export interface RenewalRequest {
 worldId:string;playerId:string;promotionId:string;contractId:string;
 requestId:string;expectedRevision:number;delegation?:RenewalDelegation;
}
/** A player offers the existing recurring terms. Wrestler acceptance is separate. */
export async function proposeSameTermsRenewal(pool:TransactionPool,input:RenewalRequest){
 if(!input.contractId||!input.promotionId)throw new Error("Invalid renewal request");
 const delegation=input.delegation===undefined?null:readRenewalDelegation(input.delegation);
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,commandType:"PROPOSE_RENEWAL",requiresOpenWeek:true,
  execute:async tx=>{
   const owners=await tx.query<{promotion_id:string}>(`
    SELECT c.promotion_id FROM ppw_promotion_controls c
    JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
    JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
    WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.player_id=$3
    AND c.active AND m.status='ACTIVE' AND p.lifecycle='ACTIVE'`,
    [input.worldId,input.promotionId,input.playerId]);
   if(owners.length!==1)throw new Error("Promotion access denied");
   const rows=await tx.query<{
    person_id:string;family:"ONE_OFF"|"LIMITED_NON_EXCLUSIVE"|"EXCLUSIVE";
    status:"SIGNED"|"EXPIRED"|"TERMINATED";start_week_index:number;
    expires_week_index:number;date_entitlement:number|null;
    weekly_guarantee:string;appearance_fee:string;role_expectation:string;creative_control:string;
   }>(`SELECT person_id,family,status,start_week_index,expires_week_index,
    date_entitlement,weekly_guarantee,appearance_fee,role_expectation,creative_control
    FROM ppw_contracts WHERE world_id=$1 AND promotion_id=$2 AND contract_id=$3 FOR UPDATE`,
    [input.worldId,input.promotionId,input.contractId]);
   if(rows.length!==1)throw new Error("Contract not found");
   const c=rows[0]!;
   const clocks=await tx.query<{year:number;week:number}>(`SELECT year,week FROM ppw_worlds WHERE world_id=$1`,[input.worldId]);
   const week=(clocks[0]!.year-1)*52+clocks[0]!.week-1;
   if(c.expires_week_index<week||c.start_week_index>week)throw new Error("The current term is unavailable");
   const terms=sameTermsRenewal({family:c.family,status:c.status,
    startWeekIndex:c.start_week_index,expiresWeekIndex:c.expires_week_index,
    dateEntitlement:c.date_entitlement,weeklyGuarantee:Number(c.weekly_guarantee),
    appearanceFee:Number(c.appearance_fee),roleExpectation:c.role_expectation,
    creativeControl:c.creative_control});
   if(!terms)throw new Error("Manual negotiation required for these terms");
   const [state]=await tx.query<{blocked:boolean;has_manager:boolean}>(`
    SELECT EXISTS(${agreedNextTermSql("c")}) OR EXISTS(
     SELECT 1 FROM ppw_contract_offers bid WHERE bid.world_id=c.world_id
      AND bid.person_id=c.person_id AND bid.promotion_id=c.promotion_id AND bid.status='PENDING')
     OR EXISTS(SELECT 1 FROM ppw_contract_renewal_proposals r WHERE r.world_id=c.world_id
      AND r.contract_id=c.contract_id AND r.status='PENDING')
     OR EXISTS(SELECT 1 FROM ppw_delegated_contract_renewals task WHERE task.world_id=c.world_id
      AND task.contract_id=c.contract_id AND task.status='QUEUED' AND task.owner_player_id=$4) AS blocked,
     EXISTS(SELECT 1 FROM ppw_staff_employments e WHERE e.world_id=c.world_id AND e.promotion_id=c.promotion_id
      AND e.role='TALENT_MANAGER' AND e.status='ACTIVE' AND $5 BETWEEN e.start_week_index AND e.expires_week_index)
      AS has_manager
    FROM ppw_contracts c WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.contract_id=$3`,
    [input.worldId,input.promotionId,input.contractId,input.playerId,week]);
   if(state?.blocked)throw new Error("Renewal already arranged or awaiting a decision");
   if(delegation){
    if(!state?.has_manager)throw new Error("A current Talent Manager is required");
    await tx.query(`UPDATE ppw_delegated_contract_renewals SET status='WITHDRAWN'
     WHERE world_id=$1 AND contract_id=$2 AND owner_player_id<>$3 AND status='QUEUED'`,
     [input.worldId,input.contractId,input.playerId]);
    await tx.query(`INSERT INTO ppw_delegated_contract_renewals
     (world_id,request_id,promotion_id,owner_player_id,contract_id,source_start_week_index,
      created_week_index,strategy,max_weekly_guarantee,max_appearance_fee)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
     [input.worldId,input.requestId,input.promotionId,input.playerId,input.contractId,c.start_week_index,
      week,delegation.strategy,delegation.maxWeeklyGuarantee,delegation.maxAppearanceFee]);
    return {proposalId:input.requestId,contractId:input.contractId,status:"QUEUED" as const,terms:null};
   }
   await tx.query(`INSERT INTO ppw_contract_renewal_proposals
    (world_id,proposal_id,contract_id,promotion_id,person_id,created_week_index,proposed_terms)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [input.worldId,input.requestId,input.contractId,input.promotionId,c.person_id,week,JSON.stringify(terms)]);
   return {proposalId:input.requestId,contractId:input.contractId,status:"PENDING" as const,terms};
  },
 });
}
