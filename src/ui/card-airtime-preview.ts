/** In-memory prospective airtime. The card does not count an unfinished
 * wizard as a committed slot, but staff can explain its effect before it is
 * completed. The server remains authoritative on the TV time ceiling.
 */
import type {EditorMatch} from "./card-editor-model.js";
import type {EditorSegment} from "./card-segment-model.js";
export function forecastBookingAirtime(slotId:string,proposal:EditorMatch|EditorSegment,
 matches:readonly EditorMatch[],angles:readonly EditorSegment[],
 bookingClass:"REGULAR"|"PREMIUM"){
 const otherMatches=matches.filter(m=>m.slotId!==slotId)
  .reduce((sum,m)=>sum+m.plannedLengthMinutes,0);
 const otherAngles=angles.filter(a=>a.slotId!==slotId)
  .reduce((sum,a)=>sum+a.durationMinutes,0);
 const current="teams" in proposal?
  proposal.plannedLengthMinutes:proposal.durationMinutes;
 const total=otherMatches+otherAngles+current;
 const limit=bookingClass==="REGULAR"?120:null;
 return {total,limit,overBy:limit===null?0:Math.max(0,total-limit),
  remaining:limit===null?null:Math.max(0,limit-total)};
}
