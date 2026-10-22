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
  CLEAN_PIN:{title:"THREE-COUNT",description:"The winner keeps the shoulders down for three, with no outside interference recorded.",
   tone:"CLEAN"},
  FLASH_PIN:{title:"CAUGHT OUT",description:"A sudden cradle or roll-up leaves no time to kick out.",
   tone:"CLEAN"},
  SUBMISSION:{title:"TAP OUT",description:"The hold forces the referee's decision.",
   tone:"CLEAN"},
  DISQUALIFICATION:{title:"REFEREE HAS SEEN ENOUGH",description:"The official calls for the bell and awards the decision by disqualification.",
   tone:"DIRTY"},
  FOREIGN_OBJECT:{title:"A WIN WITH AN ASTERISK",description:"Something illicit swung the balance while the referee's view was elsewhere. The decision stands.",
   tone:"DIRTY"},
  PROTECTED_FINISH:{title:"A CONTROVERSIAL END",description:"There is plenty to argue about in that finish, even if the winner's hand was raised.",
   tone:"DIRTY"},
  INJURY_STOPPAGE:{title:"REFEREE STOPPAGE",description:"A serious injury forces the match to end early. The official winner is taken from the revised medical result.",
   tone:"MEDICAL"},
  OVER_THE_TOP_ROPE:{title:"FINAL ELIMINATION",description:"The last over-the-top-rope elimination decides the recorded winner.",
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
  " "+cheater+" was caught bringing the weapon into play.":"";
 const runIn=entry.fallout?.interference?.outcome==="SUCCESS"?
  " A confirmed outside run-in also took place.":"";
 return {title:result.title,description:result.description+dirtyDetail+affected+runIn,
  tone:result.tone,winnerLabel:winner};
}
