import type { TransactionPool } from "./transaction.js";
import { withSqlClient } from "./postgres.js";
import { contractAvailability, type ContractAvailabilityReason, type ContractAvailabilityInput } from "../domain/contract-availability.js";

export interface RosterContractRow {
  contractId:string; personId:string; name:string;
  family:ContractAvailabilityInput["family"];
  remainingDates:number|null; expiresWeekIndex:number;
  availableForBooking:boolean; reason:ContractAvailabilityReason;
  weeksRemaining:number;expiringSoon:boolean;needsAttention:boolean;
  renewalEligible:boolean;additionalDatesEligible:boolean;
}

/** Only the authenticated promotion controller may read its contracts.
 * Never infer promotion ownership from a client-provided promotion ID.
 */
export async function readRosterContracts(
  pool:TransactionPool,worldId:string,playerId:string,promotionId:string,
  currentWeekIndex:number,limit=50,
):Promise<RosterContractRow[]> {
  if (!Number.isSafeInteger(limit)||limit<1||limit>100) throw new Error("Invalid limit");
  if (!Number.isSafeInteger(currentWeekIndex)||currentWeekIndex<0) throw new Error("Invalid week");
  return withSqlClient(pool,async tx=>{
    const ownership=await tx.query<{promotion_id:string}>(
      `SELECT c.promotion_id FROM ppw_promotion_controls c
       JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
       JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
       WHERE c.world_id=$1 AND c.player_id=$2 AND c.promotion_id=$3
         AND c.active=true AND m.status='ACTIVE' AND p.lifecycle='ACTIVE'`,
      [worldId,playerId,promotionId],
    );
    if (!ownership.length) throw new Error("Promotion access denied");
    const rows=await tx.query<{
      contract_id:string;person_id:string;name:string;
      family:ContractAvailabilityInput["family"];status:ContractAvailabilityInput["status"];
      remaining_dates:number|null;expires_week_index:number;
    }>(
      "SELECT c.contract_id,c.person_id,p.name,c.family,c.status,c.remaining_dates,c.expires_week_index FROM ppw_contracts c JOIN ppw_people p ON p.world_id=c.world_id AND p.person_id=c.person_id WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.status='SIGNED' ORDER BY p.name,c.contract_id LIMIT $3",
      [worldId,promotionId,limit],
    );
    return rows.map(r=>{
      const a=contractAvailability({family:r.family,status:r.status,remainingDates:r.remaining_dates,expiresWeekIndex:r.expires_week_index,currentWeekIndex});
      const weeksRemaining=Math.max(0,r.expires_week_index-currentWeekIndex+1);
      const expiringSoon=weeksRemaining<=4;
      const additionalDatesEligible=r.family!=="EXCLUSIVE" && weeksRemaining>0 && r.remaining_dates!==null;
      const renewalEligible=r.family!=="ONE_OFF" && weeksRemaining>0;
      const needsAttention=expiringSoon || a.reason==="NO_DATES";
      return {contractId:r.contract_id,personId:r.person_id,name:r.name,family:r.family,
        remainingDates:r.remaining_dates,expiresWeekIndex:r.expires_week_index,
        availableForBooking:a.available,reason:a.reason,weeksRemaining,expiringSoon,
        needsAttention,renewalEligible,additionalDatesEligible};
    });
  });
}
