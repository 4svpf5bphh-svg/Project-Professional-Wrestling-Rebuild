/** The on-screen state of a real rivalry, built exclusively from completed
 * programme activities and a booker's optional post-show direction.
 * A direction is NOT a booking order or a guaranteed outcome.
 */
export type ProgrammeBeat={
 showId:string;slotId:string;kind:string;weekIndex:number;
 crowdResponse:number;winnerSide?:"A"|"B"|null;
};
export type ProgrammeDirection={
 choice:"PURSUE_REMATCH"|"PLAN_RETALIATION"|"LET_STAND";
 showId:string;slotId:string;weekIndex:number;
 nextMatchWeekIndex?:number|null;nextAngleWeekIndex?:number|null;
};
export interface ProgrammeContinuityEvidence{
 sideAName:string;sideBName:string;recentActivity:readonly ProgrammeBeat[];
 latestFollowUp?:ProgrammeDirection|null;
}
export interface ProgrammeContinuity{
 lastBell:string|null;
 latestChapter:string|null;
 directionKind:"UNSET"|"PENDING_REMATCH"|"BUILDING_REMATCH"|
  "REMATCH_HELD"|"PENDING_RETALIATION"|"RETALIATION_SHOWN"|
  "RESULT_STANDS"|"STORY_RESUMED";
 directionHeadline:string|null;
 directionSummary:string|null;
 suggestion:string|null;
}
const when=(index:number)=>"Year "+(Math.floor(index/52)+1)+
 " · Week "+(index%52+1);
export function readProgrammeContinuity(input:ProgrammeContinuityEvidence):ProgrammeContinuity{
 const recent=[...input.recentActivity].sort((a,b)=>b.weekIndex-a.weekIndex||
  b.showId.localeCompare(a.showId)||b.slotId.localeCompare(a.slotId));
 const match=recent.find(x=>x.kind==="MATCH");
 const latest=recent[0];
 const lastBell=match?(
  match.winnerSide==="A"?input.sideAName+" won their latest recorded meeting · "+when(match.weekIndex):
  match.winnerSide==="B"?input.sideBName+" won their latest recorded meeting · "+when(match.weekIndex):
  "Latest recorded match · "+when(match.weekIndex)+" (no decisive side confirmed)"
 ):null;
 const latestChapter=latest?(latest.kind==="SEGMENT"?
  "Latest chapter: an on-screen angle · "+when(latest.weekIndex):
  "Latest chapter: an in-ring meeting · "+when(latest.weekIndex)):null;
 const base={lastBell,latestChapter};
 const d=input.latestFollowUp;
 if(!d)return {...base,directionKind:"UNSET" as const,
  directionHeadline:null,directionSummary:null,suggestion:null};
 // Only subsequent certified weeks count; the same match that caused the
 // decision cannot fulfil it, nor can a saved but uncompleted card.
 const rematch=d.nextMatchWeekIndex!=null&&d.nextMatchWeekIndex>d.weekIndex;
 const angle=d.nextAngleWeekIndex!=null&&d.nextAngleWeekIndex>d.weekIndex;
 if(d.choice==="PURSUE_REMATCH"){
  if(rematch)return {...base,directionKind:"REMATCH_HELD" as const,
   directionHeadline:"The return bout happened",
   directionSummary:"You called for another meeting after "+when(d.weekIndex)+
    ". A later rivalry match was completed in "+when(d.nextMatchWeekIndex!)+".",
   suggestion:"That chapter is in the books. Decide whether the result deserves a response or whether this issue has earned its ending."};
  if(angle)return {...base,directionKind:"BUILDING_REMATCH" as const,
   directionHeadline:"The build continued",
   directionSummary:"An angle followed your rematch decision in "+
    when(d.nextAngleWeekIndex!)+", but no later rivalry match is recorded.",
   suggestion:"A return bout is still an option. Check the creative agreements and give the confrontation a suitable destination."};
  return {...base,directionKind:"PENDING_REMATCH" as const,
   directionHeadline:"Rematch not yet seen",
   directionSummary:"You chose to pursue another meeting after "+when(d.weekIndex)+
    ". No later certified rivalry match or angle has followed it.",
   suggestion:"If the timing feels right, put a return match on a future card. Nothing has been booked automatically."};
 }
 if(d.choice==="PLAN_RETALIATION"){
  if(angle)return {...base,directionKind:"RETALIATION_SHOWN" as const,
   directionHeadline:"The story answered back",
   directionSummary:"An on-screen angle took place in "+when(d.nextAngleWeekIndex!)+
    " after your retaliation direction. Only the completed scene is confirmed, not its meaning.",
   suggestion:"Use the recorded angle as your next starting point. A confrontation or a match could carry the issue forward."};
  return {...base,directionKind:"PENDING_RETALIATION" as const,
   directionHeadline:"An answer is still due",
   directionSummary:"You marked retaliation after "+when(d.weekIndex)+
    ". No subsequent on-screen angle is recorded"+
    (rematch?"; another rivalry match has taken place instead.":"."),
   suggestion:"Give the response a moment on screen when it fits. The choice did not create a segment or decide its outcome."};
 }
 if(rematch||angle){
  const next=Math.min(...[d.nextMatchWeekIndex,d.nextAngleWeekIndex]
   .filter((n):n is number=>n!=null&&n>d.weekIndex));
  return {...base,directionKind:"STORY_RESUMED" as const,
   directionHeadline:"A new chapter followed",
   directionSummary:"You originally chose to let the finish stand, but the rivalry returned in "+
    when(next)+". That is a new completed chapter, not a rewritten decision.",
   suggestion:"Consider whether the renewed issue merits another major meeting, or whether the newer beat offers a better conclusion."};
 }
 return {...base,directionKind:"RESULT_STANDS" as const,
  directionHeadline:"You let the result breathe",
  directionSummary:"The finish from "+when(d.weekIndex)+
   " still stands as the last confirmed direction. There has been no later certified rivalry chapter.",
  suggestion:"You can leave it there, close the programme, or start a different issue when the story calls for it."};
}
