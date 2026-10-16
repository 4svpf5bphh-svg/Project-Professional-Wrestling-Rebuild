import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {contractDeskEntry} from "../domain/contract-desk.js";
import type {ContractAvailabilityInput} from "../domain/contract-availability.js";

/** One consistent World-clock snapshot, including pending negotiations.
 * No client-supplied week, and no second unguarded roster request. */
export async function readContractDesk(
 pool:TransactionPool,worldId:string,playerId:string,promotionId:string,
){
 if(!worldId||!playerId||!promotionId)throw new Error("Invalid contract desk identity");
 return withSqlClient(pool,async tx=>{
  const auth=await tx.query<{year:number;week:number}>(`
   SELECT w.year,w.week FROM ppw_worlds w
   JOIN ppw_promotion_controls c ON c.world_id=w.world_id
   JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
   JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
   WHERE w.world_id=$1 AND c.player_id=$2 AND c.promotion_id=$3
     AND c.active AND m.status='ACTIVE' AND p.lifecycle='ACTIVE'`,
   [worldId,playerId,promotionId]);
  if(auth.length!==1)throw new Error("Promotion access denied");
  const currentWeekIndex=(auth[0]!.year-1)*52+auth[0]!.week-1;
  const contracts=await tx.query<{
   contract_id:string;person_id:string;name:string;
   family:ContractAvailabilityInput["family"];status:ContractAvailabilityInput["status"];
   remaining_dates:number|null;expires_week_index:number;
  }>(`
   SELECT c.contract_id,c.person_id,p.name,c.family,c.status,
     c.remaining_dates,c.expires_week_index
   FROM ppw_contracts c JOIN ppw_people p
     ON p.world_id=c.world_id AND p.person_id=c.person_id
   WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.status='SIGNED'
   ORDER BY c.expires_week_index,p.name,c.contract_id LIMIT 200`,
   [worldId,promotionId]);
  const requests=await tx.query<{
   request_id:string;contract_id:string;person_id:string;
   additional_dates:number;status:string;created_week_index:number;
  }>(`
   SELECT request_id,contract_id,person_id,additional_dates,status,created_week_index
   FROM ppw_contract_date_requests
   WHERE world_id=$1 AND promotion_id=$2 AND status='PENDING'
   ORDER BY created_week_index,request_id LIMIT 200`,
   [worldId,promotionId]);
  const roster=contracts.map(c=>contractDeskEntry({
   contractId:c.contract_id,personId:c.person_id,name:c.name,
   family:c.family,status:c.status,remainingDates:c.remaining_dates,
   expiresWeekIndex:c.expires_week_index,currentWeekIndex,
  }));
  const pendingIds=new Set(requests.map(q=>q.contract_id));
  return {
   currentWeekIndex,
   roster:roster.map(c=>({...c,pendingNegotiation:pendingIds.has(c.contractId)})),
   requests,
   summary:{
    signed:roster.length,expiringSoon:roster.filter(c=>c.expiringSoon).length,
    noDates:roster.filter(c=>c.reason==="NO_DATES").length,
    pendingNegotiations:requests.length,
   },
  };
 });
}
