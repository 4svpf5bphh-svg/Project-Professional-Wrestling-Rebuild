import {sideIdAt,type MatchSideId} from "./match-sides.js";
/** Author determines the single winning individual. Every person is an
 * independent side; no elimination or draw permitted in this ruleset.
 */
export interface BookedMultiIndividualOutcome{
 family:"INDIVIDUAL";participants:readonly string[];
 scriptedWinnerSide:MatchSideId;plannedFinish:string;
 ruleset?:"STANDARD"|"ELIMINATION";eliminationOrder?:readonly MatchSideId[];
}
export interface ResolvedMultiIndividualEvidence{
 actualWinnerSide:MatchSideId;actualFinish:string;
 medical?:{injuredPersonId:string;severity:"MAJOR"|"SEVERE";stoppage:true};
 completedEliminationOrder?:readonly MatchSideId[];
}
export function verifyMultiIndividualEvidence(
 booking:BookedMultiIndividualOutcome,resolved:ResolvedMultiIndividualEvidence,
):{actualWinnerSide:MatchSideId;actualFinish:string}{
 const ids=booking.participants;
 const battle=ids.length>=6&&ids.length<=30;
 const allowed=Array.from({length:ids.length},(_,i)=>sideIdAt(i));
 const eliminated=booking.eliminationOrder??[];
 const elimination=booking.ruleset==="ELIMINATION";
 if(!([3,4].includes(ids.length)||battle)||new Set(ids).size!==ids.length||
  ids.some(x=>typeof x!=="string"||!x)||
  !booking.plannedFinish||
  !(battle?booking.plannedFinish==="OVER_THE_TOP_ROPE":
   ["CLEAN_PIN","SUBMISSION","FLASH_PIN","PROTECTED_FINISH","RETRIEVAL"].includes(booking.plannedFinish))||
  (battle&&!elimination)||
  (elimination?(eliminated.length!==ids.length-1||
   new Set(eliminated).size!==eliminated.length||
   eliminated.some(s=>s===booking.scriptedWinnerSide||!allowed.includes(s))):
   eliminated.length!==0)||
  !allowed.includes(booking.scriptedWinnerSide)||
  !allowed.includes(resolved.actualWinnerSide))
  throw new Error("Invalid canonical multi-person match evidence");
 if(resolved.medical){
  if(!resolved.medical.stoppage||
   !["MAJOR","SEVERE"].includes(resolved.medical.severity)||
   resolved.medical.injuredPersonId!==
     ids[allowed.indexOf(booking.scriptedWinnerSide)]||
   resolved.actualFinish!=="INJURY_STOPPAGE"||
   resolved.actualWinnerSide===booking.scriptedWinnerSide)
   throw new Error("Multi-person medical stoppage lacks winner evidence");
 }else if(resolved.actualWinnerSide!==booking.scriptedWinnerSide||
  resolved.actualFinish!==booking.plannedFinish)
  throw new Error("Multi-person simulation cannot alter the authored finish");
 const completed=resolved.completedEliminationOrder??[];
 if((resolved.medical?completed.length!==0:
   JSON.stringify(completed)!==JSON.stringify(eliminated)))
  throw new Error("Completed eliminations differ from authored order");
 return {actualWinnerSide:resolved.actualWinnerSide,
  actualFinish:resolved.actualFinish};
}
