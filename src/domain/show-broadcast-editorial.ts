/** A complete show editorial assembled only from sealed result entries.
 * This is the always-on fallback when eventual AI prose is unavailable.
 * No extra reads, no speculative actions, and no mutable current World state.
 */
import type {CompletedShowView,ShowResultEntry}
 from "../db/show-results-view.js";
import {reviewCompletedEntry} from "./show-broadcast-review.js";
export interface FinalBellEditorial{
 headline:string;eyebrow:string;
 paragraphs:readonly string[];
 standoutSlotId:string|null;
 championshipChanges:number;injuryReports:number;
 averageCriticalRating:number|null;
}
function round(n:number){return Math.round(n*10)/10;}
function matchName(entry:ShowResultEntry):string{
 const sides=entry.matchContext?.sides??[];
 return sides.length?sides.map(side=>side.join(" & ")).join(" vs "):
  entry.headline;
}
export function writeFinalBellEditorial(show:CompletedShowView):FinalBellEditorial{
 const matches=show.entries.filter(entry=>entry.type==="MATCH");
 const angles=show.entries.filter(entry=>entry.type==="SEGMENT");
 const rated=matches.filter(x=>x.fallout?.ratingStars!==undefined);
 const ratedAvg=rated.length?round(rated.reduce((a,m)=>
  a+m.fallout!.ratingStars!,0)/rated.length):null;
 const standout=[...matches].sort((a,b)=>{
  const aa=a.fallout?.ratingStars,bb=b.fallout?.ratingStars;
  if(aa!==undefined&&bb!==undefined&&aa!==bb)return bb-aa;
  if(aa!==undefined&&bb===undefined)return -1;
  if(aa===undefined&&bb!==undefined)return 1;
  return b.crowdResponse-a.crowdResponse||a.position-b.position;
 })[0]??null;
 const transfers=matches.flatMap(entry=>entry.fallout?.title?.changed?
  [{entry,change:entry.fallout.title}]:[]);
 const injuries=matches.flatMap(entry=>(entry.fallout?.injuries??[])
  .map(injury=>({entry,injury})));
 const completedAngles=angles.filter(entry=>entry.outcome==="HAPPENS");
 const event=show.showName??"The show";
 const title=transfers[0]?.change;
 const stoppage=injuries.find(x=>x.injury.stoppage);
 const angle=[...completedAngles].sort((a,b)=>b.crowdResponse-a.crowdResponse||a.position-b.position)[0];
 const standoutRating=standout?.fallout?.ratingStars;
 const headline=title?title.winnerName+" takes the "+title.name:
  stoppage?"A stoppage changes the night at "+event:
  standout&&standoutRating!==undefined&&standoutRating>=4?matchName(standout)+" gives "+event+" its best bout":
  show.crowdResponse<45?event+" struggles to get the crowd going":event+" at the final bell";
 const paragraphs:string[]=[];
 paragraphs.push(!show.entries.length?event+" closed without a recorded match or segment.":
  show.crowdResponse>=80?event+" had a crowd that made itself heard.":
  show.crowdResponse<45?event+" had trouble getting a reaction. A card can make sense on paper and still leave the room cold.":
  event+" drew a mixed reception. Some parts of the card landed better than others.");
 if(standout){
  const review=reviewCompletedEntry(standout,show.showId);
  const judgement=standoutRating===undefined?"The crowd’s standout":
   standoutRating>=4?"The strongest wrestling on the card":
   standoutRating<2.5?"Even the highest-rated match struggled":
   "The highest-rated match";
  paragraphs.push((standoutRating!==undefined&&standoutRating<2.5?
   judgement+" to make a case for the card. "+matchName(standout)+" had the best of a thin field.":
   judgement+" was "+matchName(standout)+".")+" "+review.verdict);
 }
 const updates=transfers.map(({change})=>change.winnerName+" won the "+change.name+
  (change.priorHolderName?" from "+change.priorHolderName:change.priorHolderName===null?", filling the vacancy":"")+".");
 if(stoppage)updates.push("The match involving "+stoppage.injury.personName+" ended in a medical stoppage.");
 else if(injuries[0])updates.push("There was an injury concern for "+injuries[0].injury.personName+" after the match.");
 if(angle)updates.push("Away from the matches, "+angle.headline+" drew "+
  (angle.crowdResponse>=75?"a strong reaction.":angle.crowdResponse<45?"little response.":"a mixed response."));
 if(!updates.length&&standout&&show.entries.some(e=>e.crowdResponse-standout.crowdResponse>=20))
  updates.push("The best-reviewed wrestling and the loudest reaction came in different parts of the card.");
 if(updates.length)paragraphs.push(updates.join(" "));
 return {headline,eyebrow:"THE FINAL BELL / EDITORIAL RECAP",
  paragraphs,standoutSlotId:standout?.slotId??null,
  championshipChanges:transfers.length,injuryReports:injuries.length,
  averageCriticalRating:ratedAvg};
}
