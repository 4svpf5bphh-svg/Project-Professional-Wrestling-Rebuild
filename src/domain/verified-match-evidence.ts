/** A resolver-side consistency gate, not a proof of medical authority.
 * Evidence is derived from the simulation and canonical booking by the
 * World resolver; clients must never submit these structures directly.
 */
export interface BookedSinglesOutcome {
 participants:readonly [string,string];
 scriptedWinner:string;
 plannedFinish:string;
 interferencePlannedOutcome?:"SUCCESS"|"THWARTED";
}
export interface ResolvedSinglesEvidence {
 actualWinner:string;
 actualFinish:string;
 medical?:{injuredPersonId:string;severity:"MAJOR"|"SEVERE";
  stoppage:boolean};
 interference?:{plannedOutcome:"SUCCESS"|"THWARTED";
  actualOutcome:"SUCCESS"|"THWARTED"|"ABORTED"};
}
export function verifyResolvedSinglesEvidence(
 booking:BookedSinglesOutcome,evidence:ResolvedSinglesEvidence,
):{actualWinnerSide:"A"|"B";actualFinish:string}{
 const [a,b]=booking.participants;
 if(!a||!b||a===b||![a,b].includes(booking.scriptedWinner)||
  ![a,b].includes(evidence.actualWinner)||!booking.plannedFinish)
  throw new Error("Invalid canonical singles outcome");
 const medical=evidence.medical;
 const stopped=medical?.stoppage===true;
 if(medical&&(!stopped||medical.injuredPersonId!==booking.scriptedWinner||
  !["MAJOR","SEVERE"].includes(medical.severity)))
  throw new Error("Medical evidence inconsistent with booked winner");
 const interference=evidence.interference;
 if(interference&&(
  interference.plannedOutcome!==booking.interferencePlannedOutcome||
  !["SUCCESS","THWARTED","ABORTED"].includes(interference.actualOutcome)))
  throw new Error("Interference evidence inconsistent with booking");
 if(stopped){
  if(evidence.actualWinner===booking.scriptedWinner||
   evidence.actualFinish!=="INJURY_STOPPAGE"||
   interference?.actualOutcome==="SUCCESS")
   throw new Error("Medical stoppage cannot preserve booked result");
 }else{
  if(evidence.actualWinner!==booking.scriptedWinner)
   throw new Error("Simulation cannot change scripted winner");
  const protectedFinish=interference?.plannedOutcome==="SUCCESS"&&
   interference.actualOutcome==="SUCCESS";
  const expectedFinish=protectedFinish?"PROTECTED_FINISH":booking.plannedFinish;
  if(evidence.actualFinish!==expectedFinish)
   throw new Error("Finish is not supported by resolved interference");
 }
 return {actualWinnerSide:evidence.actualWinner===a?"A":"B",
  actualFinish:evidence.actualFinish};
}
