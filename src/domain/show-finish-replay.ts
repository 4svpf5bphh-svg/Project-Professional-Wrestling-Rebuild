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
  CLEAN_PIN:{title:"CLEAN PINFALL",description:"The referee counts three. The official result is a clean pin.",
   tone:"CLEAN"},
  FLASH_PIN:{title:"FLASH PIN",description:"A sudden pinfall seals the recorded decision.",
   tone:"CLEAN"},
  SUBMISSION:{title:"SUBMISSION",description:"A submission brings the official decision.",
   tone:"CLEAN"},
  DISQUALIFICATION:{title:"DISQUALIFIED!",description:"The match ends on a referee's disqualification decision, not a clean fall.",
   tone:"DIRTY"},
  FOREIGN_OBJECT:{title:"DIRTY VICTORY",description:"The recorded finish involves a foreign object. The official result stands.",
   tone:"DIRTY"},
  PROTECTED_FINISH:{title:"PROTECTED FINISH",description:"The result is recorded, but the contest does not end in a clean pin or submission.",
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
 const runIn=entry.fallout?.interference?.outcome==="SUCCESS"?
  " A confirmed outside run-in also took place.":"";
 return {title:result.title,description:result.description+affected+runIn,
  tone:result.tone,winnerLabel:winner};
}
