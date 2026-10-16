import type {FinalizedSinglesMatch,FinalizedAuthoredSegment}
 from "./finalize-resolved-show.js";
/** Pure weighted show aggregation; not an authoritative World resolution. */
export function aggregateShowReactions(
 matches:readonly (FinalizedSinglesMatch&{weight:number})[],
 segments:readonly FinalizedAuthoredSegment[],
){
 const ids=new Set<string>(),positions=new Set<number>();
 let total=0,weighted=0;
 for(const m of matches){
  if(ids.has(m.matchId)||positions.has(m.position)||
   !Number.isSafeInteger(m.position)||m.position<0||
   !Number.isFinite(m.weight)||m.weight<=0||
   !Number.isFinite(m.crowdResponse)||m.crowdResponse<0||
   m.crowdResponse>100)throw new Error("Invalid match show aggregation");
  ids.add(m.matchId);positions.add(m.position);
  total+=m.weight;weighted+=m.weight*m.crowdResponse;
 }
 for(const s of segments){
  if(ids.has(s.slotId)||positions.has(s.position)||
   !Number.isSafeInteger(s.position)||s.position<0||
   !Number.isFinite(s.crowdResponse)||s.crowdResponse<0||
   s.crowdResponse>100||s.bookedOutcome!==s.resolvedOutcome)
   throw new Error("Invalid segment show aggregation");
  ids.add(s.slotId);positions.add(s.position);
  total+=0.65;weighted+=0.65*s.crowdResponse;
 }
 if(!Number.isFinite(total)||total<=0||!Number.isFinite(weighted))
  throw new Error("Empty or invalid show");
 return {phase:"SHOW_AGGREGATION_PREVIEW" as const,
  crowdResponse:Math.round(weighted/total*10)/10,
  matchCount:matches.length,segmentCount:segments.length};
}
