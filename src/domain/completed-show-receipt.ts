/** Immutable, server-authored show resolution receipt contract.
 * Pure validation only. Persistence and World Lock checks belong to a later
 * single-transaction command, not to this module or a client-supplied score.
 */
export interface CompletedMatchReceipt {
 matchId:string;position:number;crowdResponse:number;
 actualFinish:string;actualWinnerSide:"A"|"B"|"C"|"D"|null;
}
export interface CompletedSegmentReceipt {
 slotId:string;position:number;kind:string;
 outcome:"HAPPENS"|"REFUSED"|"INTERRUPTED";crowdResponse:number;
}
export interface CompletedShowReceipt {
 worldId:string;promotionId:string;showId:string;
 year:number;week:number;resolutionId:string;
 crowdResponse:number;
 matches:readonly CompletedMatchReceipt[];
 segments:readonly CompletedSegmentReceipt[];
}
const score=(n:number)=>Number.isFinite(n)&&n>=0&&n<=100;
const id=(s:string)=>typeof s==="string"&&s.trim().length>0&&s.length<=200;
export function validateCompletedShowReceipt(r:CompletedShowReceipt):CompletedShowReceipt{
 if(!id(r.worldId)||!id(r.promotionId)||!id(r.showId)||!id(r.resolutionId)||
  !Number.isSafeInteger(r.year)||r.year<1||
  !Number.isSafeInteger(r.week)||r.week<1||r.week>52||
  !score(r.crowdResponse)||r.matches.length>100||r.segments.length>100||
  r.matches.length+r.segments.length===0)
  throw new Error("Invalid completed show receipt");
 const slots=new Set<string>(),positions=new Set<number>();
 for(const m of r.matches){
  if(!id(m.matchId)||slots.has(m.matchId)||!Number.isSafeInteger(m.position)||
   m.position<0||positions.has(m.position)||!score(m.crowdResponse)||
   !id(m.actualFinish)||!["A","B","C","D",null].includes(m.actualWinnerSide))
   throw new Error("Invalid completed match receipt");
  slots.add(m.matchId);positions.add(m.position);
 }
 for(const s of r.segments){
  if(!id(s.slotId)||slots.has(s.slotId)||!Number.isSafeInteger(s.position)||
   s.position<0||positions.has(s.position)||!score(s.crowdResponse)||
   !id(s.kind)||!["HAPPENS","REFUSED","INTERRUPTED"].includes(s.outcome))
   throw new Error("Invalid completed segment receipt");
  slots.add(s.slotId);positions.add(s.position);
 }
 return {...r,matches:r.matches.map(m=>({...m})),
  segments:r.segments.map(s=>({...s}))};
}
/** Retry-safe comparison: a duplicate show must be byte-for-byte equivalent
 * after canonical slot ordering. A conflicting resolution must never overwrite.
 */
export function canonicalCompletedShowReceipt(r:CompletedShowReceipt):string{
 const valid=validateCompletedShowReceipt(r);
 return JSON.stringify({...valid,
  matches:[...valid.matches].sort((a,b)=>a.position-b.position),
  segments:[...valid.segments].sort((a,b)=>a.position-b.position)});
}
