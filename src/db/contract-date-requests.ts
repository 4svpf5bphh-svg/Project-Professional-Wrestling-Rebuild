import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {applyWorldCommand} from "./world-commands.js";

export interface RequestAdditionalDatesInput {
 worldId:string;playerId:string;promotionId:string;contractId:string;
 requestId:string;expectedRevision:number;additionalDates:number;
}
/** Player proposes extra non-exclusive dates; this never silently awards dates.
 * Negotiation/acceptance must be implemented as a separate wrestler decision. */
export async function requestAdditionalDates(pool:TransactionPool,input:RequestAdditionalDatesInput) {
 if(!input.promotionId||input.promotionId.length>200||!input.contractId||input.contractId.length>200)
   throw new Error("Invalid contract request");
 if(!Number.isSafeInteger(input.additionalDates)||input.additionalDates<1||input.additionalDates>104)
   throw new Error("Additional dates must be between 1 and 104");
 return applyWorldCommand(pool,{
   worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
   expectedRevision:input.expectedRevision,commandType:"REQUEST_ADDITIONAL_DATES",requiresOpenWeek:true,
   execute:async tx=>{
     const controllers=await tx.query<{promotion_id:string}>(`
       SELECT c.promotion_id FROM ppw_promotion_controls c
       JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
       JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
       WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.player_id=$3
       AND c.active AND m.status='ACTIVE' AND p.lifecycle='ACTIVE'`,
       [input.worldId,input.promotionId,input.playerId]);
     if(controllers.length!==1)throw new Error("Promotion access denied");
     const contracts=await tx.query<{person_id:string;remaining_dates:number|null;expires_week_index:number;family:string}>(`
       SELECT person_id,remaining_dates,expires_week_index,family FROM ppw_contracts
       WHERE world_id=$1 AND promotion_id=$2 AND contract_id=$3 AND status='SIGNED'
       FOR UPDATE`,[input.worldId,input.promotionId,input.contractId]);
     if(contracts.length!==1)throw new Error("Signed contract not found");
     const contract=contracts[0]!;
     if(contract.family!=="LIMITED_NON_EXCLUSIVE"||contract.remaining_dates===null)
       throw new Error("Only limited non-exclusive contracts can request more dates");
     const clocks=await tx.query<{year:number;week:number}>(`
       SELECT year,week FROM ppw_worlds WHERE world_id=$1`,[input.worldId]);
     const clock=clocks[0]!;
     const weekIndex=(clock.year-1)*52+clock.week-1;
     if(contract.expires_week_index<weekIndex)throw new Error("Contract has expired");
     const existing=await tx.query<{request_id:string}>(`
       SELECT request_id FROM ppw_contract_date_requests
       WHERE world_id=$1 AND contract_id=$2 AND status='PENDING'`,
       [input.worldId,input.contractId]);
     if(existing.length)throw new Error("An additional-dates request is already pending");
     await tx.query(`
       INSERT INTO ppw_contract_date_requests
       (world_id,request_id,contract_id,promotion_id,person_id,additional_dates,status,created_week_index)
       VALUES($1,$2,$3,$4,$5,$6,'PENDING',$7)`,
       [input.worldId,input.requestId,input.contractId,input.promotionId,contract.person_id,input.additionalDates,weekIndex]);
     return {contractId:input.contractId,additionalDates:input.additionalDates,status:"PENDING" as const};
   },
 });
}

/** Contract desk inbox. World ownership is verified in the same read. */
export async function readPendingDateRequests(
 pool:TransactionPool,worldId:string,playerId:string,promotionId:string,
){
 return withSqlClient(pool,async tx=>{
  const owner=await tx.query<{promotion_id:string}>(`
   SELECT c.promotion_id FROM ppw_promotion_controls c
   JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
   JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
   WHERE c.world_id=$1 AND c.player_id=$2 AND c.promotion_id=$3
     AND c.active AND m.status='ACTIVE' AND p.lifecycle='ACTIVE'`,
   [worldId,playerId,promotionId]);
  if(owner.length!==1)throw new Error("Promotion access denied");
  return tx.query<{request_id:string;contract_id:string;person_id:string;
    additional_dates:number;status:string;created_week_index:number}>(`
    SELECT request_id,contract_id,person_id,additional_dates,status,created_week_index
    FROM ppw_contract_date_requests
    WHERE world_id=$1 AND promotion_id=$2 AND status='PENDING'
    ORDER BY created_week_index,request_id LIMIT 100`,[worldId,promotionId]);
 });
}
