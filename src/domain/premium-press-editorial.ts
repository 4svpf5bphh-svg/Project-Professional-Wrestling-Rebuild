/** Media coverage comes only from the certified show and saved public
 * manager replies. No model call, invented quote or private future card.
 * Each channel has its own editorial angle on the SAME recorded words.
 */
import type {CompletedShowView} from "../db/show-results-view.js";
import {premiumScrumQuestions,type ScrumQuestionId} from "./premium-media-scrum.js";

export interface PressEditorialStory{
 storyKey:string;desk:"OFFICIAL"|"DIRT";certainty:"CONFIRMED"|"SPECULATION";
 title:string;summary:string;
}
export type PressReplyMode="DIRECT"|"EVASIVE"|"DECLINED";
const shorten=(s:string,n:number)=>s.length>n?s.slice(0,n-1).trimEnd()+"…":s;
/** Interpret original, immutable answer choices, so existing saves retain
 * precisely the same dialogue without migration or silent reclassification
 * of an already published World event.
 */
export function pressReplyMode(questionId:ScrumQuestionId,index:number):
 PressReplyMode|null{
 if(!Number.isInteger(index)||index<0||index>2)return null;
 if(questionId==="MAIN_EVENT")
  return (["DIRECT","EVASIVE","DECLINED"] as const)[index]!;
 if(questionId==="BIG_PICTURE")
  return (["DIRECT","DIRECT","EVASIVE"] as const)[index]!;
 if(questionId==="NEXT_CHAPTER")
  return "EVASIVE"; // None of the three original replies announces a card.
 return null;
}
export function publishablePressEditorial(
 show:CompletedShowView,managerName:string,
 responses:ReadonlyMap<ScrumQuestionId,number>,
 options:{sessionEnded?:boolean}={},
):PressEditorialStory[]{
 if(show.bookingClass!=="PREMIUM")return [];
 const questions=premiumScrumQuestions(show);
 const spoken=questions.flatMap(q=>{
  const index=responses.get(q.id);
  const mode=index===undefined?null:pressReplyMode(q.id,index);
  return mode===null||index===undefined||!q.answers[index]?[]:[{
   answer:q.answers[index]!,questionId:q.id,mode,
   journalist:q.journalist.split(" · ")[0]!
  }];
 });
 // An unanswered, *unvisited* session is absent, not public silence.
 // Explicit Skip/End with no answers is a public event, with no quote.
 if(!spoken.length&&!options.sessionEnded)return [];
 const name=shorten(managerName.trim()||"The promotion's manager",48);
 const event=shorten(show.showName??"the premium event",75);
 const key=show.showId.slice(0,170);
 if(!spoken.length)return [
  {storyKey:"press:official:"+key,desk:"OFFICIAL",certainty:"CONFIRMED",
   title:shorten(name+" ends the press conference without taking questions after "+event,240),
   summary:shorten(name+" ended the post-show press session for "+event+
    " without answering any of the three scheduled questions. "+
    "No statement or reason was given on the record.",600)},
  {storyKey:"press:rumour:"+key,desk:"DIRT",certainty:"SPECULATION",
   title:shorten("No answers from "+name+" after "+event+" — the rumour mill reacts",240),
   summary:shorten(name+" ended the press conference after "+event+
    " without taking questions. There is no public explanation or quote to interpret. "+
    "Fans are debating the silence, but no backstage dispute or future match has been established.",600)}
 ];
 const lead=spoken.find(s=>s.questionId==="MAIN_EVENT")??spoken[0]!;
 const main=show.entries.filter(e=>e.type==="MATCH").at(-1);
 const result=main?.headline?shorten(main.headline,96):event;
 const isMain=lead.questionId==="MAIN_EVENT";
 const subject=isMain?"the main event — "+result:
  lead.questionId==="BIG_PICTURE"?"the show":"the next chapter";
 const quote=(answer:string)=>'"'+answer+'"';
 const reportLead=lead.mode==="DECLINED"?
  name+" declined "+lead.journalist+"'s question about "+subject+
   ", replying "+quote(lead.answer)+".":
  lead.mode==="EVASIVE"?
  name+" offered no concrete details when "+lead.journalist+
   " asked about "+subject+", replying "+quote(lead.answer)+".":
  name+" answered "+lead.journalist+" about "+subject+
   ", saying "+quote(lead.answer)+".";
 // At most one additional answer; only if there is room to publish the
 // exact unmodified quote. An unanswered question is never paraphrased.
 const another=spoken.find(s=>s!==lead);
 const followUp=another?
  " When "+another.journalist+" asked a separate question, "+
   name+" replied "+quote(another.answer)+".":"";
 const partial=options.sessionEnded&&spoken.length<questions.length?
  " "+(questions.length-spoken.length)+" remaining "+
  (questions.length-spoken.length===1?"question was":"questions were")+
  " left unanswered when the session ended.":"";
 // Keep the manager's exact chosen words, never truncate an attributed quote.
 const baseSummary=reportLead.length+followUp.length<=580?
  reportLead+followUp:reportLead;
 const officialSummary=baseSummary.length+partial.length<=590?
  baseSummary+partial:baseSummary;
 const officialTitle=lead.mode==="DECLINED"?
  name+" says no comment after "+event:
  lead.mode==="EVASIVE"?
  name+" keeps details close after "+event:
  name+" addresses the wrestling press after "+event;
 const dirtTitle=lead.mode==="DECLINED"?
  "No comment from "+name+" after "+event+" — and the questions begin":
  lead.mode==="EVASIVE"?
  name+" kept details close. What happens after "+event+"?":
  "Fans dissect "+name+"'s remarks after "+event;
 const dirtSummary=lead.mode==="DECLINED"?
  name+" publicly declined "+lead.journalist+"'s question about "+subject+
   '. The response was '+quote(lead.answer)+
   ". The refusal is real; the reason has not been established. That has not stopped the speculation.":
  lead.mode==="EVASIVE"?
  name+" spoke after "+event+" but gave no concrete answer about "+subject+
   '. The reply was '+quote(lead.answer)+
   ". Is something being kept under wraps, or is this just a promoter staying cautious? The public remarks give no answer.":
  name+" answered "+lead.journalist+" after "+event+
   ' with '+quote(lead.answer)+
   ". Fans are debating what it means for the next card, but no fresh booking or backstage disagreement was announced.";
 const dirtWithSilence=partial&&dirtSummary.length+partial.length<=590?
  dirtSummary+partial:dirtSummary;
 return [
  {storyKey:"press:official:"+key,desk:"OFFICIAL",certainty:"CONFIRMED",
   title:shorten(officialTitle,240),summary:shorten(officialSummary,600)},
  {storyKey:"press:rumour:"+key,desk:"DIRT",certainty:"SPECULATION",
   title:shorten(dirtTitle,240),summary:shorten(dirtWithSilence,600)}
 ];
}
