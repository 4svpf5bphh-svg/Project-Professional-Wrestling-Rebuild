/** A wrestler's own private, verified promotion rivalry chapters.
 * The projection may only originate from settled programme activities;
 * it is read-only and cannot turn a scene into a victory or feud promise.
 */
export interface WrestlerRivalryMemory{
 kind:"RIVALRY_MATCH"|"RIVALRY_ANGLE";
 relatedName:string;
 ownSide:"A"|"B";
 winnerSide:"A"|"B"|null;
 weekIndex:number;
}
export function describeWrestlerRivalryMemory(m:WrestlerRivalryMemory):string{
 if(!Number.isSafeInteger(m.weekIndex)||m.weekIndex<0||
  !["A","B"].includes(m.ownSide)||!["A","B",null].includes(m.winnerSide)||
  !m.relatedName.trim()||m.relatedName.length>300||
  !["RIVALRY_MATCH","RIVALRY_ANGLE"].includes(m.kind))
  throw new Error("Invalid verified wrestler rivalry memory");
 if(m.kind==="RIVALRY_ANGLE")
  return "A rivalry chapter with "+m.relatedName+" played out on screen";
 if(m.winnerSide===null)
  return "A rivalry match with "+m.relatedName+" ended without a confirmed winning side";
 if(m.winnerSide===m.ownSide)
  return "They won a recorded rivalry match against "+m.relatedName;
 return "They lost a recorded rivalry match against "+m.relatedName;
}
export interface StaffRivalryEvidence{
 sideA:string;sideB:string;heat:number|null;
 lastKind:"MATCH"|"SEGMENT"|null;lastWeekIndex:number|null;
 lastWinnerSide:"A"|"B"|null;
 directionChoice:"PURSUE_REMATCH"|"PLAN_RETALIATION"|"LET_STAND"|null;
 directionWeekIndex:number|null;
 laterMatch:boolean;laterAngle:boolean;
}
export function deriveStaffRivalryObservations(story:StaffRivalryEvidence|null):{
 creative:string|null;commentary:string|null;roadAgent:string|null;
 priority:string|null;
}{
 if(!story)return {creative:null,commentary:null,roadAgent:null,priority:null};
 if(!story.sideA.trim()||!story.sideB.trim()||
  !["MATCH","SEGMENT",null].includes(story.lastKind)||
  !["A","B",null].includes(story.lastWinnerSide)||
  ![null,"PURSUE_REMATCH","PLAN_RETALIATION","LET_STAND"].includes(story.directionChoice)||
  !Number.isFinite(story.heat??0))
  throw new Error("Invalid staff rivalry evidence");
 const pairing=story.sideA+" and "+story.sideB;
 const last=story.lastKind==="MATCH"?
  "Their last recorded rivalry chapter was a match"+
   (story.lastWinnerSide==="A"?", won by "+story.sideA:
    story.lastWinnerSide==="B"?", won by "+story.sideB:"")+". ":
  story.lastKind==="SEGMENT"?"Their latest chapter was an on-screen angle. ":
  "This rivalry has not yet had a completed chapter. ";
 const unresolved=story.directionChoice==="PURSUE_REMATCH"&&!story.laterMatch?
  "A return bout was requested but has not been completed.":
  story.directionChoice==="PLAN_RETALIATION"&&!story.laterAngle?
  "The booker considered retaliation, but no later rivalry angle has been completed.":
  null;
 const active=unresolved?
  "Don't assume that direction has already played out. ":
  "Build on what actually happened; the next finish remains the booker's decision. ";
 return {
  creative:"On "+pairing+": "+last+(unresolved??active),
  commentary:"When we call "+pairing+", "+last.toLowerCase()+
   "Give the next segment an honest link to that record, not a promised result.",
  roadAgent:"The recent story to keep straight is "+pairing+". "+last+
   "We can build the next show around a clear follow-up without repeating the same match by default.",
  priority:unresolved&&story.heat!==null&&story.heat>=55?
   pairing+": "+unresolved:null
 };
}
