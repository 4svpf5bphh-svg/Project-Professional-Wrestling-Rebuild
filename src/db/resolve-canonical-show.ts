/** A single locked transaction for match scoring, authored segments,
 * receipt validation and durable result/evidence insertion.
 * Internal World resolver command only; do not route from player API.
 */
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {previewArchivedShowMatchScoresInTransaction}
 from "./legacy-match-scoring.js";
import {readCanonicalSegmentContextsInTransaction}
 from "./canonical-segment-evaluation.js";
import {assembleArchivedShowResolution}
 from "../simulation/assemble-archived-show-resolution.js";
import {recordCompletedShowInTransaction}
 from "./completed-show-results.js";
export interface ResolveCanonicalShowInput {
 worldId:string;promotionId:string;showId:string;
 year:number;week:number;resolutionId:string;
}
export async function resolveCanonicalShow(
 pool:TransactionPool,input:ResolveCanonicalShowInput,
):Promise<"RECORDED"|"IDENTICAL_RETRY">{
 return withWorldTransaction(pool,async tx=>{
  const projection=await previewArchivedShowMatchScoresInTransaction(tx,input);
  if(projection.year!==input.year||projection.week!==input.week)
   throw new Error("Canonical show week differs from World resolution");
  const segments=await readCanonicalSegmentContextsInTransaction(tx,input);
  const completed=assembleArchivedShowResolution(projection,segments,input.resolutionId);
  return recordCompletedShowInTransaction(tx,completed.receipt,completed.evidence);
 });
}
