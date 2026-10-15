import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {inspectWeekConflicts} from "./week-conflicts.js";
import {planResourceArbitration} from "../domain/resource-arbitration.js";

/** Trusted server-only planning, not a persistent allocation or user action.
 * All inputs are read under one authoritative World transaction, reusing the
 * exact same weekly inspection queries. There is no additional SQL per claim.
 */
export async function previewWorldWeekArbitration(pool:TransactionPool,worldId:string) {
  return withWorldTransaction(pool,async tx=>{
    const report=await inspectWeekConflicts(tx,worldId);
    const plan=planResourceArbitration({
      worldId,worldSeed:report.worldSeed,year:report.year,week:report.week,
    },report.arbitrationClaims);
    return {
      year:report.year,week:report.week,sourceFingerprint:plan.fingerprint,
      stateFingerprint:report.stateFingerprint,
      contestedPromotions:plan.contestedPromotions,outcomes:plan.outcomes,
      unresolvedBlockers:report.blockers.map(b=>b.code).filter((code,i,arr)=>arr.indexOf(code)===i),
      /** Only a PROPOSAL. Decisions require staff remediation and reinspection
       * before granting the existing weekly clearance. */
      canClearWithoutRemediation:report.provisionalClear,
    };
  });
}
