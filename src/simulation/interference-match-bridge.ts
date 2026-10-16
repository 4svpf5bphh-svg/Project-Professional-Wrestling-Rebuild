import type {InterferenceResolutionPreview} from "./legacy/match-interference.js";
import type {FinalizedSinglesMatch} from "./finalize-resolved-show.js";
/** Pure bridge. Resolver must derive this preview from canonical booking. */
export function adaptInterferenceMatch(
 matchId:string,position:number,people:readonly [string,string],
 p:InterferenceResolutionPreview,
 medicalCertified:boolean,
):FinalizedSinglesMatch{
 const planned=people.indexOf(p.plannedWinnerId);
 const actual=people.indexOf(p.actualWinnerId);
 const spot=p.interference;
 if(planned<0||actual<0||people[0]===people[1]||
  p.stage!=="POST_INTERFERENCE_PRE_SHOW_FLOW"||
  (spot&&spot.outcome!=="ABORTED"&&spot.outcome!==spot.plannedOutcome)||
  (spot?.outcome==="ABORTED"&&spot.abortReason===null)||
  (spot?.outcome!=="ABORTED"&&spot?.abortReason!=null)||
  (p.injuryStoppage&&(!medicalCertified||
   p.actualFinish!=="INJURY_STOPPAGE"||actual===planned))||
  (!p.injuryStoppage&&(actual!==planned||
   p.actualFinish!==(spot?.outcome==="SUCCESS"?
    "PROTECTED_FINISH":p.plannedFinish))))
  throw new Error("Inconsistent interference resolution");
 return {matchId,position,crowdResponse:p.crowdResponse,
  plannedWinnerSide:planned===0?"A":"B",
  actualWinnerSide:actual===0?"A":"B",
  plannedFinish:p.plannedFinish,actualFinish:p.actualFinish,
  injuryStoppage:p.injuryStoppage,
  medicalOverrideCertified:p.injuryStoppage&&medicalCertified,
  ...(spot?{interference:{plannedOutcome:spot.plannedOutcome,
   actualOutcome:spot.outcome}}:{}),
 };
}
