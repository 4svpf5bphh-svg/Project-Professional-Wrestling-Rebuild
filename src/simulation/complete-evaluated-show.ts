import {aggregateShowReactions} from "./aggregate-show-reactions.js";
import {finalizeResolvedShow,type FinalizedShowInput,
 type FinalizedSinglesMatch,type FinalizedAuthoredSegment}
 from "./finalize-resolved-show.js";
import type {CompletedShowReceipt} from "../domain/completed-show-receipt.js";
export interface EvaluatedShowInput extends Omit<FinalizedShowInput,
 "matches"|"segments"|"finalCrowdResponse"|"phase"> {
 matches:readonly (FinalizedSinglesMatch&{weight:number})[];
 segments:readonly FinalizedAuthoredSegment[];
}
/** Resolver-only boundary: caller must prove canonical booking and final
 * match/segment evaluation before invoking. Does not write World state.
 */
export function completeEvaluatedShow(
 input:EvaluatedShowInput,
 authorization:{phase:"WORLD_RESOLVER_VERIFIED"},
):CompletedShowReceipt{
 if(authorization.phase!=="WORLD_RESOLVER_VERIFIED")
  throw new Error("Unverified show cannot be finalized");
 const aggregation=aggregateShowReactions(input.matches,input.segments);
 return finalizeResolvedShow({...input,
  phase:"AUTHORITATIVE_RESOLVED",
  finalCrowdResponse:aggregation.crowdResponse,
  matches:input.matches.map(({weight:_weight,...match})=>match),
  segments:input.segments});
}
