import type { TransactionPool } from "./transaction.js";
import { applyWorldCommand } from "./world-commands.js";

export interface BeginWorldResolutionInput {
  worldId:string; requestId:string; expectedRevision:number;
}

/** Server-side only. The scheduler must first close the card submission deadline
 * and set the World to LOCKED. This transition never runs from player HTTP.
 * Date consumption is separately gated on the resulting RESOLVING phase.
 */
export async function beginWorldResolution(pool:TransactionPool,input:BeginWorldResolutionInput) {
  return applyWorldCommand(pool,{
    worldId:input.worldId,playerId:"system",requestId:input.requestId,
    expectedRevision:input.expectedRevision,commandType:"BEGIN_WORLD_RESOLUTION",
    execute:async tx=>{
      const clocks=await tx.query<{year:number;week:number;phase:string}>(
        "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",
        [input.worldId],
      );
      if(clocks.length!==1 || clocks[0]!.phase!=="LOCKED") throw new Error("World must be locked before resolution");
      const {year,week}=clocks[0]!;
      if(!Number.isSafeInteger(year)||year<1||!Number.isSafeInteger(week)||week<1||week>52) throw new Error("Invalid World clock");
      const weekIndex=(year-1)*52+week-1;
      if(!Number.isSafeInteger(weekIndex)) throw new Error("Invalid World week");
      const updated=await tx.query<{world_id:string}>(
        "UPDATE ppw_worlds SET phase='RESOLVING' WHERE world_id=$1 AND phase='LOCKED' RETURNING world_id",
        [input.worldId],
      );
      if(updated.length!==1) throw new Error("World phase changed");
      return {year,week,weekIndex};
    },
  });
}
