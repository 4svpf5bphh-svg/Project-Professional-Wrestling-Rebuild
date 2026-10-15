import type { TransactionPool } from "./transaction.js";
import { applyWorldCommand } from "./world-commands.js";
import { uniqueShowAppearances, type BookedAppearance } from "../domain/appearance-policy.js";

export interface ConsumeAppearancesInput {
  worldId:string; playerId:string; promotionId:string; showId:string;
  requestId:string; expectedRevision:number; currentWeekIndex:number;
  appearances:readonly BookedAppearance[];
}

/** Atomic date consumption with World revision + idempotency receipt.
 * Must only be invoked by the trusted World resolution process after a
 * validated submitted show; never expose as a player-triggered HTTP action.
 */
export async function consumeShowAppearances(pool:TransactionPool,input:ConsumeAppearancesInput) {
  if (!input.showId || input.showId.length>200) throw new Error("Invalid show");
  const appearances=uniqueShowAppearances(input.appearances);
  if (!Number.isSafeInteger(input.currentWeekIndex)||input.currentWeekIndex<0) throw new Error("Invalid week");
  if (appearances.length>100) throw new Error("Too many appearances");
  return applyWorldCommand(pool,{
    worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
    expectedRevision:input.expectedRevision,commandType:"CONSUME_SHOW_APPEARANCES",
    execute:async tx=>{
      const previous=await tx.query<{show_id:string}>(
        "SELECT show_id FROM ppw_show_resolutions WHERE world_id=$1 AND show_id=$2",
        [input.worldId,input.showId],
      );
      if(previous.length) throw new Error("Show already resolved");
      let charged=0;
      for(const a of appearances) {
        const rows=await tx.query<{contract_id:string}>(
          `UPDATE ppw_contracts SET remaining_dates=remaining_dates-1
           WHERE world_id=$1 AND promotion_id=$2 AND person_id=$3 AND contract_id=$4
             AND status='SIGNED' AND family IN ('ONE_OFF','LIMITED_NON_EXCLUSIVE','EXCLUSIVE')
             AND remaining_dates>0 AND expires_week_index>=$5
           RETURNING contract_id`,
          [input.worldId,input.promotionId,a.personId,a.contractId,input.currentWeekIndex],
        );
        if(rows.length===1) { charged++; continue; }
        const unlimited=await tx.query<{contract_id:string}>(
          `SELECT contract_id FROM ppw_contracts WHERE world_id=$1 AND promotion_id=$2
           AND person_id=$3 AND contract_id=$4 AND family='EXCLUSIVE'
           AND status='SIGNED' AND remaining_dates IS NULL AND expires_week_index>=$5`,
          [input.worldId,input.promotionId,a.personId,a.contractId,input.currentWeekIndex],
        );
        if(unlimited.length!==1) throw new Error("Contract unavailable for show: "+a.contractId);
      }
      await tx.query(
        "INSERT INTO ppw_show_resolutions(world_id,show_id,promotion_id,resolved_week_index,command_request_id,performers_count,dates_charged) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [input.worldId,input.showId,input.promotionId,input.currentWeekIndex,input.requestId,appearances.length,charged],
      );
      return {performers:appearances.length,datesCharged:charged};
    },
  });
}
