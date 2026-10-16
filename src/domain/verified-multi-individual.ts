import type {MatchSideId} from "./match-sides.js";
/** Author determines the single winning individual. Every person is an
 * independent side; no elimination or draw permitted in this ruleset.
 */
export interface BookedMultiIndividualOutcome{
 family:"INDIVIDUAL";participants:readonly string[];
 scriptedWinnerSide:MatchSideId;plannedFinish:string;
}
export interface ResolvedMultiIndividualEvidence{
 actualWinnerSide:MatchSideId;actualFinish:string;
 medical?:{injuredPersonId:string;severity:"MAJOR"|"SEVERE";stoppage:true};
}
export function verifyMultiIndividualEvidence(
 booking:BookedMultiIndividualOutcome,resolved:ResolvedMultiIndividualEvidence,
):{actualWinnerSide:"A"|"B"|"C"|"D";actualFinish:string}{
 const ids=booking.participants;
 if(![3,4].includes(ids.length)||new Set(ids).size!==ids.length||
  ids.some(x=>typeof x!=="string"||!x)||
  !booking.plannedFinish||
  !["CLEAN_PIN","SUBMISSION","FLASH_PIN","PROTECTED_FINISH"].includes(booking.plannedFinish)||
  !["A","B","C","D"].slice(0,ids.length).includes(booking.scriptedWinnerSide)||
  !["A","B","C","D"].slice(0,ids.length).includes(resolved.actualWinnerSide))
  throw new Error("Invalid canonical multi-person match evidence");
 if(resolved.medical){
  if(!resolved.medical.stoppage||
   !["MAJOR","SEVERE"].includes(resolved.medical.severity)||
   resolved.medical.injuredPersonId!==
     ids[booking.scriptedWinnerSide.charCodeAt(0)-65]||
   resolved.actualFinish!=="INJURY_STOPPAGE"||
   resolved.actualWinnerSide===booking.scriptedWinnerSide)
   throw new Error("Multi-person medical stoppage lacks winner evidence");
 }else if(resolved.actualWinnerSide!==booking.scriptedWinnerSide||
  resolved.actualFinish!==booking.plannedFinish)
  throw new Error("Multi-person simulation cannot alter the authored finish");
 return {actualWinnerSide:resolved.actualWinnerSide as "A"|"B"|"C"|"D",
  actualFinish:resolved.actualFinish};
}
