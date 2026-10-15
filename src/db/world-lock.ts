import type { TransactionPool } from "./transaction.js";
import { applyWorldCommand } from "./world-commands.js";

export interface LockWorldWeekInput {
  worldId:string; requestId:string; expectedRevision:number;
}

/** The ONE weekly deadline. Only server scheduler code invokes this.
 * Every player booking mutation must separately enforce phase OPEN and
 * next_lock_at > now(), even when a scheduler worker is delayed.
 */
export async function lockWorldWeek(pool:TransactionPool,input:LockWorldWeekInput) {
  return applyWorldCommand(pool,{
    worldId:input.worldId,playerId:"system",requestId:input.requestId,
    expectedRevision:input.expectedRevision,commandType:"LOCK_WORLD_WEEK",
    execute:async tx=>{
      const clocks=await tx.query<{year:number;week:number;phase:string;due:boolean}>(
        "SELECT year,week,phase,(next_lock_at<=clock_timestamp()) AS due FROM ppw_worlds WHERE world_id=$1",
        [input.worldId],
      );
      if(clocks.length!==1) throw new Error("World not found");
      const {year,week,phase,due}=clocks[0]!;
      if(phase!=="OPEN") throw new Error("World is not open");
      if(!due) throw new Error("World deadline not reached");
      if(!Number.isSafeInteger(year)||year<1||!Number.isSafeInteger(week)||week<1||week>52) throw new Error("Invalid World clock");
      const weekIndex=(year-1)*52+week-1;
      if(!Number.isSafeInteger(weekIndex)) throw new Error("Invalid World week");
      const locked=await tx.query<{world_id:string}>(
        "UPDATE ppw_worlds SET phase='LOCKED' WHERE world_id=$1 AND phase='OPEN' AND next_lock_at<=clock_timestamp() RETURNING world_id",
        [input.worldId],
      );
      if(locked.length!==1) throw new Error("World lock failed");
      return {year,week,weekIndex};
    },
  });
}

export interface BeginWorldResolutionInput {
  worldId:string; requestId:string; expectedRevision:number;
}

/** Internal processing after the single World Lock; NOT a second deadline.
 * Date consumption is separately gated on RESOLVING.
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
