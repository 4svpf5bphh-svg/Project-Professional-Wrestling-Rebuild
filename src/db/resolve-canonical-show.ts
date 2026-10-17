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
import {describeAuthoredSegment} from "../domain/segment-results.js";
import {authoredConsequenceIntents} from "../domain/segment-consequences.js";
import {settleCompletedProgrammeHistory} from "./programme-resolution-history.js";
import {settleCanonicalAuthoredTurns} from "./segment-alignment-settlement.js";
import {assembleArchivedShowResolution}
 from "../simulation/assemble-archived-show-resolution.js";
import {recordCompletedShowInTransaction}
 from "./completed-show-results.js";
import {settleCompletedShowEconomics} from "./show-economics.js";
import {settleCanonicalSinglesTitleContests} from "./championship-settlement.js";
import {settleCanonicalTagTitleContests} from "./tag-championship-settlement.js";
import {settleCanonicalTagCareerConsequences} from "./tag-career-settlement.js";
import {settleMultiIndividualCareerConsequences} from "./multi-individual-career-settlement.js";
export interface ResolveCanonicalShowInput {
 worldId:string;promotionId:string;showId:string;
 year:number;week:number;resolutionId:string;
}
export async function resolveCanonicalShow(
 pool:TransactionPool,input:ResolveCanonicalShowInput,
):Promise<"RECORDED"|"IDENTICAL_RETRY">{
 return withWorldTransaction(pool,async tx=>{
  // World row serialization makes the prior-result check race-safe.
  const world=await tx.query<{year:number;week:number;phase:string;seed:string|number;
  show_economics_enabled:boolean}>(
   "SELECT year,week,phase,seed,show_economics_enabled FROM ppw_worlds WHERE world_id=$1 FOR UPDATE",
   [input.worldId]);
  if(world.length!==1||world[0]!.year!==input.year||
   world[0]!.week!==input.week||world[0]!.phase!=="RESOLVING")
   throw new Error("World is not resolving the requested week");
  const existing=await tx.query<{resolution_id:string}>(
   "SELECT resolution_id FROM ppw_completed_shows WHERE world_id=$1 AND show_id=$2",
   [input.worldId,input.showId]);
  if(existing.length){
   if(existing.length!==1||existing[0]!.resolution_id!==input.resolutionId)
    throw new Error("Conflicting completed show resolution");
   return "IDENTICAL_RETRY";
  }
  const projection=await previewArchivedShowMatchScoresInTransaction(tx,input);
  if(projection.year!==input.year||projection.week!==input.week)
   throw new Error("Canonical show week differs from World resolution");
  const segments=await readCanonicalSegmentContextsInTransaction(tx,input);
  const completed=assembleArchivedShowResolution(projection,segments,input.resolutionId);
  const stories=segments.map(({segment,performers})=>{
   const names=new Map(performers.map(p=>[p.personId,p.name??p.personId]));
   const story=describeAuthoredSegment(segment,names);
   const intent=authoredConsequenceIntents(segment)[0]?.intent??null;
   return {...story,intent};
  });
  const recorded=await recordCompletedShowInTransaction(
   tx,completed.receipt,completed.evidence,stories);
  if(recorded==="RECORDED"){
   await settleCompletedProgrammeHistory(tx,{
    ...input,eventImportance:projection.eventImportance,
    matches:projection.projections.map(p=>({
     slotId:p.slotId,executionQuality:p.score.executionQuality})),
   },completed.receipt);
   await settleCanonicalAuthoredTurns(tx,input,segments);
   if(projection.titleBookings.length)
    await settleCanonicalSinglesTitleContests(tx,completed.receipt,projection.titleBookings);
   if(projection.tagTitleBookings.length)
    await settleCanonicalTagTitleContests(tx,completed.receipt,projection.tagTitleBookings);
   await settleCanonicalTagCareerConsequences(tx,projection);
   await settleMultiIndividualCareerConsequences(tx,projection);
  }
  if(recorded==="RECORDED"&&world[0]!.show_economics_enabled)
   await settleCompletedShowEconomics(tx,{
     ...input,averageMatchRating:Math.round(
       projection.projections.reduce((sum,m)=>sum+m.score.criticalRatingStars,0)/
       projection.projections.length*100)/100,
    });
  return recorded;
 });
}
