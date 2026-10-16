import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
export interface RenewalDecision {
 worldId:string;playerId:string;promotionId:string;proposalId:string;
 requestId:string;expectedRevision:number;decision:"ACCEPTED"|"REJECTED";
}
/** Server-side wrestler decision; not exposed to a player-controlled endpoint.
 * Never modify a contract on rejection, and never resolve twice. */
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
    proposed_terms:{family:string;termWeeks:number;dateEntitlement:number;
    weeklyGuarantee:number;appearanceFee:number;roleExpectation:string;creativeControl:string};
   }>(`SELECT contract_id,person_id,promotion_id,proposed_terms
    FROM ppw_contract_renewal_proposals
    WHERE world_id=$1 AND proposal_id=$2 AND status='PENDING' FOR UPDATE`,
    [input.worldId,input.proposalId]);
   if(rows.length!==1)throw new Error("Pending renewal not found");
   const p=rows[0]!;
   if(p.promotion_id!==input.promotionId)throw new Error("Promotion mismatch");
   const contracts=await tx.query<{status:string;expires_week_index:number}>(`
    SELECT status,expires_week_index FROM ppw_contracts
    WHERE world_id=$1 AND contract_id=$2 AND promotion_id=$3 FOR UPDATE`,
    [input.worldId,p.contract_id,input.promotionId]);
   if(contracts.length!==1)throw new Error("Contract missing");
   const clock=await tx.query<{year:number;week:number}>(`
    SELECT year,week FROM ppw_worlds WHERE world_id=$1`,[input.worldId]);
   const current=(clock[0]!.year-1)*52+clock[0]!.week-1;
   const old=contracts[0]!;
   const decision=old.status==="SIGNED"&&old.expires_week_index>=current?input.decision:"REJECTED";
   if(decision==="ACCEPTED"){
    const t=p.proposed_terms;
    if(!Number.isSafeInteger(t.termWeeks)||t.termWeeks<1||t.termWeeks>52||
      !Number.isSafeInteger(t.dateEntitlement)||t.dateEntitlement<1||t.dateEntitlement>104)
      throw new Error("Invalid renewal terms");
    // Extension starts after current expiry, preserving the existing paid term.
    const nextStart=old.expires_week_index+1;
    await tx.query(`UPDATE ppw_contracts SET start_week_index=$4,
     expires_week_index=$5,date_entitlement=$6,
     remaining_dates=CASE WHEN family='EXCLUSIVE' THEN NULL ELSE $6 END,
     weekly_guarantee=$7,appearance_fee=$8,role_expectation=$9,
     creative_control=$10,signing_bonus=0,revision=revision+1
     WHERE world_id=$1 AND contract_id=$2 AND promotion_id=$3`,
     [input.worldId,p.contract_id,input.promotionId,nextStart,
      nextStart+t.termWeeks-1,t.dateEntitlement,t.weeklyGuarantee,
      t.appearanceFee,t.roleExpectation,t.creativeControl]);
   }
   await tx.query(`UPDATE ppw_contract_renewal_proposals SET status=$3
    WHERE world_id=$1 AND proposal_id=$2`,
    [input.worldId,input.proposalId,decision]);
   return {proposalId:input.proposalId,contractId:p.contract_id,decision};
  },
 });
}
