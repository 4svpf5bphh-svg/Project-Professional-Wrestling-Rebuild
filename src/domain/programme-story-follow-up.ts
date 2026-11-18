/** Authored follow-through on a genuinely certified story chapter. A choice is
 * creative intent, never a booked angle, wrestler agreement or canonical event.
 */
export const STORY_FOLLOW_UPS={
 BUILD_ON_REACTION:{label:"Build on the reaction",
  explanation:"Follow the audience response with a distinctive new chapter."},
 CHANGE_PRESENTATION:{label:"Try a different approach",
  explanation:"Change the scene or give another perspective room, without rewriting history."},
 SLOW_BURN:{label:"Let the story breathe",
  explanation:"Delay the next escalation; nothing is booked automatically."}
} as const;
export type StoryFollowUpChoice=keyof typeof STORY_FOLLOW_UPS;
export interface StoryFollowUp{
 choice:StoryFollowUpChoice;sourceShowId:string;sourceSlotId:string;
 sourceWeekIndex:number;
}
export function validStoryFollowUpChoice(v:unknown):v is StoryFollowUpChoice{
 return typeof v==="string"&&Object.hasOwn(STORY_FOLLOW_UPS,v);
}
export function parseStoryFollowUp(v:unknown):StoryFollowUp{
 if(!v||typeof v!=="object"||Array.isArray(v))throw Error("Invalid story follow-up");
 const x=v as Record<string,unknown>;
 if(!validStoryFollowUpChoice(x.choice)||
  typeof x.sourceShowId!=="string"||!x.sourceShowId||x.sourceShowId.length>200||
  typeof x.sourceSlotId!=="string"||!x.sourceSlotId||x.sourceSlotId.length>200||
  !Number.isSafeInteger(x.sourceWeekIndex)||
  Number(x.sourceWeekIndex)<0||Number(x.sourceWeekIndex)>520000)
  throw Error("Invalid story follow-up source");
 return {choice:x.choice,sourceShowId:x.sourceShowId,
  sourceSlotId:x.sourceSlotId,sourceWeekIndex:x.sourceWeekIndex as number};
}
/** The same decision drives Backstage copy, Programme desk and booking ideas. */
export function storyFollowUpBrief(choice:StoryFollowUpChoice,
 format:"SOLO"|"RELATIONSHIP"|"FACTION"){
 const subject=format==="SOLO"?"this character":
  format==="RELATIONSHIP"?"these characters":"the faction's characters";
 if(choice==="BUILD_ON_REACTION")return {
  headline:"Build the next chapter around what the crowd noticed",
  direction:"Give "+subject+" an on-screen response to the previous chapter. Make the new beat different; do not replay the same scene.",
  next:"An interview, goal-setting promo or a fresh character spotlight can make the reaction matter."};
 if(choice==="CHANGE_PRESENTATION")return {
  headline:"A fresh point of view",
  direction:"Change how "+subject+" are presented. A new speaker, setting or motivation is an option—not an automatic change of loyalty.",
  next:"Try a different kind of segment and write its roles and outcome yourself."};
 return {headline:"Let the tension grow",
  direction:"Hold back the next escalation for "+subject+". No absence, betrayal or backstage dispute has been assumed.",
  next:"A short recap or an understated interview can keep the journey alive without rushing a payoff."};
}
