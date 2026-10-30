/** Read-only creative continuity: a later MATCH and a later SEGMENT are
 * different verified facts. Neither can be inferred from a booking plan.
 * Existing legacy boolean callers remain supported until their next read.
 */
export interface StoryDirection {
 choice:"PURSUE_REMATCH"|"PLAN_RETALIATION"|"LET_STAND";
 weekIndex:number;laterBeatRecorded:boolean;
 laterMatchRecorded?:boolean;laterAngleRecorded?:boolean;
}
export function storyDirectionHint(direction:StoryDirection,
 slot:"MATCH"|"SEGMENT"):string{
 const match=direction.laterMatchRecorded??direction.laterBeatRecorded;
 const angle=direction.laterAngleRecorded??direction.laterBeatRecorded;
 if(direction.choice==="PURSUE_REMATCH"){
  if(match)return "The return bout has already taken place. Check its confirmed result before deciding whether another meeting is earned.";
  if(angle)return slot==="MATCH"?
   "A new angle built the issue, but the return bout has not taken place. You choose if and when they meet.":
   "An on-screen beat followed the rematch decision. Another angle can develop it, but it is not a completed return bout.";
  return slot==="MATCH"?
   "A return bout is on your creative slate. Check the wrestlers are ready and choose every finish yourself.":
   "A challenge or face-off could set up the rematch. The next chapter is yours to write.";
 }
 if(direction.choice==="PLAN_RETALIATION"){
  if(angle)return "An on-screen beat followed your retaliation direction. Review what actually happened before choosing the next step.";
  if(match)return slot==="MATCH"?
   "They wrestled again, but no later retaliation angle was recorded. Give their next meeting a purpose rather than assuming the scene happened.":
   "A later match did not fulfil the planned retaliation scene. An attack, confrontation or exchange is still yours to author.";
  return slot==="MATCH"?
   "Retaliation is on the horizon. A grudge match is an option, not an obligation; you decide the outcome.":
   "An attack, confrontation or sharp exchange could bring retaliation to the ring. You decide exactly what happens.";
 }
 if(match||angle)return "You chose to let the result stand, but the rivalry has had another verified chapter since. Review what actually changed.";
 return "You chose to let the result stand. The story can rest here, or take a new turn when you're ready.";
}
