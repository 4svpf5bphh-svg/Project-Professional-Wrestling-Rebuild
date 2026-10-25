/** Deterministic professional assessment of immutable match evidence.
 * Not a Ringside article. A report never describes unrecorded moves,
 * outcomes, unverified chemistry, or improvements to a scripted finish.
 */
import type {CompletedShowReceipt} from "./completed-show-receipt.js";
import type {RecordedMatchReportFact} from "../db/record-match-report-facts.js";
import type {WorldStaffMember} from "./world-staff.js";
export interface RoadAgentReport{
 reporter:string;staffId:string|null;headline:string;
 praise:string;concern:string;recommendation:string;
 strongestMatchId:string|null;reviewedMatches:number;
}
export function deriveRoadAgentReport(receipt:CompletedShowReceipt,
 facts:readonly RecordedMatchReportFact[],agent:WorldStaffMember|null):RoadAgentReport{
 if(facts.length!==receipt.matches.length||
  new Set(facts.map(x=>x.matchId)).size!==facts.length)
  throw new Error("Road Agent report requires complete verified match evidence");
 const matches=receipt.matches.map(m=>{
  const f=facts.find(x=>x.matchId===m.matchId);
  if(!f||!Number.isFinite(f.ratingStars)||!Number.isFinite(f.executionQuality))
   throw new Error("Missing certified match evidence for staff report");
  return {m,f};
 });
 const best=[...matches].sort((a,b)=>
  b.f.ratingStars-a.f.ratingStars||b.m.crowdResponse-a.m.crowdResponse)[0];
 const weakest=[...matches].sort((a,b)=>a.f.ratingStars-b.f.ratingStars)[0];
 const injuries=matches.reduce((sum,x)=>sum+x.f.injuries.length,0);
 const linked=matches.filter(x=>(x.f.linkedProgrammes??0)>0).length;
 const highChem=matches.find(x=>x.f.chemistryModifier>=3);
 const lowChem=matches.find(x=>x.f.chemistryModifier<=-3);
 const reporter=agent?.name??"PPW House Road Agent";
 const voice=agent?.personality??"BALANCED";
 const bestCrowd=best?.m.crowdResponse??0;
 const mood=best?.f.ratingStars!==undefined&&best.f.ratingStars>=4?
  "was worth watching again":bestCrowd>=70?"got the room on its side":"showed promise";
 const finalMatch=matches.reduce((max,item)=>Math.max(max,item.m.position),-1);
 const opener=matches.reduce((min,item)=>Math.min(min,item.m.position),Infinity);
 const place=best?.m.position===finalMatch?"the closing bout":
  best?.m.position===opener?"the opener":"a match in the middle of the card";
 const bestFinish=best?.m.actualFinish??null;
 const finishPoint=bestFinish==="SUBMISSION"?"The submission was a decisive finish.":
  bestFinish==="INJURY_STOPPAGE"?
   "An injury stoppage was never going to be a crowd-pleasing ending.":
  bestFinish==="RETRIEVAL"?"The ladder retrieval gave it a clear destination.":
  bestFinish==="TABLE_BREAK"?"The table-break finish gave it a clear payoff.":
  bestFinish==="TEN_COUNT"?"The ten-count gave the finish some finality.":
  bestFinish==="DISQUALIFICATION"?
   "That disqualification leaves business to settle.":"";
 const praise=best?(
  voice==="FRANK"?
   "Best thing we did was "+place+". It "+mood+
    ". That's the level the rest of the card needs to chase.":
  voice==="ECCENTRIC"?
   "I'd put a star next to "+place+". It "+mood+
    " — the sort of thing you want people remembering on the way home.":
  voice==="PATIENT"?
   "There's something we can build from in "+place+
    ". It "+mood+". Give that part of the show room to grow.":
  voice==="AMBITIOUS"?
   "Look at "+place+": it "+mood+
    ". Now imagine getting the rest of the card to that standard.":
  voice==="LOYAL"?
   "Credit to the crew on "+place+". It "+mood+
    ", and the people involved deserve to hear that.":
   "I'd build on "+place+". It "+mood+
    "; "+(finishPoint||"the audience had a reason to pay attention.")
 ):"We didn't have a contest to judge. I'd like a proper bell-to-bell bout on the next show.";
 const ranLong=matches.find(x=>x.f.plannedMinutes!==undefined&&
  x.f.actualMinutes-x.f.plannedMinutes>=5);
 const concern=injuries>0?
  (voice==="FRANK"?"First priority: we've got an injury to deal with. ":
   "We need to check on the injured talent. ")+
   "Let Medical decide who is cleared before we make next week's promises.":
  ranLong?
   "We had a match run noticeably longer than planned. Protect the rest of the card's breathing room.":
  weakest&&weakest.f.executionQuality<55?
   "The weakest bout asked more of the wrestlers than the execution delivered. I'd simplify the layout before booking that combination again.":
  lowChem?
   "That pairing never quite settled together. No need to blame anyone, but I wouldn't immediately ask them to go longer.":
  linked===0&&matches.length>1?
   "The wrestling had moments, but the card could use a stronger thread between the matches.":
   "I haven't got a major in-ring warning from the completed show.";
 const recommendation=injuries>0?
  "Medical clearance first. Rebuild the next card around the people who can actually wrestle.":
  linked===0&&matches.length?
   "Follow "+place+" with a clear challenge or rivalry. A strong match means more when something is at stake.":
  highChem?
   "Those wrestlers worked well together. Revisit the pairing, but give them a new reason to meet.":
  receipt.segments.length===0?
   "Put a short confrontation between the matches. Let the audience know why the next fight matters.":
   "Keep the strongest story moving, trim the less convincing parts and set one unmistakable hook for next week.";
 const parting=voice==="FRANK"?" No need to dress it up.":
  voice==="PATIENT"?" Small improvements next week will add up.":
  voice==="ECCENTRIC"?" And give them one moment they'll argue about on the way out.":
  voice==="AMBITIOUS"?" Next week we raise the bar.":
  voice==="LOYAL"?" And make sure the locker room knows who delivered.":"";
 const headline=voice==="FRANK"?"Here's what worked, and what didn't":
  voice==="ECCENTRIC"?"A word from behind the curtain":
  voice==="PATIENT"?"Building on tonight":
  voice==="AMBITIOUS"?"Where we go from here":
  voice==="LOYAL"?"Credit where it's due":
  bestCrowd>=75?"A show to build on":"A few notes before next week";
 return {reporter,staffId:agent?.staffId??null,
  headline,praise,concern,recommendation:recommendation+parting,
  strongestMatchId:best?.m.matchId??null,reviewedMatches:matches.length};
}
