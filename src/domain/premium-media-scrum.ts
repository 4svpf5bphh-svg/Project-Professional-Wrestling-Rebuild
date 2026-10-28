/** A premium-event press scrum built only from the certified card.
 * Smark tone, no fabricated title change, match quality or secret promises.
 * Player chooses one of three authored statements; there is no AI expense.
 */
import type {CompletedShowView} from "../db/show-results-view.js";
export type ScrumQuestionId="MAIN_EVENT"|"BIG_PICTURE"|"NEXT_CHAPTER";
export interface ScrumQuestion{
 id:ScrumQuestionId;journalist:string;question:string;answers:readonly [string,string,string];
}
export function premiumScrumQuestions(show:CompletedShowView):ScrumQuestion[]{
 if(show.bookingClass!=="PREMIUM")return [];
 const event=show.showName||"tonight's event";
 const matches=show.entries.filter(e=>e.type==="MATCH");
 const main=matches.at(-1);
 const opener=matches[0];
 return [{
  id:"MAIN_EVENT",journalist:"Ringside Press",
  question:main?
   `The cameras are still rolling after ${event}. Your main event was "${main.headline}". What's your reaction to that finish?`:
   `After ${event}, how do you assess the final moments of the night?`,
  answers:[
   "What happened in that ring speaks for itself. The audience saw it.",
   "There are conversations we'll have behind closed doors. Tonight was important.",
   "I know what everyone wants me to say. You'll have to wait for the next show."
  ]
 },{
  id:"BIG_PICTURE",journalist:"The Wrestling Wire",
  question:opener?
   `From "${opener.headline}" onwards, ${event} gave fans plenty to discuss. What do you want people to remember?`:
   `What do you want wrestling fans to remember about ${event}?`,
  answers:[
   "The wrestlers did the talking. I couldn't be prouder of the team.",
   "Some things worked, some things didn't. We'll be even better next time.",
   "People will still be arguing about this show for weeks. Good."
  ]
 },{
  id:"NEXT_CHAPTER",journalist:"Behind the Curtain",
  question:`Now that ${event} is in the books, what should the fans expect next?`,
  answers:[
   "The next chapter starts as soon as we walk through the curtain.",
   "Nothing is being announced tonight. We're keeping our plans close.",
   "Expect the unexpected. That's what a wrestling promotion should deliver."
  ]
 }];
}
