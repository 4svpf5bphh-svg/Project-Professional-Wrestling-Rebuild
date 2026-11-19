import {finishPropLabel} from "./bookable-match.js";
/** Succinct, result-compatible match colour when a Groq report is unavailable. */
import type {ShowResultEntry} from "../db/show-results-view.js";
const choice=(items:readonly string[],seed:string,salt:number)=>{
 let hash=(2166136261^salt)>>>0;
 for(const c of seed){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619)}
 return items[(hash>>>0)%items.length]!;
};
export function shortResultColour(entry:ShowResultEntry,showId:string):string{
 const key=showId+":"+entry.slotId;
 if(entry.type==="SEGMENT"){
  const who=entry.segmentContext?.actorNames.join(" & ")||"The featured talent";
  if(entry.outcome==="REFUSED")return who+" refused to go through with it. The planned moment never happened.";
  if(entry.outcome==="INTERRUPTED")return who+" never got to finish the moment; the interruption stole the spotlight.";
  const mood=entry.crowdResponse>=75?"had the crowd hanging on the moment":
   entry.crowdResponse<45?"struggled to stir the audience":"gave the crowd something to chew over";
  return who+(entry.segmentKind==="PROMO"||entry.segmentKind==="INTERVIEW"?
   " took the microphone and ":" took centre stage and ")+mood+".";
 }
 const winner=entry.matchContext?.winnerNames.join(" & ")||"The winner";

 const mood=entry.crowdResponse>=80?choice(["The building erupted.","The crowd roared its approval."],key,1):
  entry.crowdResponse<46?choice(["The crowd was hard to win over.","The finish drew a muted reaction."],key,2):
  choice(["The reaction said plenty.","That gave the crowd something to talk about."],key,3);
 let story:string;
 switch(entry.outcome){
  case "CLEAN_PIN":story=winner+" seized an opening and scored the decisive three-count.";break;
  case "FLASH_PIN":story=winner+" stole it with "+
   choice(["a quick inside cradle","a desperate roll-up","a flash counter"],key,4)+".";break;
  case "SUBMISSION":story=winner+" locked in a submission and forced the decisive tap.";break;
  case "FOREIGN_OBJECT":story=(entry.fallout?.finishCheaterName??winner)+
   " used "+(entry.matchContext?.finishProp?"a "+finishPropLabel(entry.matchContext.finishProp):
    "a concealed weapon")+" out of the referee's sight. "+winner+
   " left with the decision.";break;
  case "PROTECTED_FINISH":story=winner+
   " got the decision, but the ending left the other side with plenty to complain about.";break;
  case "DISQUALIFICATION":story="The official called for the bell. "+
   winner+" took the win by disqualification.";break;
  case "INJURY_STOPPAGE":story="The referee waved it off when injury halted the match. "+
   winner+" took the decision.";break;
  case "OVER_THE_TOP_ROPE":story=winner+" survived the final elimination.";break;
  default:story=winner+" got the win.";
 }
 return story+" "+mood;
}
