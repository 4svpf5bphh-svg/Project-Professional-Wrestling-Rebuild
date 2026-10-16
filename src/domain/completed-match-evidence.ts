import type {CompletedShowReceipt} from "./completed-show-receipt.js";
import {verifyResolvedSinglesEvidence,type BookedSinglesOutcome,
 type ResolvedSinglesEvidence} from "./verified-match-evidence.js";
import {verifyResolvedTeamEvidence,type BookedTeamOutcome,
 type ResolvedTeamEvidence} from "./verified-team-evidence.js";
export type CompletedMatchEvidence =
 |{matchId:string;booking:BookedSinglesOutcome;resolution:ResolvedSinglesEvidence}
 |{matchId:string;booking:BookedTeamOutcome;resolution:ResolvedTeamEvidence};
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
  const verified="family" in item.booking&&item.booking.family==="TEAMS"?
   verifyResolvedTeamEvidence(item.booking,item.resolution as ResolvedTeamEvidence):
   verifyResolvedSinglesEvidence(item.booking as BookedSinglesOutcome,
    item.resolution as ResolvedSinglesEvidence);
  if(match.actualWinnerSide!==verified.actualWinnerSide||
   match.actualFinish!==verified.actualFinish)
   throw new Error("Completed match contradicts resolution evidence");
 }
}
