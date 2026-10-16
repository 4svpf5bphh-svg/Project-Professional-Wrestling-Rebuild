/** Trusted, bounded World resolution with durable stage checkpoints.
 * Never player callable, never advances without audited certification.
 */
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {resolveWorldWeekShows} from "./world-week-show-coordinator.js";
import {advanceResolvedWorldWeek} from "./week-advancement.js";
import {recordWeekContinuity} from "./week-continuity.js";
import {finalizePreparedWorldShows} from "./finalize-prepared-shows.js";
import {beginWorldResolution} from "./world-lock.js";
import {clearWorldWeekResources} from "./week-clearance.js";
import {inspectWeekConflicts} from "./week-conflicts.js";
import {generateWeekStaffFallbackCards} from "./generate-staff-fallback-cards.js";
import {consumeWorldWeekAppearances} from "./world-week-appearance-coordinator.js";
import {certifyResolvedWorldWeek} from "./week-certification.js";
import {previewWorldWeekArbitration} from "./week-arbitration.js";
import {recordWorldWeekArbitration} from "./recorded-week-arbitration.js";
import {applyAiWeekRemediation} from "./apply-ai-remediation.js";
import {inspectWorldArbitrationRecovery} from "./world-arbitration-coordinator.js";
import type {RemediationChoice} from "../domain/resource-remediation.js";
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
 |"WAIT_FOR_WORLD_LOCK"|"BEGIN_RESOLUTION"|"ASSESS_CONTINUITY"|"FINALIZE_PREPARED_SHOWS"
 |"GENERATE_STAFF_AND_AI_CARDS"|"ARBITRATE_OR_REMEDIATE"
 |"RECORD_ARBITRATION"|"REMEDIATE_AI_CLAIM"
 |"CLEAR_RESOURCES"|"RESOLVE_LEGACY_SHOWS"
 |"RESOLVE_DETAILED_SHOWS"|"CERTIFY_WEEK"|"PUBLISH_WEEK";
