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
 const prefix=voice==="FRANK"?"Here's what I'd change: ":
  voice==="PATIENT"?"There is plenty to build on. ":
  voice==="ECCENTRIC"?"From my corner of the curtain: ":
  voice==="AMBITIOUS"?"We can aim higher than this: ":
  voice==="LOYAL"?"Our people put the work in: ":"";
 const bestCrowd=best?.m.crowdResponse??0;
 const praise=best?(
  bestCrowd>=70?
   "The standout match had people properly leaning forward. Its closing stretch held the room, and that's worth building on.":
   "Our strongest match showed sound in-ring work, even if the room needed a bit more convincing."
  ):"There weren't any matches for me to assess; let's give the next card something substantial.";
 const concern=injuries>0?
  "We had "+(injuries===1?"a wrestler hurt":"wrestlers hurt")+
   " tonight. I want medical clearance before we put anyone involved back in the ring.":
  weakest&&weakest.f.executionQuality<55?
   "One match struggled to find its rhythm. Too much was asked of it before the audience had a reason to invest.":
  lowChem?
   "One pairing didn't click tonight. That's not a crime, but I'd be careful about asking them to carry another long match just yet.":
   "Nothing in the completed matches gives me a serious warning to raise.";
 const recommendation=injuries>0?
  "Check with Medical first, then plan the next card around who's genuinely fit to perform.":
  linked===0&&matches.length?
   "Give the best match a reason to matter next week — a clear rivalry or challenge, not just another bout.":
  highChem?
   "That pairing clicked. I'd bring them back with a fresh wrinkle instead of running the same match again.":
  receipt.segments.length===0?
   "Set up the next show's stakes with a short in-ring confrontation before asking for the big match.":
   "Keep what connected, trim what dragged, and give the audience a different opening next time.";
 // A staff member's temperament should feel like a person advising the
 // booker, never a mathematical trait modifier or re-scoring the result.
 const parting=voice==="FRANK"?" And don't ask them to do it twice if it didn't work.":
  voice==="PATIENT"?" Give them room to find their feet, but listen to the room.":
  voice==="ECCENTRIC"?" One unexpected twist is worth more than a dozen empty promises.":
  voice==="AMBITIOUS"?" Next week needs a hook they can't ignore.":
  voice==="LOYAL"?" Tell the people who delivered that you noticed.":"";
 return {reporter,staffId:agent?.staffId??null,
  headline:prefix+(bestCrowd>=75?"That one gave us something to work with":
   "Notes from the curtain"),praise,concern,recommendation:recommendation+parting,
  strongestMatchId:best?.m.matchId??null,reviewedMatches:matches.length};
}
