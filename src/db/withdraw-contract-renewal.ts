import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
/** Withdraw an unanswered renewal; preserves contract dates and terms. */
export async function withdrawRenewal(pool:TransactionPool,input:{
 worldId:string;playerId:string;promotionId:string;proposalId:string;
 requestId:string;expectedRevision:number;
}){
 if(!input.promotionId||!input.proposalId)throw new Error("Invalid renewal withdrawal");
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,commandType:"WITHDRAW_RENEWAL",
  requiresOpenWeek:true,execute:async tx=>{
   const owners=await tx.query<{promotion_id:string}>(`
    SELECT c.promotion_id FROM ppw_promotion_controls c
    JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
    JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
    WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.player_id=$3
    AND c.active AND m.status='ACTIVE' AND p.lifecycle='ACTIVE'`,
    [input.worldId,input.promotionId,input.playerId]);
   if(owners.length!==1)throw new Error("Promotion access denied");
   const changed=await tx.query<{proposal_id:string}>(`
    UPDATE ppw_contract_renewal_proposals SET status='WITHDRAWN'
    WHERE world_id=$1 AND promotion_id=$2 AND proposal_id=$3 AND status='PENDING'
    RETURNING proposal_id`,[input.worldId,input.promotionId,input.proposalId]);
   if(changed.length!==1)throw new Error("Pending renewal not found");
   return {proposalId:input.proposalId,status:"WITHDRAWN" as const};
  },
 });
}
