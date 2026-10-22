/** Finish replay uses a sealed result, not generated moves or speculation.
 * These are the factual headlines the eventual AI enhancement must preserve.
 */
import type {ShowResultEntry} from "../db/show-results-view.js";
export type FinishReplayTone="CLEAN"|"DIRTY"|"MEDICAL"|"ELIMINATION"|"UNKNOWN";
export interface FinishReplay {
 title:string;description:string;tone:FinishReplayTone;
 winnerLabel:string|null;
}
export function replayVerifiedMatchFinish(entry:ShowResultEntry):FinishReplay|null{
 if(entry.type!=="MATCH")return null;
 const winner=entry.matchContext?.winnerNames.join(" & ")||null;
 const method=entry.outcome;
 const finishes:Record<string,{title:string;description:string;tone:FinishReplayTone}>={
  CLEAN_PIN:{title:"THE THREE-COUNT",description:"The referee counted three. No shortcut or argument was needed to settle it.",
   tone:"CLEAN"},
  FLASH_PIN:{title:"CAUGHT NAPPING",description:"One opening, a lightning-fast cradle and three slaps of the canvas. That was all it took.",
   tone:"CLEAN"},
  SUBMISSION:{title:"NOWHERE TO GO",description:"The hold was locked in and the referee had a decision to make: the submission ended it.",
   tone:"CLEAN"},
  DISQUALIFICATION:{title:"THE BELL RINGS EARLY",description:"The referee spotted a foul, called for the bell and awarded the win by disqualification.",
   tone:"DIRTY"},
  FOREIGN_OBJECT:{title:"AN UGLY SHORTCUT",description:"A concealed weapon entered the picture when the referee was looking elsewhere. The decision still counts.",
   tone:"DIRTY"},
  PROTECTED_FINISH:{title:"PLENTY TO ARGUE ABOUT",description:"The decision stands, though the manner of victory left plenty of room for an argument.",
   tone:"DIRTY"},
  INJURY_STOPPAGE:{title:"REFEREE WAVES IT OFF",description:"The referee stopped the match when continuing became unsafe. There was no fall.",
   tone:"MEDICAL"},
  OVER_THE_TOP_ROPE:{title:"THE LAST ONE STANDING",description:"The final elimination came over the top rope, leaving one winner in the ring.",
   tone:"ELIMINATION"},
 };
 const match=finishes[method];
 const injury=entry.fallout?.injuries.find(x=>x.stoppage);
 const result=match??{title:"OFFICIAL RESULT",
  description:"The completed result records an official finish.",
  tone:"UNKNOWN" as const};
 const affected=method==="INJURY_STOPPAGE"&&injury?
  " Medical stoppage: "+injury.personName+" ("+injury.severity.toLowerCase()+" injury).":"";
 const cheater=entry.fallout?.finishCheaterName;
 const dirtyDetail=cheater&&method==="DISQUALIFICATION"?
  " "+cheater+" was the recorded disqualified wrestler.":
  cheater&&method==="FOREIGN_OBJECT"?
  " "+cheater+" brought the weapon into play.":"";
 const runIn=entry.fallout?.interference?.outcome==="SUCCESS"?
  " There was also a ringside run-in.":"";
 return {title:result.title,description:result.description+dirtyDetail+affected+runIn,
  tone:result.tone,winnerLabel:winner};
}
