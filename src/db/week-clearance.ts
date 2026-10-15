import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {inspectWeekConflicts} from "./week-conflicts.js";

export interface ClearWorldWeekResourcesInput {
  worldId:string; requestId:string; expectedRevision:number;
}

/** Trusted, pre-resolution gate, NEVER a player action.
 * An entire week's bookings are validated BEFORE any show can charge dates.
 * No "first card processed wins": contested shows leave the World blocked for
 * an explicit, deterministic arbitration/staff decision in a future slice.
 */
export async function clearWorldWeekResources(pool:TransactionPool,input:ClearWorldWeekResourcesInput) {
  return applyWorldCommand(pool,{
    worldId:input.worldId,playerId:"system",requestId:input.requestId,
    expectedRevision:input.expectedRevision,commandType:"CLEAR_WORLD_WEEK_RESOURCES",
    execute:async tx=>{
      // The World is locked by applyWorldCommand. No player can change the
      // schedule through the booking mutation boundary after World Lock.
      const report=await inspectWeekConflicts(tx,input.worldId);
      if(!report.provisionalClear || report.submittedShows!==report.activePromotions)
        throw new Error("Week resources blocked: "+[...new Set(report.blockers.map(b=>b.code))].join(","));
      const weekIndex=(report.year-1)*52+report.week-1;
      if(!Number.isSafeInteger(weekIndex)||weekIndex<0) throw new Error("Invalid World week");
      const prior=await tx.query<{has_resolved:boolean;already_cleared:boolean}>(
        `SELECT EXISTS(SELECT 1 FROM ppw_show_resolutions
           WHERE world_id=$1 AND resolved_week_index=$2) AS has_resolved,
          EXISTS(SELECT 1 FROM ppw_week_resource_clearances
           WHERE world_id=$1 AND year=$3 AND week=$4) AS already_cleared`,
        [input.worldId,weekIndex,report.year,report.week],
      );
      if(prior.length!==1) throw new Error("Resource clearance lookup failed");
      if(prior[0]!.already_cleared) throw new Error("World week already cleared");
      if(prior[0]!.has_resolved) throw new Error("Cannot clear after show resolution");
      await tx.query(
        `INSERT INTO ppw_week_resource_clearances
         (world_id,year,week,eligible_promotions,inspected_slots,command_request_id)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [input.worldId,report.year,report.week,report.activePromotions,report.inspectedSlots,input.requestId],
      );
      return {year:report.year,week:report.week,
        eligiblePromotions:report.activePromotions,inspectedSlots:report.inspectedSlots};
    },
  });
}
