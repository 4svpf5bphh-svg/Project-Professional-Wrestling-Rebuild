/** Read-only creative continuity, adapted from original-main post-show advice.
 * It never schedules a return bout, assigns a performer or picks an outcome.
 */
export interface StoryDirection {
 choice:"PURSUE_REMATCH"|"PLAN_RETALIATION"|"LET_STAND";
 weekIndex:number;laterBeatRecorded:boolean;
}
export function storyDirectionHint(direction:StoryDirection,
 slot:"MATCH"|"SEGMENT"):string{
 if(direction.laterBeatRecorded)
  return "Another chapter has unfolded since this decision. Review where the rivalry stands before its next appearance.";
 if(direction.choice==="LET_STAND")
  return "You chose to let the result stand. The story can rest here, or take a new turn when you're ready.";
 if(direction.choice==="PURSUE_REMATCH")
  return slot==="MATCH"?
   "A return bout is on your creative slate. Check the wrestlers are ready and choose every finish yourself.":
   "A challenge or face-off could set up the rematch. The next chapter is yours to write.";
 return slot==="MATCH"?
  "Retaliation is on the horizon. A grudge match is an option, not an obligation; you decide the outcome.":
  "An attack, confrontation or sharp exchange could bring retaliation to the ring. You decide exactly what happens.";
}
