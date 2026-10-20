import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {lockWorldWeek} from "./world-lock.js";
import {driveWorldResolution} from "./world-resolution-pipeline.js";

/** Explicit, resumable single-week preview test control. Never run from
 * ordinary World reads, a timer, a cron, or an unauthenticated client.
 */
export async function advancePlaytestWeek(pool:TransactionPool,worldId:string,
 expectedYear:number,expectedWeek:number){
 if(!worldId||!Number.isSafeInteger(expectedYear)||expectedYear<1||
  !Number.isSafeInteger(expectedWeek)||expectedWeek<1||expectedWeek>52)
  throw new Error("Invalid preview week request");
 const gate=await withWorldTransaction(pool,async tx=>{
  const rows=await tx.query<{year:number;week:number;phase:string;revision:number|string}>(
   "SELECT year,week,phase,revision FROM ppw_worlds WHERE world_id=$1 FOR UPDATE",
   [worldId]);
  const w=rows[0];
  if(!w||rows.length!==1||w.year!==expectedYear||w.week!==expectedWeek||
    !["OPEN","LOCKED","RESOLVING"].includes(w.phase))
   throw new Error("The World has already progressed. Refresh Home before continuing.");
  const owners=await tx.query<{promotion_id:string;ready:boolean}>(`
   SELECT c.promotion_id,
    EXISTS(SELECT 1 FROM ppw_booking_drafts d
     WHERE d.world_id=c.world_id AND d.promotion_id=c.promotion_id
      AND d.year=$2 AND d.week=$3 AND d.booking_class='REGULAR'
      AND d.lock_ready_fingerprint IS NOT NULL) AS ready
   FROM ppw_promotion_controls c
   JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
   WHERE c.world_id=$1 AND c.active AND p.lifecycle='ACTIVE'
   ORDER BY c.promotion_id LIMIT 129`,[worldId,expectedYear,expectedWeek]);
  if(owners.length<1||owners.length>128||owners.some(x=>!x.ready))
   throw new Error("Every active human promotion must confirm its regular show before a manual World Lock.");
  if(w.phase==="OPEN"){
   // Explicitly brought forward only by this button; checked while holding
   // the shared World row lock to stop racing with two distinct managers.
   await tx.query("UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1 AND phase='OPEN'",
    [worldId]);
  }
  return {phase:w.phase,revision:Number(w.revision)};
 });
 const resolutionId="manual-preview:"+worldId+":"+expectedYear+":"+expectedWeek;
 if(gate.phase==="OPEN"){
  const lock=await lockWorldWeek(pool,{worldId,
   requestId:resolutionId+":lock",expectedRevision:gate.revision});
  if(lock.status==="STALE")throw new Error("Another manager changed the World. Refresh and review.");
 }
 const result=await driveWorldResolution(pool,{worldId,resolutionId,maxStages:6});
 return {status:result.status,steps:result.steps,blockers:result.blockers,
  year:expectedYear,week:expectedWeek};
}
