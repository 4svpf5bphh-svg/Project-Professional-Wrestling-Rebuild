/** Final authoritative certification after every canonical show has both
 * a contract-date receipt and a completed detailed result. Never player callable.
 */
import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {inspectWeekConflicts} from "./week-conflicts.js";
export async function certifyResolvedWorldWeek(
 pool:TransactionPool,input:{worldId:string;requestId:string;expectedRevision:number},
){
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:"system",requestId:input.requestId,
  expectedRevision:input.expectedRevision,commandType:"CERTIFY_RESOLVED_WORLD_WEEK",
  execute:async tx=>{
   const w=await tx.query<{year:number;week:number;phase:string}>(
    "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",[input.worldId]);
   if(w.length!==1||w[0]!.phase!=="RESOLVING")
    throw new Error("World must be resolving before certification");
   const {year,week}=w[0]!;
   const index=(year-1)*52+week-1;
   const report=await inspectWeekConflicts(tx,input.worldId);
   if(!report.provisionalClear||report.submittedShows!==report.activePromotions||
    report.activePromotions<1||report.activePromotions>128)
    throw new Error("Cannot certify unresolved World conflicts or missing shows");
   const rows=await tx.query<{
    required:number;paired:number;cleared:number|null;already:boolean;
   }>(`SELECT
    count(*)::integer AS required,
    count(*) FILTER(WHERE d.draft_id IS NOT NULL
      AND r.show_id IS NOT NULL AND c.show_id IS NOT NULL
      AND c.promotion_id=p.promotion_id AND c.year=$2 AND c.week=$3)::integer AS paired,
    (SELECT eligible_promotions FROM ppw_week_resource_clearances
      WHERE world_id=$1 AND year=$2 AND week=$3) AS cleared,
    EXISTS(SELECT 1 FROM ppw_week_resolution_seals
      WHERE world_id=$1 AND year=$2 AND week=$3) AS already
    FROM ppw_promotions p
    LEFT JOIN ppw_booking_drafts d ON d.world_id=p.world_id
      AND d.promotion_id=p.promotion_id AND d.year=$2 AND d.week=$3
      AND d.status='SUBMITTED'
    LEFT JOIN ppw_show_resolutions r ON r.world_id=d.world_id
      AND r.show_id=d.draft_id AND r.promotion_id=p.promotion_id
      AND r.resolved_week_index=$4
    LEFT JOIN ppw_completed_shows c ON c.world_id=d.world_id
      AND c.show_id=d.draft_id
    WHERE p.world_id=$1 AND p.lifecycle='ACTIVE'`,
    [input.worldId,year,week,index]);
   if(rows.length!==1||rows[0]!.already)
    throw new Error("Week already certified or missing certification state");
   if(rows[0]!.required!==report.activePromotions||
    rows[0]!.paired!==report.activePromotions||
    rows[0]!.cleared!==report.activePromotions)
    throw new Error("Cannot certify: canonical date charges and completed results disagree");
   await tx.query(
    "INSERT INTO ppw_week_resolution_seals(world_id,year,week,certified_promotions) VALUES($1,$2,$3,$4)",
    [input.worldId,year,week,report.activePromotions]);
   return {year,week,certifiedPromotions:report.activePromotions};
  },
 });
}
