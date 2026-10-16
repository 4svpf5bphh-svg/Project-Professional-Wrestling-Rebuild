/** Trusted, resumable World resolution runner.
 * This phase intentionally starts AFTER continuity, staff/AI preparation,
 * arbitration and clearance. It cannot invent a show or certify a week.
 * A later phase will own certification and calendar advancement.
 */
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {resolveWorldWeekShows} from "./world-week-show-coordinator.js";
export type ResolutionReadiness={
 year:number;week:number;phase:string;active:number;submitted:number;
 cleared:number|null;certified:number|null;legacyResolved:number;
 detailedResolved:number;blockers:string[];
};
export async function inspectWorldResolutionReadiness(
 pool:TransactionPool,worldId:string,
):Promise<ResolutionReadiness>{
 if(!worldId)throw new Error("World ID required");
 return withWorldTransaction(pool,async tx=>{
  const w=await tx.query<{year:number;week:number;phase:string}>(
   "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1 FOR UPDATE",[worldId]);
  if(w.length!==1)throw new Error("World not found");
  const {year,week,phase}=w[0]!;
  const rows=await tx.query<{
   active:number;submitted:number;cleared:number|null;
   certified:number|null;legacy_resolved:number;detailed_resolved:number;
  }>(`SELECT
     (SELECT count(*)::integer FROM ppw_promotions WHERE world_id=$1
        AND lifecycle='ACTIVE') AS active,
     (SELECT count(*)::integer FROM ppw_booking_drafts WHERE world_id=$1
        AND year=$2 AND week=$3 AND status='SUBMITTED') AS submitted,
     (SELECT eligible_promotions FROM ppw_week_resource_clearances
        WHERE world_id=$1 AND year=$2 AND week=$3) AS cleared,
     (SELECT certified_promotions FROM ppw_week_resolution_seals
        WHERE world_id=$1 AND year=$2 AND week=$3) AS certified,
     (SELECT count(*)::integer FROM ppw_show_resolutions
        WHERE world_id=$1 AND resolved_week_index=$4) AS legacy_resolved,
     (SELECT count(*)::integer FROM ppw_completed_shows
        WHERE world_id=$1 AND year=$2 AND week=$3) AS detailed_resolved`,
   [worldId,year,week,(year-1)*52+week-1]);
  if(rows.length!==1)throw new Error("World readiness query failed");
  const r=rows[0]!,blockers:string[]=[];
  if(phase!=="RESOLVING")blockers.push("WORLD_NOT_RESOLVING");
  if(r.active<1||r.active>128)blockers.push("INVALID_ACTIVE_PROMOTION_COUNT");
  if(r.submitted!==r.active)blockers.push("SHOWS_NOT_SUBMITTED");
  if(r.cleared!==r.active)blockers.push("RESOURCES_NOT_CLEARED");
  if(r.legacy_resolved>r.active||r.detailed_resolved>r.active)
   blockers.push("EXCESS_RESOLUTION_RECEIPTS");
  return {year,week,phase,active:r.active,submitted:r.submitted,
   cleared:r.cleared,certified:r.certified,legacyResolved:r.legacy_resolved,
   detailedResolved:r.detailed_resolved,blockers};
 });
}
export interface RunWorldShowPhaseInput{
 worldId:string;year:number;week:number;resolutionId:string;
}
/** Only the detailed-result stage. Never advances the World, charges dates,
 * fabricates a legacy receipt, or marks a week certified.
 * Caller must first run the separate authoritative date-charge stage.
 */
export async function runWorldShowResolutionPhase(
 pool:TransactionPool,input:RunWorldShowPhaseInput,
){
 const before=await inspectWorldResolutionReadiness(pool,input.worldId);
 if(before.year!==input.year||before.week!==input.week)
  throw new Error("World week changed before resolution");
 if(before.blockers.length)throw new Error(
  "World show resolution blocked: "+before.blockers.join(","));
 if(before.legacyResolved!==before.active)
  throw new Error("Legacy date-charge resolution incomplete");
 const result=await resolveWorldWeekShows(pool,input);
 const after=await inspectWorldResolutionReadiness(pool,input.worldId);
 if(after.year!==input.year||after.week!==input.week||
  after.detailedResolved!==after.active||after.blockers.length)
  throw new Error("World show resolution did not complete cleanly");
 return {result,readiness:after};
}
