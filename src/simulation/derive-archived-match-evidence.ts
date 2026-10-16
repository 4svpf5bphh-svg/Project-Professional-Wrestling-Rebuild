/** Convert the canonical DB-backed legacy simulation projection into
 * completed-match evidence. Never accept an equivalent player JSON payload.
 * This is a preparation stage; the World resolver owns the transaction.
 */
import type {previewArchivedShowMatchScores}
 from "../db/legacy-match-scoring.js";
import type {CompletedMatchEvidence}
 from "../domain/completed-match-evidence.js";
import type {CompletedMatchReceipt}
 from "../domain/completed-show-receipt.js";
import {verifyResolvedSinglesEvidence}
 from "../domain/verified-match-evidence.js";
type Projection=Awaited<ReturnType<typeof previewArchivedShowMatchScores>>;
export interface DerivedArchivedMatch {
 receipt:CompletedMatchReceipt;
 evidence:CompletedMatchEvidence;
}
export function deriveArchivedMatchEvidence(
 projection:Projection,
):DerivedArchivedMatch[]{
 return projection.projections.map(p=>{
  const injury=p.injuryPreview,final=p.interferencePreview;
  if(!injury||!final)
   throw new Error("Cannot finalize an incomplete archived match preview");
  if(injury.plannedWinnerId!==p.winnerId||
   final.plannedWinnerId!==p.winnerId||
   final.plannedFinish!==p.plannedFinish||
   final.actualWinnerId!==injury.actualWinnerId||
   final.injuryStoppage!==injury.injuryStoppage)
   throw new Error("Archived match stages disagree");
  const serious=injury.injuries.find(i=>i.personId===p.winnerId&&
   (i.severity==="MAJOR"||i.severity==="SEVERE"));
  if(injury.injuryStoppage!==Boolean(serious))
   throw new Error("Archived medical preview is inconsistent");
  const booked=final.interference;
  const evidence:CompletedMatchEvidence={
   matchId:p.slotId,
   booking:{participants:[p.personIds[0],p.personIds[1]],
    scriptedWinner:p.winnerId,plannedFinish:p.plannedFinish,
    ...(booked?{interferencePlannedOutcome:booked.plannedOutcome}:{})},
   resolution:{actualWinner:final.actualWinnerId,actualFinish:final.actualFinish,
    ...(serious?{medical:{injuredPersonId:serious.personId,
     severity:serious.severity as "MAJOR"|"SEVERE",stoppage:true}}:{}),
    ...(booked?{interference:{plannedOutcome:booked.plannedOutcome,
     actualOutcome:booked.outcome}}:{})},
  };
  const verified=verifyResolvedSinglesEvidence(evidence.booking,evidence.resolution);
  return {evidence,receipt:{matchId:p.slotId,position:p.position,
   crowdResponse:final.crowdResponse,actualFinish:verified.actualFinish,
   actualWinnerSide:verified.actualWinnerSide}};
 });
}
