/** Explicit finalized-result boundary. Caller must resolve injuries and
 * crowd context first; no previews are implicitly promoted to final.
 */
import {assembleCompletedShowReceipt,type ResolvedShowFacts}
 from "./assemble-completed-show.js";
import type {CompletedShowReceipt} from "../domain/completed-show-receipt.js";
export interface FinalizedSinglesMatch {
 matchId:string;position:number;crowdResponse:number;
 plannedWinnerSide:"A"|"B";plannedFinish:string;
 actualWinnerSide:"A"|"B";actualFinish:string;
 injuryStoppage:boolean;medicalOverrideCertified:boolean;
 interference?:{plannedOutcome:"SUCCESS"|"THWARTED";
  actualOutcome:"SUCCESS"|"THWARTED"|"ABORTED"};
}
export interface FinalizedAuthoredSegment {
 slotId:string;position:number;kind:string;
 bookedOutcome:"HAPPENS"|"REFUSED"|"INTERRUPTED";
 resolvedOutcome:"HAPPENS"|"REFUSED"|"INTERRUPTED";
 crowdResponse:number;
}
export interface FinalizedShowInput extends Omit<ResolvedShowFacts,"matches"|"segments"> {
 matches:readonly FinalizedSinglesMatch[];
 segments:readonly FinalizedAuthoredSegment[];
}
export function finalizeResolvedShow(input:FinalizedShowInput):CompletedShowReceipt{
 if(input.matches.some(m=>{
  const winnerChanged=m.plannedWinnerSide!==m.actualWinnerSide;
  const finishChanged=m.plannedFinish!==m.actualFinish;
  const scriptedInterference=m.interference?.plannedOutcome==="SUCCESS"&&
   m.interference.actualOutcome==="SUCCESS"&&
   m.actualFinish==="PROTECTED_FINISH"&&!winnerChanged;
  const unauthorized=(winnerChanged||finishChanged)&&
   !scriptedInterference;
  return unauthorized&&(!m.injuryStoppage||!m.medicalOverrideCertified)||
   m.injuryStoppage&&!m.medicalOverrideCertified||
   !m.injuryStoppage&&m.medicalOverrideCertified;
 }))throw new Error("Uncertified override of scripted match outcome");
 if(input.segments.some(s=>s.bookedOutcome!==s.resolvedOutcome))
  throw new Error("Simulation cannot rewrite authored segment outcomes");
 return assembleCompletedShowReceipt({
  worldId:input.worldId,promotionId:input.promotionId,showId:input.showId,
  year:input.year,week:input.week,resolutionId:input.resolutionId,
  finalCrowdResponse:input.finalCrowdResponse,phase:input.phase,
  matches:input.matches.map(m=>({matchId:m.matchId,position:m.position,
   crowdResponse:m.crowdResponse,actualFinish:m.actualFinish,
   actualWinnerSide:m.actualWinnerSide,phase:"FINAL_MATCH" as const})),
  segments:input.segments.map(s=>({slotId:s.slotId,position:s.position,
   kind:s.kind,outcome:s.bookedOutcome,crowdResponse:s.crowdResponse,
   phase:"FINAL_SEGMENT" as const})),
 });
}
