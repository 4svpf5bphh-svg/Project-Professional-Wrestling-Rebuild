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
import {recordCompletedMatchReportFactsInTransaction}
 from "./record-match-report-facts.js";
import {applyVerifiedMedicalLoadInTransaction} from "./medical-availability.js";
import {settleCompletedShowEconomics} from "./show-economics.js";
import {settleCanonicalSinglesTitleContests} from "./championship-settlement.js";
import {settleCanonicalTagTitleContests} from "./tag-championship-settlement.js";
import {settleCanonicalTagCareerConsequences} from "./tag-career-settlement.js";
import {settleWorkingPartnerships} from "./working-relationship-settlement.js";
import {settleMultiIndividualCareerConsequences} from "./multi-individual-career-settlement.js";
import {deriveCompletedMatchReportFacts} from "./record-match-report-facts.js";
import {recordRoadAgentReport} from "./road-agent-report.js";
import {calculateGorillaShow,recordGorillaShow} from "./gorilla-position.js";
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
  const facts=deriveCompletedMatchReportFacts(projection);
  const gorilla=await calculateGorillaShow(tx,world[0]!.seed,completed.receipt,facts);
  const receipt=gorilla?{...completed.receipt,crowdResponse:gorilla.crowdAfter}:completed.receipt;
  const stories=segments.map(({segment,performers})=>{
   const names=new Map(performers.map(p=>[p.personId,p.name??p.personId]));
   const story=describeAuthoredSegment(segment,names);
   const intent=authoredConsequenceIntents(segment)[0]?.intent??null;
   return {...story,intent};
  });
  const recorded=await recordCompletedShowInTransaction(
   tx,receipt,completed.evidence,stories);
  if(recorded==="RECORDED"){
   // One immutable batch in the same World transaction as completed results.
   const certifiedInjuries=await recordCompletedMatchReportFactsInTransaction(tx,projection);
   await recordRoadAgentReport(tx,world[0]!.seed,receipt,facts);
   if(gorilla)await recordGorillaShow(tx,receipt,gorilla);
   await settleCompletedProgrammeHistory(tx,{
    ...input,eventImportance:projection.eventImportance,
    matches:projection.projections.map(p=>({
     slotId:p.slotId,executionQuality:p.score.executionQuality})),
   },receipt);
   await settleCanonicalAuthoredTurns(tx,input,segments);
   if(projection.titleBookings.length)
    await settleCanonicalSinglesTitleContests(tx,receipt,projection.titleBookings);
   if(projection.tagTitleBookings.length)
    await settleCanonicalTagTitleContests(tx,receipt,projection.tagTitleBookings);
   await settleCanonicalTagCareerConsequences(tx,projection);
   await settleMultiIndividualCareerConsequences(tx,projection);
   await settleWorkingPartnerships(tx,{
    ...input,matches:projection.projections.flatMap(p=>{
     const sides=p.tag?.layout.sides;
     if(!sides||sides.length!==2||sides.some(s=>s.participants.length!==2))
      return [];
     return [{matchId:p.slotId,executionQuality:p.score.executionQuality,
      sideA:sides[0]!.participants.map(x=>x.personId),
      sideB:sides[1]!.participants.map(x=>x.personId)}];
    })
   });
   // Post-career-load severity floor and wear match original PPW,
   // without changing the winner, finish or any scripted outcome.
   await applyVerifiedMedicalLoadInTransaction(tx,input.worldId,certifiedInjuries);
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
