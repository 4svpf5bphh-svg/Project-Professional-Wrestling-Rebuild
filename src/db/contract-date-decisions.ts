import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";

export interface ResolveDateRequestInput {
 worldId:string;playerId:string;promotionId:string;dateRequestId:string;
 requestId:string;expectedRevision:number;
 decision:"ACCEPTED"|"REJECTED";
}
/** Trusted resolution of a wrestler's response. A player cannot award their
 * own dates: only the separate server-authorized resolver may invoke this. */
export async function resolveDateRequest(
 pool:TransactionPool,input:ResolveDateRequestInput,
 authorization:{source:"WORLD_RESOLUTION";worldId:string},
) {
 if(authorization.source!=="WORLD_RESOLUTION"||authorization.worldId!==input.worldId)
   throw new Error("World resolution authority required");
 if(!input.dateRequestId||input.dateRequestId.length>200||
    !input.promotionId||input.promotionId.length>200||
    (input.decision!=="ACCEPTED"&&input.decision!=="REJECTED"))
   throw new Error("Invalid date negotiation decision");
 return applyWorldCommand(pool,{
   worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
   expectedRevision:input.expectedRevision,commandType:"RESOLVE_DATE_NEGOTIATION",
   execute:async tx=>{
     const requests=await tx.query<{
       contract_id:string;promotion_id:string;additional_dates:number;status:string;
     }>(`SELECT contract_id,promotion_id,additional_dates,status
       FROM ppw_contract_date_requests
       WHERE world_id=$1 AND request_id=$2 FOR UPDATE`,
       [input.worldId,input.dateRequestId]);
     if(requests.length!==1||requests[0]!.status!=="PENDING")
       throw new Error("Pending date request not found");
     const request=requests[0]!;
     if(request.promotion_id!==input.promotionId)throw new Error("Promotion mismatch");
     const contracts=await tx.query<{
       family:string;status:string;remaining_dates:number|null;expires_week_index:number;
     }>(`SELECT family,status,remaining_dates,expires_week_index FROM ppw_contracts
       WHERE world_id=$1 AND promotion_id=$2 AND contract_id=$3 FOR UPDATE`,
       [input.worldId,input.promotionId,request.contract_id]);
     if(contracts.length!==1)throw new Error("Contract missing");
     const contract=contracts[0]!;
     const clock=await tx.query<{year:number;week:number}>(`
       SELECT year,week FROM ppw_worlds WHERE world_id=$1`,[input.worldId]);
     if(clock.length!==1)throw new Error("World clock missing");
     const currentWeek=(clock[0]!.year-1)*52+clock[0]!.week-1;
     let decision=input.decision;
     if(contract.status!=="SIGNED"||contract.family!=="LIMITED_NON_EXCLUSIVE"||
        contract.remaining_dates===null||contract.expires_week_index<currentWeek)
       decision="REJECTED";
     if(decision==="ACCEPTED"){
       const updated=await tx.query<{contract_id:string}>(`
         UPDATE ppw_contracts SET remaining_dates=remaining_dates+$4,revision=revision+1
         WHERE world_id=$1 AND promotion_id=$2 AND contract_id=$3
           AND remaining_dates IS NOT NULL AND remaining_dates<=$5
         RETURNING contract_id`,
         [input.worldId,input.promotionId,request.contract_id,request.additional_dates,
          2147483647-request.additional_dates]);
       if(updated.length!==1)throw new Error("Contract date allowance overflow");
     }
     await tx.query(`UPDATE ppw_contract_date_requests SET status=$3
       WHERE world_id=$1 AND request_id=$2`,
       [input.worldId,input.dateRequestId,decision]);
     return {dateRequestId:input.dateRequestId,contractId:request.contract_id,
       decision,datesGranted:decision==="ACCEPTED"?request.additional_dates:0};
   },
 });
}
