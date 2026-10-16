/** Canonical tag result evidence. The World resolver, not a client,
 * constructs medical/finish proofs from its own committed simulation.
 */
import type {MatchSideId} from "./match-sides.js";
export interface BookedTeamOutcome{
 family:"TEAMS";
 sides:readonly {sideId:MatchSideId;participants:readonly string[]}[];
 scriptedWinnerSide:MatchSideId;plannedFinish:string;
 ruleset?:"STANDARD"|"ELIMINATION";eliminationOrder?:readonly MatchSideId[];
 interferencePlannedOutcome?:"SUCCESS"|"THWARTED";
}
export interface ResolvedTeamEvidence{
 actualWinnerSide:MatchSideId;actualFinish:string;
 medical?:{injuredPersonId:string;severity:"MAJOR"|"SEVERE";stoppage:true};
 completedEliminationOrder?:readonly MatchSideId[];
 interference?:{plannedOutcome:"SUCCESS"|"THWARTED";
  actualOutcome:"SUCCESS"|"THWARTED"|"ABORTED"};
}
export function verifyResolvedTeamEvidence(
 booking:BookedTeamOutcome,resolved:ResolvedTeamEvidence,
):{actualWinnerSide:MatchSideId;actualFinish:string}{
 const validSides=Array.from({length:booking.sides.length},(_,i)=>
  String.fromCharCode(65+i));
 const eliminated=booking.eliminationOrder??[];
 const completed=resolved.completedEliminationOrder??[];
 const elimination=booking.ruleset==="ELIMINATION";
 if(booking.family!=="TEAMS"||booking.sides.length<2||
  booking.sides.length>6||
  booking.sides.some((s,i)=>s.sideId!==validSides[i])||
  booking.sides.some(s=>s.participants.length<2||
   s.participants.length>5||
   s.participants.length!==booking.sides[0]!.participants.length)||
  !validSides.includes(booking.scriptedWinnerSide)||
  !validSides.includes(resolved.actualWinnerSide)||
  (elimination?(eliminated.length!==booking.sides.length-1||
   new Set(eliminated).size!==eliminated.length||
   eliminated.some(x=>x===booking.scriptedWinnerSide||!validSides.includes(x))):
   eliminated.length!==0)||
  !booking.plannedFinish||
  new Set(booking.sides.flatMap(s=>s.participants)).size!==
   booking.sides[0]!.participants.length*booking.sides.length||
  booking.sides.some(s=>s.participants.some(id=>!id)))
  throw new Error("Invalid canonical team match evidence");
 if(booking.sides.length>2&&resolved.interference)
  throw new Error("Multi-team run-in requires explicit rules");
 const medicallyStopped=resolved.medical?.stoppage===true;
 if(resolved.medical&&
  (!medicallyStopped||!["MAJOR","SEVERE"].includes(resolved.medical.severity)||
   !booking.sides.find(s=>s.sideId===booking.scriptedWinnerSide)!
    .participants.includes(resolved.medical.injuredPersonId)))
  throw new Error("Medical evidence not from scripted winning team");
 if(resolved.interference&&
  (resolved.interference.plannedOutcome!==booking.interferencePlannedOutcome||
   !["SUCCESS","THWARTED","ABORTED"].includes(resolved.interference.actualOutcome)))
  throw new Error("Tag interference differs from scripted author outcome");
 if(medicallyStopped){
  if(resolved.actualWinnerSide===booking.scriptedWinnerSide||
   resolved.actualFinish!=="INJURY_STOPPAGE"||
   resolved.interference?.actualOutcome==="SUCCESS")
    throw new Error("Medical stoppage must overturn injured winning team");
 }else{
  if(resolved.actualWinnerSide!==booking.scriptedWinnerSide)
   throw new Error("Simulation cannot change a scripted winning team");
  const protectedSpot=resolved.interference?.plannedOutcome==="SUCCESS"&&
   resolved.interference.actualOutcome==="SUCCESS";
  const expected=protectedSpot?"PROTECTED_FINISH":booking.plannedFinish;
  if(resolved.actualFinish!==expected)
   throw new Error("Tag finish differs from scripted outcome");
 }
 if((medicallyStopped?completed.length!==0:
   JSON.stringify(completed)!==JSON.stringify(eliminated)))
  throw new Error("Completed team eliminations differ from authored order");
 return {actualWinnerSide:resolved.actualWinnerSide,
  actualFinish:resolved.actualFinish};
}
