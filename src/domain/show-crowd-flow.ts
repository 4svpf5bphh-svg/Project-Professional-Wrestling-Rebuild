/** Ringside card-by-card audience scores, not a fabricated minute-by-minute
 * trajectory. Pure projection of the immutable completed show receipt.
 */
import type {CompletedShowView,ShowResultEntry} from "../db/show-results-view.js";

export interface CrowdFlowMoment{
 slotId:string;position:number;kind:"MATCH"|"SEGMENT";
 crowdResponse:number;title:string;
 standout:boolean;cold:boolean;
}
export function showCrowdFlow(show:CompletedShowView):CrowdFlowMoment[]{
 if(show.entries.length>100)throw new Error("Completed show flow exceeds slot bound");
 const entries=[...show.entries].sort((a,b)=>a.position-b.position);
 const used=new Set<string>(),positions=new Set<number>();
 let peak:ShowResultEntry|null=null;
 for(const entry of entries){
  if(used.has(entry.slotId)||positions.has(entry.position)||
   !Number.isSafeInteger(entry.position)||entry.position<0||
   typeof entry.slotId!=="string"||!entry.slotId||
   !Number.isFinite(entry.crowdResponse)||
   entry.crowdResponse<0||entry.crowdResponse>100)
   throw new Error("Invalid completed crowd flow");
  used.add(entry.slotId);positions.add(entry.position);
  if(!peak||entry.crowdResponse>peak.crowdResponse)
   peak=entry;
 }
 return entries.map(entry=>({
  slotId:entry.slotId,position:entry.position,kind:entry.type,
  crowdResponse:entry.crowdResponse,
  title:entry.headline,
  standout:entry.slotId===peak?.slotId,
  cold:entry.crowdResponse<45,
 }));
}
