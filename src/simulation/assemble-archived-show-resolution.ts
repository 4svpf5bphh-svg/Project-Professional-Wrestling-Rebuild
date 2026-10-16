/** Whole-show assembly from DB-backed match projections and canonical,
 * author-owned segment evaluations. Pure: persistence remains World-owned.
 */
import type {previewArchivedShowMatchScores}
 from "../db/legacy-match-scoring.js";
import {deriveArchivedMatchEvidence}
 from "./derive-archived-match-evidence.js";
import {evaluateAuthoredSegmentCrowd,type SegmentCrowdContext}
 from "./legacy/segment-crowd.js";
import {validateCompletedShowReceipt,type CompletedShowReceipt}
 from "../domain/completed-show-receipt.js";
import type {CompletedMatchEvidence}
 from "../domain/completed-match-evidence.js";
type Projection=Awaited<ReturnType<typeof previewArchivedShowMatchScores>>;
export interface ArchivedShowResolution {
 receipt:CompletedShowReceipt;
 evidence:readonly CompletedMatchEvidence[];
}
export function assembleArchivedShowResolution(
 projection:Projection,segments:readonly SegmentCrowdContext[],
 resolutionId:string,
):ArchivedShowResolution{
 if(!resolutionId||resolutionId.length>200)
  throw new Error("Invalid World resolution identifier");
 const matches=deriveArchivedMatchEvidence(projection);
 const scoredSegments=evaluateAuthoredSegmentCrowd(segments);
 const kinds=new Map(segments.map(s=>[s.segment.slotId,s.segment.kind]));
 const ids=new Set<string>(),positions=new Set<number>();
 let total=0,weighted=0;
 for(const m of matches){
  if(ids.has(m.receipt.matchId)||positions.has(m.receipt.position))
   throw new Error("Duplicate show slot");
  ids.add(m.receipt.matchId);positions.add(m.receipt.position);
  const weight=1;
  total+=weight;weighted+=weight*m.receipt.crowdResponse;
 }
 for(const s of scoredSegments){
  if(ids.has(s.slotId)||positions.has(s.position))
   throw new Error("Duplicate show slot");
  ids.add(s.slotId);positions.add(s.position);
  total+=0.65;weighted+=0.65*s.crowdResponse;
 }
 if(total<=0)throw new Error("Cannot complete an empty show");
 const receipt=validateCompletedShowReceipt({
  worldId:projection.worldId,promotionId:projection.promotionId,
  showId:projection.showId,year:projection.year,week:projection.week,
  resolutionId,crowdResponse:Math.round(weighted/total*10)/10,
  matches:matches.map(m=>m.receipt),
  segments:scoredSegments.map(s=>({slotId:s.slotId,position:s.position,
   kind:kinds.get(s.slotId)!,outcome:s.outcome,crowdResponse:s.crowdResponse})),
 });
 return {receipt,evidence:matches.map(m=>m.evidence)};
}
