import type {InjuryResolutionPreview} from "./legacy/match-injuries.js";
import type {FinalizedSinglesMatch} from "./finalize-resolved-show.js";
/** Preview adapter; only the authoritative resolver may finalize results. */
export function adaptMedicalMatch(
 matchId:string,position:number,people:readonly [string,string],
 p:InjuryResolutionPreview,
):FinalizedSinglesMatch{
 const planned=people.indexOf(p.plannedWinnerId);
 const actual=people.indexOf(p.actualWinnerId);
 const serious=p.injuries.some(i=>i.personId===p.plannedWinnerId&&
  (i.severity==="MAJOR"||i.severity==="SEVERE"));
 if(planned<0||actual<0||people[0]===people[1]||
  p.stage!=="POST_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW"||
  (p.injuryStoppage?
   (!serious||actual===planned||p.actualFinish!=="INJURY_STOPPAGE"):
   (actual!==planned||p.actualFinish!==p.plannedFinish)))
  throw new Error("Inconsistent injury resolution");
 return {matchId,position,crowdResponse:p.crowdResponse,
  plannedWinnerSide:planned===0?"A":"B",
  actualWinnerSide:actual===0?"A":"B",
  plannedFinish:p.plannedFinish,actualFinish:p.actualFinish,
  injuryStoppage:p.injuryStoppage,
  medicalOverrideCertified:p.injuryStoppage};
}
