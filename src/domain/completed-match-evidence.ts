import type {CompletedShowReceipt} from "./completed-show-receipt.js";
import {verifyResolvedSinglesEvidence,type BookedSinglesOutcome,
 type ResolvedSinglesEvidence} from "./verified-match-evidence.js";
export interface CompletedMatchEvidence {
 matchId:string;
 booking:BookedSinglesOutcome;
 resolution:ResolvedSinglesEvidence;
}
/** Consistency only. Provenance must be established by the World resolver. */
export function validateCompletedMatchEvidence(
 receipt:CompletedShowReceipt,evidence:readonly CompletedMatchEvidence[],
):void{
 const matches=new Map(receipt.matches.map(m=>[m.matchId,m]));
 const seen=new Set<string>();
 for(const item of evidence){
  if(seen.has(item.matchId))throw new Error("Duplicate completed match evidence");
  seen.add(item.matchId);
  const match=matches.get(item.matchId);
  if(!match)throw new Error("Evidence references unknown match");
  const verified=verifyResolvedSinglesEvidence(item.booking,item.resolution);
  if(match.actualWinnerSide!==verified.actualWinnerSide||
   match.actualFinish!==verified.actualFinish)
   throw new Error("Completed match contradicts resolution evidence");
 }
}
