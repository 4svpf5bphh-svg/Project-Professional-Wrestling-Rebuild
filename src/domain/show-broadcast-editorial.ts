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
function plural(n:number,a:string,b=a+"s"){return n===1?a:b;}
function round(n:number){return Math.round(n*10)/10;}
function reportedWinner(entry:ShowResultEntry):string{
 const winners=entry.matchContext?.winnerNames??[];
 return winners.length?winners.join(" & "):"the recorded winner";
}
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
 const hotMoments=show.entries.filter(entry=>entry.crowdResponse>=80).length;
 const headline=transfers.length?"Gold changes hands at the final bell":
  injuries.some(x=>x.injury.stoppage)?"A night interrupted by the referee":
  standout?.fallout?.ratingStars!==undefined&&standout.fallout.ratingStars>=4?
   "The card delivers a standout contest":
  show.crowdResponse>=80?"An electric night for the promotion":
  show.crowdResponse<45?"A tough night in front of the crowd":
  "The final bell has sounded";
 const paragraphs:string[]=[];
 paragraphs.push("Year "+show.year+", week "+show.week+" is in the books. "+
  matches.length+" "+plural(matches.length,"match","matches")+" and "+
  angles.length+" "+plural(angles.length,"angle")+" made up the card. "+
  "The show's overall audience response was "+round(show.crowdResponse)+"/100"+
  (ratedAvg===null?".":", with an average in-ring rating of "+ratedAvg.toFixed(1)+
   "/5 from "+rated.length+" scored "+plural(rated.length,"bout")+"."));
 if(standout){
  const reviewed=reviewCompletedEntry(standout,show.showId);
  const rating=standout.fallout?.ratingStars;
  paragraphs.push((rating===undefined?"The crowd's standout contest":
   "The highest-rated match")+" featured "+matchName(standout)+". "+
   reportedWinner(standout)+" "+
   (standout.outcome==="INJURY_STOPPAGE"?
    "was awarded the result after a medical stoppage":
    "finished on the winning side")+" via "+
   standout.outcome.toLowerCase().replaceAll("_"," ")+". "+
   (rating!==undefined?"The official match rating was "+rating.toFixed(2)+
    "/5; ":"")+"the crowd scored it "+round(standout.crowdResponse)+"/100. "+
   reviewed.verdict);
 }
 if(transfers.length||injuries.length||hotMoments>0||completedAngles.length){
  const updates:string[]=[];
  if(transfers.length)
   updates.push(transfers.map(x=>x.change.winnerName+" won the "+
    x.change.name).join("; ")+".");
  if(injuries.length)
   updates.push(injuries.length+" recorded "+plural(injuries.length,"injury","injuries")+
    ", including "+injuries.slice(0,2).map(x=>x.injury.personName+
     " ("+x.injury.severity.toLowerCase()+")").join(" and ")+".");
  if(hotMoments>0)
   updates.push(hotMoments+" "+plural(hotMoments,"moment")+
    " drew an audience response of at least 80/100.");
  if(completedAngles.length)
   updates.push(completedAngles.length+" authored "+
    plural(completedAngles.length,"angle")+" went ahead as booked.");
  paragraphs.push("Beyond the bell: "+updates.join(" "));
 }
 return {headline,eyebrow:"THE FINAL BELL / EDITORIAL RECAP",
  paragraphs,standoutSlotId:standout?.slotId??null,
  championshipChanges:transfers.length,injuryReports:injuries.length,
  averageCriticalRating:ratedAvg};
}
