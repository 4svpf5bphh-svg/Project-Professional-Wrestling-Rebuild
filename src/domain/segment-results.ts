import {normalizeBookedSegment} from "./segment-booking.js";
import type {AuthoredSegment} from "../simulation/legacy/show-segments.js";
import type {SegmentKind,SegmentOutcome} from "../simulation/legacy/show-segments.js";
export interface SegmentResult{
 slotId:string;position:number;kind:SegmentKind;outcome:SegmentOutcome;
 headline:string;summary:string;actorIds:readonly string[];targetIds:readonly string[];
 stableId?:string;stableDecision?:"ACCEPTED"|"REJECTED";
}
/** Narrative is a deterministic presentation of the author's locked decision.
 * No random success, rejection, membership change or alignment change.
 */
export function describeAuthoredSegment(payload:AuthoredSegment,
 names:ReadonlyMap<string,string>):SegmentResult{
 const segment=normalizeBookedSegment(payload,new Set([...payload.actorIds,...payload.targetIds]));
 const actors=segment.actorIds.map(id=>names.get(id)??"Unknown wrestler");
 const targets=segment.targetIds.map(id=>names.get(id)??"Unknown wrestler");
 const subject=actors.join(" & ")||"The promotion";
 const object=targets.join(" & ");
 const labels:Record<SegmentKind,string>={
 PROMO:"In-ring promo",INTERVIEW:"Interview",CONFRONTATION:"Face to face",
 CHALLENGE:"Challenge issued",CELEBRATION:"Celebration",
 ATTACK:"Backstage attack",TURN:"A change of allegiance",
 CONTRACT_SIGNING:"Contract signing",INTERFERENCE:"Outside interference",
 DEBUT:"A new arrival",VIDEO_PACKAGE:"Video package",
 STABLE_INVITATION:"Stable invitation",STABLE_EXIT:"Stable tension",STABLE_RECONCILIATION:"Stable reconciliation"};
 const purpose=segment.videoPurpose?segment.videoPurpose.replaceAll("_"," ").toLowerCase():"";
 const planned:Record<SegmentKind,string>={
 PROMO:`${subject} addresses the crowd`,
 INTERVIEW:`${subject} is interviewed`,
 CONFRONTATION:`${subject} confronts ${object}`,
 CHALLENGE:`${subject} challenges ${object}`,
 CELEBRATION:`${subject} celebrates in the ring`,
 ATTACK:`${subject} attacks ${object}`,
 TURN:`${subject} turns${object?" on "+object:""}${segment.turnTargetAlignment?
   " and adopts a "+segment.turnTargetAlignment.toLowerCase()+" alignment":""}`,
 CONTRACT_SIGNING:`${subject} meets for a contract signing`,
 INTERFERENCE:`${subject} interferes against ${object}`,
 DEBUT:`${subject} makes an in-person debut`,
 VIDEO_PACKAGE:`A ${purpose} package features ${subject}`,
 STABLE_INVITATION:`${subject} invites ${object} to join the stable${segment.stableDecision===
   "ACCEPTED"?", and the invitation is accepted":
   segment.stableDecision==="REJECTED"?", but the invitation is rejected":""}`,
 STABLE_EXIT:`${subject} leaves the stable`,
 STABLE_RECONCILIATION:`${subject} attempts to reconcile with ${object}${segment.stableDecision===
   "ACCEPTED"?", and the reconciliation succeeds":
   segment.stableDecision==="REJECTED"?", but the offer is rejected":""}`};
 const base=planned[segment.kind];
 const summary=segment.outcome==="HAPPENS"?base+".":
  segment.outcome==="REFUSED"?`The planned moment does not happen: ${base}.`:
  `The moment is interrupted before completion: ${base}.`;
 return {slotId:segment.slotId,position:segment.position,kind:segment.kind,
  outcome:segment.outcome,headline:labels[segment.kind],summary,
  actorIds:[...segment.actorIds],targetIds:[...segment.targetIds],
  ...(segment.stableId?{stableId:segment.stableId}:{}),
  ...(segment.stableDecision?{stableDecision:segment.stableDecision}:{})};
}
export function describeShowSegments(
 segments:readonly AuthoredSegment[],names:ReadonlyMap<string,string>,
):SegmentResult[]{
 if(segments.length>100)throw new Error("Too many segments");
 const seen=new Set<string>();
 return [...segments].sort((a,b)=>a.position-b.position).map(s=>{
  if(seen.has(s.slotId))throw new Error("Duplicate segment slot");
  seen.add(s.slotId);
  return describeAuthoredSegment(s,names);
 });
}
