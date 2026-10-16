/** Trusted, resumable World resolution runner.
 * This phase intentionally starts AFTER continuity, staff/AI preparation,
 * arbitration and clearance. It cannot invent a show or certify a week.
 * A later phase will own certification and calendar advancement.
 */
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {resolveWorldWeekShows} from "./world-week-show-coordinator.js";
import {advanceResolvedWorldWeek} from "./week-advancement.js";
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
/** Deterministic, read-only next-action decision for the trusted resolver.
 * It never silently resolves conflicts or invents human-authored shows.
 */
export type WorldResolutionAction=
 |"WAIT_FOR_WORLD_LOCK"|"ASSESS_CONTINUITY"|"FINALIZE_PREPARED_SHOWS"
 |"GENERATE_STAFF_AND_AI_CARDS"|"ARBITRATE_OR_REMEDIATE"
 |"CLEAR_RESOURCES"|"RESOLVE_LEGACY_SHOWS"
 |"RESOLVE_DETAILED_SHOWS"|"CERTIFY_WEEK"|"PUBLISH_WEEK";
export interface WorldResolutionPlan {
 year:number;week:number;action:WorldResolutionAction;
 blockers:string[];ready:ResolutionReadiness;
}
export async function planNextWorldResolutionAction(
 pool:TransactionPool,worldId:string,
):Promise<WorldResolutionPlan>{
 const ready=await inspectWorldResolutionReadiness(pool,worldId);
 let action:WorldResolutionAction;
 const blockers:string[]=[];
 if(ready.phase==="OPEN")action="WAIT_FOR_WORLD_LOCK";
 else if(ready.phase==="LOCKED"){
  const stages=await withWorldTransaction(pool,tx=>tx.query<{
   assessed:boolean;finalized:boolean;
  }>(`SELECT
   EXISTS(SELECT 1 FROM ppw_week_continuity_assessments
    WHERE world_id=$1 AND year=$2 AND week=$3) AS assessed,
   EXISTS(SELECT 1 FROM ppw_week_prepared_finalizations
    WHERE world_id=$1 AND year=$2 AND week=$3) AS finalized`,
   [worldId,ready.year,ready.week]));
  if(stages.length!==1)throw new Error("World preparation state missing");
  action=!stages[0]!.assessed?"ASSESS_CONTINUITY":
   !stages[0]!.finalized?"FINALIZE_PREPARED_SHOWS":
   "GENERATE_STAFF_AND_AI_CARDS";
 }else if(ready.phase==="RESOLVING"){
  if(ready.submitted!==ready.active){
   action="GENERATE_STAFF_AND_AI_CARDS";
   blockers.push("MISSING_PROMOTION_SHOWS");
  }else if(ready.cleared!==ready.active){
   action="ARBITRATE_OR_REMEDIATE";
   blockers.push("RESOURCE_CLEARANCE_PENDING");
  }else if(ready.legacyResolved!==ready.active)
   action="RESOLVE_LEGACY_SHOWS";
  else if(ready.detailedResolved!==ready.active)
   action="RESOLVE_DETAILED_SHOWS";
  else if(ready.certified!==ready.active)
   action="CERTIFY_WEEK";
  else action="PUBLISH_WEEK";
 }else{
  action="WAIT_FOR_WORLD_LOCK";
  blockers.push("UNKNOWN_WORLD_PHASE");
 }
 return {year:ready.year,week:ready.week,action,
  blockers,ready};
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

/** Final server-only publication phase. A caller must have completed
 * resource arbitration, date charges, detailed results and certification.
 * The existing transactional advancement command rechecks all invariants.
 * No extra deadline, no cron, and no player-facing shortcut.
 */
export async function publishResolvedWorldWeek(
 pool:TransactionPool,input:{worldId:string;year:number;week:number;
 requestId:string;expectedRevision:number},
){
 const ready=await inspectWorldResolutionReadiness(pool,input.worldId);
 if(ready.year!==input.year||ready.week!==input.week)
  throw new Error("World week changed before publication");
 if(ready.blockers.length)throw new Error(
  "World publication blocked: "+ready.blockers.join(","));
 if(ready.legacyResolved!==ready.active||
  ready.detailedResolved!==ready.active||
  ready.certified!==ready.active)
  throw new Error("World publication blocked: incomplete results or certification");
 return advanceResolvedWorldWeek(pool,{
  worldId:input.worldId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,
 });
}

/** Executes only safe, already-implemented transitions. A blocked stage
 * returns a reason instead of guessing staff decisions or modifying cards.
 * The caller supplies the current World revision and a durable request ID;
 * commands retain their own transaction and replay protection.
 */
export async function executeNextWorldResolutionStage(
 pool:TransactionPool,input:{worldId:string;requestId:string;
 expectedRevision:number;resolutionId:string},
){
 const plan=await planNextWorldResolutionAction(pool,input.worldId);
 const {worldId,requestId,expectedRevision,resolutionId}=input;
 if(!requestId||!resolutionId||!Number.isSafeInteger(expectedRevision)||
  expectedRevision<0)throw new Error("Invalid resolver command input");
 if(plan.action==="RESOLVE_DETAILED_SHOWS"){
  const result=await runWorldShowResolutionPhase(pool,{
   worldId,year:plan.year,week:plan.week,resolutionId});
  return {action:plan.action,status:"EXECUTED" as const,result};
 }
 if(plan.action==="PUBLISH_WEEK"){
  const result=await publishResolvedWorldWeek(pool,{
   worldId,year:plan.year,week:plan.week,requestId,expectedRevision});
  return {action:plan.action,status:"EXECUTED" as const,result};
 }
 return {action:plan.action,status:"BLOCKED" as const,
  blockers:plan.blockers.length?plan.blockers:
   ["STAGE_REQUIRES_AUTHORITATIVE_PREPARATION_OR_CERTIFICATION"]};
}