export interface WorldResolutionPlan {
 year:number;week:number;action:WorldResolutionAction;
 blockers:string[];ready:ResolutionReadiness;
 arbitration?:{showId:string;sourceFingerprint:string;choice:RemediationChoice};
}
export async function planNextWorldResolutionAction(
 pool:TransactionPool,worldId:string,
):Promise<WorldResolutionPlan>{
 const ready=await inspectWorldResolutionReadiness(pool,worldId);
 let action:WorldResolutionAction;
 const blockers:string[]=[];
 let arbitration:WorldResolutionPlan["arbitration"];
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
   "BEGIN_RESOLUTION";
 }else if(ready.phase==="RESOLVING"){
  if(ready.submitted!==ready.active){
   const run=await withWorldTransaction(pool,tx=>tx.query<{done:boolean}>(`SELECT EXISTS(SELECT 1 FROM ppw_week_staff_fallback_runs WHERE world_id=$1 AND year=$2 AND week=$3) AS done`,[worldId,ready.year,ready.week]));
   if(run.length!==1)throw new Error("Staff fallback checkpoint missing");
   action=run[0]!.done?"ARBITRATE_OR_REMEDIATE":"GENERATE_STAFF_AND_AI_CARDS";
   blockers.push(run[0]!.done?"MISSING_PROMOTION_SHOWS_AFTER_STAFF":"MISSING_PROMOTION_SHOWS");
  }else if(ready.cleared!==ready.active){
   if(ready.cleared!==null){
    action="ARBITRATE_OR_REMEDIATE";
    blockers.push("INCONSISTENT_RESOURCE_CLEARANCE");
   }else{
    const report=await withWorldTransaction(pool,tx=>inspectWeekConflicts(tx,worldId));
    if(report.provisionalClear)action="CLEAR_RESOURCES";
    else{
     blockers.push(...new Set(report.blockers.map(b=>b.code)));
     const arbitrable=new Set(["VENUE_DAY_CONFLICT","WRESTLER_DAY_CONFLICT",
       "WRESTLER_WEEK_CAPACITY"]);
     if(!report.blockers.length||report.blockers.some(b=>!arbitrable.has(b.code)))
      action="ARBITRATE_OR_REMEDIATE";
     else{
      const recovery=await inspectWorldArbitrationRecovery(pool,worldId);
      if(recovery.status==="NEEDS_PROPOSAL")action="RECORD_ARBITRATION";
      else if(recovery.status==="AI_REMEDIATION"){
       action="REMEDIATE_AI_CLAIM";
       arbitration={showId:recovery.showId,
        sourceFingerprint:recovery.sourceFingerprint,choice:recovery.choice};
      }else{
       action="ARBITRATE_OR_REMEDIATE";
       blockers.push(recovery.status==="STALE_PROPOSAL"
         ?"STALE_ARBITRATION_PROPOSAL":"HUMAN_OR_CREATIVE_REBOOK_REQUIRED");
      }
     }
    }
   }
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
  blockers,ready,...(arbitration?{arbitration}:{})};
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
 if(plan.action==="ASSESS_CONTINUITY"){
  const result=await recordWeekContinuity(pool,{worldId,requestId,expectedRevision});
  return {action:plan.action,status:"EXECUTED" as const,result};
 }
 if(plan.action==="FINALIZE_PREPARED_SHOWS"){
  const result=await finalizePreparedWorldShows(pool,{worldId,requestId,expectedRevision});
  return {action:plan.action,status:"EXECUTED" as const,result};
 }
 if(plan.action==="BEGIN_RESOLUTION"){
  const result=await beginWorldResolution(pool,{worldId,requestId,expectedRevision});
  return {action:plan.action,status:"EXECUTED" as const,result};
 }
 if(plan.action==="GENERATE_STAFF_AND_AI_CARDS"&&plan.ready.phase==="RESOLVING"){
  const result=await generateWeekStaffFallbackCards(pool,{worldId,requestId,expectedRevision});
  return {action:plan.action,status:"EXECUTED" as const,result};
 }
 if(plan.action==="RECORD_ARBITRATION"){
  const preview=await previewWorldWeekArbitration(pool,worldId);
  const result=await recordWorldWeekArbitration(pool,{worldId,requestId,
   expectedRevision,expectedStateFingerprint:preview.stateFingerprint});
  if(result.status==="STALE")return {action:plan.action,
   status:"BLOCKED" as const,blockers:["WORLD_REVISION_CHANGED"]};
  return {action:plan.action,status:"EXECUTED" as const,result};
 }
 if(plan.action==="REMEDIATE_AI_CLAIM"){
  if(!plan.arbitration)throw new Error("Missing authorized AI remedy");
  const result=await applyAiWeekRemediation(pool,{worldId,requestId,
   expectedRevision,showId:plan.arbitration.showId,
   expectedStateFingerprint:plan.arbitration.sourceFingerprint,
   choice:plan.arbitration.choice});
  if(result.status==="STALE")return {action:plan.action,
   status:"BLOCKED" as const,blockers:["WORLD_REVISION_CHANGED"]};
  return {action:plan.action,status:"EXECUTED" as const,result};
 }
 if(plan.action==="CLEAR_RESOURCES"){
  const result=await clearWorldWeekResources(pool,{worldId,requestId,expectedRevision});
  return {action:plan.action,status:"EXECUTED" as const,result};
 }
 if(plan.action==="RESOLVE_LEGACY_SHOWS"){
  const result=await consumeWorldWeekAppearances(pool,{worldId,year:plan.year,week:plan.week,resolutionId});
  return {action:plan.action,status:"EXECUTED" as const,result};
 }
 if(plan.action==="RESOLVE_DETAILED_SHOWS"){
  const result=await runWorldShowResolutionPhase(pool,{
   worldId,year:plan.year,week:plan.week,resolutionId});
  return {action:plan.action,status:"EXECUTED" as const,result};
 }
 if(plan.action==="CERTIFY_WEEK"){
  const result=await certifyResolvedWorldWeek(pool,{worldId,requestId,expectedRevision});
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

/** Bounded server-side recovery driver. Executes a sequence of trusted
 * stages and stops at the first unresolved decision. Each command has a
 * unique week/stage request ID; World revision is reread before execution.
 * No timer, HTTP route or background process is installed by this module.
 */
export async function driveWorldResolution(
 pool:TransactionPool,input:{worldId:string;resolutionId:string;maxStages?:number},
){
 const maxStages=input.maxStages??8;
 if(!input.worldId||!input.resolutionId||!Number.isSafeInteger(maxStages)||
  maxStages<1||maxStages>16)throw new Error("Invalid World driver scope");
 const steps:{action:WorldResolutionAction;status:"EXECUTED"|"BLOCKED"}[]=[];
 for(let i=0;i<maxStages;i++){
  const plan=await planNextWorldResolutionAction(pool,input.worldId);
  const blocked=new Set<WorldResolutionAction>([
   "WAIT_FOR_WORLD_LOCK","ARBITRATE_OR_REMEDIATE",
  ]);
  if(blocked.has(plan.action)){
   steps.push({action:plan.action,status:"BLOCKED"});
   return {status:"BLOCKED" as const,steps,blockers:plan.blockers};
  }
  const revision=await withWorldTransaction(pool,async tx=>{
   const rows=await tx.query<{revision:number|string;year:number;week:number}>(
    "SELECT revision,year,week FROM ppw_worlds WHERE world_id=$1 FOR UPDATE",
    [input.worldId]);
   if(rows.length!==1||rows[0]!.year!==plan.year||
    rows[0]!.week!==plan.week)throw new Error("World changed during resolution drive");
   const n=Number(rows[0]!.revision);
   if(!Number.isSafeInteger(n)||n<0)throw new Error("Invalid World revision");
   return n;
  });
  // Each AI remedy changes the evidence fingerprint. A fixed stage-only
  // request ID would replay the FIRST remedy forever for later contenders.
  const suffix=plan.action==="REMEDIATE_AI_CLAIM"
    ?":"+plan.arbitration!.sourceFingerprint.slice(0,24):"";
  const requestId=`${input.resolutionId}:${plan.year}:${plan.week}:${plan.action}${suffix}`;
  if(requestId.length>200)throw new Error("World stage request ID exceeds limit");
  const result=await executeNextWorldResolutionStage(pool,{
   worldId:input.worldId,resolutionId:input.resolutionId,
   requestId,expectedRevision:revision,
  });
  steps.push({action:result.action,status:result.status});
  if(result.status==="BLOCKED")
   return {status:"BLOCKED" as const,steps,blockers:result.blockers};
  if(result.action==="PUBLISH_WEEK")
   return {status:"PUBLISHED" as const,steps,blockers:[]};
 }
 return {status:"LIMIT_REACHED" as const,steps,blockers:[]};
}
