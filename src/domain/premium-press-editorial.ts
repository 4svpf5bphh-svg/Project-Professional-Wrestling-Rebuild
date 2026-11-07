/** Published press coverage is derived from saved, owner-authored answers.
 * Skips never become quotes or fictional refusals. Rumours remain speculative.
 */
import type {CompletedShowView} from "../db/show-results-view.js";
import {premiumScrumQuestions,type ScrumQuestionId} from "./premium-media-scrum.js";
export interface PressEditorialStory{
 storyKey:string;desk:"OFFICIAL"|"DIRT";certainty:"CONFIRMED"|"SPECULATION";
 title:string;summary:string;
}
const shorten=(s:string,n:number)=>s.length>n?s.slice(0,n-1).trimEnd()+"…":s;
export function publishablePressEditorial(show:CompletedShowView,managerName:string,
 responses:ReadonlyMap<ScrumQuestionId,number>):PressEditorialStory[]{
 if(show.bookingClass!=="PREMIUM"||responses.size===0)return [];
 const spoken=premiumScrumQuestions(show).flatMap(q=>{
  const index=responses.get(q.id);
  return index===undefined||!q.answers[index]?[]:[{
   answer:q.answers[index]!,questionId:q.id,journalist:q.journalist.split(" · ")[0]!
  }];
 });
 if(!spoken.length)return [];
 const lead=spoken.find(s=>s.questionId==="MAIN_EVENT")??spoken[0]!;
 const name=shorten(managerName.trim()||"The promotion's manager",48);
 const event=shorten(show.showName??"the premium event",75);
 const main=show.entries.filter(e=>e.type==="MATCH").at(-1);
 const result=main?.headline?shorten(main.headline,100):event;
 const literalQuote=shorten(lead.answer,235);
 const declined=lead.answer.startsWith("No comment.");
 const title=declined?name+" declines main-event question after "+event:
  name+" addresses journalists following "+event;
 const mainBody=declined?
  name+" declined to discuss "+result+" when questioned by "+lead.journalist+
   ', stating: "'+literalQuote+'"':
  name+" answered "+lead.journalist+" about "+result+
   ' following '+event+', stating: "'+literalQuote+'"';
 const rumourTitle=declined?
  "What is behind "+name+"'s no-comment response?":
  "Debate follows "+name+"'s post-show remarks";
 const speculation=declined?
  name+' declined one public question. Why is unknown; claims about hidden backstage issues are unverified. The recorded words were: "'+literalQuote+'"':
  name+' spoke publicly after '+event+'. Fans are reading between the lines, but no backstage dispute or future booking has been verified. The recorded words were: "'+literalQuote+'"';
 const key=show.showId.slice(0,170);
 return [
  {storyKey:"press:official:"+key,desk:"OFFICIAL",certainty:"CONFIRMED",
   title:shorten(title,240),summary:shorten(mainBody,600)},
  {storyKey:"press:rumour:"+key,desk:"DIRT",certainty:"SPECULATION",
   title:shorten(rumourTitle,240),summary:shorten(speculation,600)}
 ];
}
