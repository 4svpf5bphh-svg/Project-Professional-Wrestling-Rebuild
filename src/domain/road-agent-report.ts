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
 const prefix=agent?.personality==="FRANK"?"No sugar-coating: ":
  agent?.personality==="ECCENTRIC"?"The clipboard never lies: ":
  agent?.personality==="PATIENT"?"Here's the constructive read: ":"";
 const praise=best?
  "Card "+(best.m.position+1)+" led the in-ring ratings with "+
  best.f.ratingStars.toFixed(2)+" stars and a crowd response of "+
  Math.round(best.m.crowdResponse)+"/100.":
  "There were no match results available for an in-ring breakdown.";
 const concern=injuries?
  injuries+" recorded injury "+(injuries===1?"incident needs":"incidents need")+
  " a review with medical staff before further booking.":
  weakest&&weakest.f.executionQuality<55?
   "Card "+(weakest.m.position+1)+" had an execution score of "+
   Math.round(weakest.f.executionQuality)+"/100. Plan a simpler structure next time.":
  lowChem?
   "Card "+(lowChem.m.position+1)+
   " had a below-par recorded chemistry modifier. Consider a different pairing.":
   "No serious execution or injury warning in the verified match evidence.";
 const recommendation=linked===0&&matches.length?
  "Give your next card a clearer ongoing programme connection; none of these matches registered an active programme link.":
  highChem?
   "The chemistry on card "+(highChem.m.position+1)+
   " was a strength. Consider building on that pairing.":
  receipt.segments.length===0?
   "Consider an angle to frame the next show's stakes without rewriting your results.":
   "Keep the best-performing beats and vary the structure around them next week.";
 return {reporter,staffId:agent?.staffId??null,
  headline:prefix+"A "+(receipt.crowdResponse>=70?"strong":"mixed")+
   " night in the ring",praise,concern,recommendation,
  strongestMatchId:best?.m.matchId??null,reviewedMatches:matches.length};
}
