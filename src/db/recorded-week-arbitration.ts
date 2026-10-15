import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {withWorldTransaction} from "./transaction.js";
import {inspectWeekConflicts} from "./week-conflicts.js";
import {planResourceArbitration} from "../domain/resource-arbitration.js";
import type {ArbitrationOutcome} from "../domain/resource-arbitration.js";

export interface RecordWeekArbitrationInput {
  worldId:string;requestId:string;expectedRevision:number;
  /** Obtained from the server-side preview; verifies full booking evidence. */
  expectedStateFingerprint:string;
}
type StoredPlan={
  source_revision:string|number;
  state_fingerprint:string;claim_fingerprint:string;
  proposal:ArbitrationOutcome[];
  disputed_count:number;
};
/** Record a PROPOSAL only; never mutate cards or mark resources cleared.
 * Called only by trusted World resolution, not player HTTP.
 */
export async function recordWorldWeekArbitration(pool:TransactionPool,input:RecordWeekArbitrationInput){
  if(!/^[a-f0-9]{64}$/.test(input.expectedStateFingerprint))throw new Error("Invalid arbitration fingerprint");
  return applyWorldCommand(pool,{
    worldId:input.worldId,playerId:"system",requestId:input.requestId,
    expectedRevision:input.expectedRevision,commandType:"RECORD_WEEK_ARBITRATION",
    execute:async(tx,sourceRevision)=>{
      const report=await inspectWeekConflicts(tx,input.worldId);
      if(report.stateFingerprint!==input.expectedStateFingerprint)
        throw new Error("Arbitration preview is stale");
      const plan=planResourceArbitration({
        worldId:input.worldId,worldSeed:report.worldSeed,year:report.year,week:report.week,
      },report.arbitrationClaims);
      if(plan.outcomes.length===0)throw new Error("No disputed resources to arbitrate");
      if(plan.outcomes.length>256)throw new Error("Arbitration exceeds compact proposal budget");
      const arbitrationCodes=new Set(["VENUE_DAY_CONFLICT","WRESTLER_DAY_CONFLICT","WRESTLER_WEEK_CAPACITY"]);
      if(report.blockers.some(b=>!arbitrationCodes.has(b.code)))
        throw new Error("Non-arbitrable World blockers must be resolved before recording proposals");
      const prior=await tx.query<{proposal_exists:boolean;has_clearance:boolean;has_resolutions:boolean}>(
        `SELECT
           EXISTS(SELECT 1 FROM ppw_week_arbitration_proposals
             WHERE world_id=$1 AND year=$2 AND week=$3) AS proposal_exists,
           EXISTS(SELECT 1 FROM ppw_week_resource_clearances
             WHERE world_id=$1 AND year=$2 AND week=$3) AS has_clearance,
           EXISTS(SELECT 1 FROM ppw_show_resolutions
             WHERE world_id=$1 AND resolved_week_index=$4) AS has_resolutions`,
        [input.worldId,report.year,report.week,(report.year-1)*52+report.week-1],
      );
      if(prior.length!==1)throw new Error("Arbitration prerequisites unavailable");
      if(prior[0]!.proposal_exists)throw new Error("Arbitration proposal already recorded");
      if(prior[0]!.has_clearance||prior[0]!.has_resolutions)
        throw new Error("Arbitration must precede resource clearance and show resolution");
      await tx.query(
        `INSERT INTO ppw_week_arbitration_proposals(
          world_id,year,week,source_revision,state_fingerprint,claim_fingerprint,
          proposal,disputed_count,command_request_id)
          VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
        [input.worldId,report.year,report.week,sourceRevision,report.stateFingerprint,
          plan.fingerprint,JSON.stringify(plan.outcomes),plan.outcomes.length,input.requestId],
      );
      return {year:report.year,week:report.week,disputedCount:plan.outcomes.length,
        sourceRevision,sourceFingerprint:report.stateFingerprint,claimFingerprint:plan.fingerprint};
    },
  });
}
/** Server-only freshness inspection: a stored proposal is never an
 * authorization to spend dates or apply outcomes. One World-scoped read plus
 * existing batched inspection; no historical scan or per-wrestler polling.
 */
export async function readRecordedWeekArbitration(pool:TransactionPool,worldId:string){
  return withWorldTransaction(pool,async tx=>{
    const world=await tx.query<{year:number;week:number;phase:string;revision:string|number}>(
      "SELECT year,week,phase,revision FROM ppw_worlds WHERE world_id=$1 FOR UPDATE",[worldId],
    );
    if(world.length!==1)throw new Error("World not found");
    if(world[0]!.phase!=="RESOLVING")throw new Error("World is not resolving");
    const {year,week}=world[0]!;
    const rows=await tx.query<StoredPlan>(
      `SELECT source_revision,state_fingerprint,claim_fingerprint,proposal,disputed_count
         FROM ppw_week_arbitration_proposals WHERE world_id=$1 AND year=$2 AND week=$3`,
      [worldId,year,week],
    );
    if(rows.length===0)return {status:"NONE" as const,year,week};
    if(rows.length!==1)throw new Error("Duplicate arbitration proposals");
    const recorded=rows[0]!;
    // The initial insert increments World revision exactly once.
    if(Number(world[0]!.revision)!==Number(recorded.source_revision)+1)
      return {status:"STALE" as const,year,week};
    const report=await inspectWeekConflicts(tx,worldId);
    const plan=planResourceArbitration({
      worldId,worldSeed:report.worldSeed,year,week,
    },report.arbitrationClaims);
    if(report.stateFingerprint!==recorded.state_fingerprint ||
      plan.fingerprint!==recorded.claim_fingerprint ||
      plan.outcomes.length!==recorded.disputed_count)
      return {status:"STALE" as const,year,week};
    return {status:"CURRENT" as const,year,week,
      sourceFingerprint:recorded.state_fingerprint,
      outcomes:recorded.proposal,disputedCount:recorded.disputed_count};
  });
}
