/** Pure receipt assembly from resolved simulation facts.
 * Only authoritative, finalized inputs are allowed; previews are excluded.
 * Caller must verify each input against canonical booking and World state.
 */
import {validateCompletedShowReceipt,type CompletedShowReceipt,
 type CompletedMatchReceipt,type CompletedSegmentReceipt}
 from "../domain/completed-show-receipt.js";
export interface ResolvedShowFacts {
 worldId:string;promotionId:string;showId:string;
 year:number;week:number;resolutionId:string;
 finalCrowdResponse:number;
 phase:"AUTHORITATIVE_RESOLVED";
 matches:readonly (CompletedMatchReceipt & {phase:"FINAL_MATCH"})[];
 segments:readonly (CompletedSegmentReceipt & {phase:"FINAL_SEGMENT"})[];
}
export function assembleCompletedShowReceipt(facts:ResolvedShowFacts):CompletedShowReceipt{
 if(facts.phase!=="AUTHORITATIVE_RESOLVED"||
  facts.matches.some(m=>m.phase!=="FINAL_MATCH")||
  facts.segments.some(s=>s.phase!=="FINAL_SEGMENT"))
  throw new Error("Provisional show context cannot be recorded");
 return validateCompletedShowReceipt({
  worldId:facts.worldId,promotionId:facts.promotionId,showId:facts.showId,
  year:facts.year,week:facts.week,resolutionId:facts.resolutionId,
  crowdResponse:facts.finalCrowdResponse,
  matches:facts.matches.map(({phase:_phase,...m})=>({...m})),
  segments:facts.segments.map(({phase:_phase,...s})=>({...s})),
 });
}
