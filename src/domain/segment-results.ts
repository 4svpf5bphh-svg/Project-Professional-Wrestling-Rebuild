import {normalizeBookedSegment, type BookedSegmentPayload} from "./segment-booking.js";
import type {SegmentKind,SegmentOutcome} from "../simulation/legacy/show-segments.js";
export interface SegmentResult{
 slotId:string;position:number;kind:SegmentKind;outcome:SegmentOutcome;
 headline:string;summary:string;actorIds:readonly string[];targetIds:readonly string[];
}
/** Narrative is a deterministic presentation of the author's locked decision.
 * No random success, rejection, membership change or alignment change.
 */
export function describeAuthoredSegment(payload:BookedSegmentPayload,
 names:ReadonlyMap<string,string>):SegmentResult{
 const segment=normalizeBookedSegment(payload,new Set(payload.participants.map(p=>p.personId)));
 const actors=segment.actorIds.map(id=>names.get(id)??"Unknown wrestler");
 const targets=segment.targetIds.map(id=>names.get(id)??"Unknown wrestler");
 const subject=actors.join(" & ")||"The promotion";
 const object=targets.join(" & ");
 const labels:Record<SegmentKind,string>={
 ATTACK:"Backstage attack",TURN:"A change of allegiance",
 CONTRACT_SIGNING:"Contract signing",INTERFERENCE:"Outside interference",
 DEBUT:"A new arrival",VIDEO_PACKAGE:"Video package",
 STABLE_EXIT:"Stable tension",STABLE_RECONCILIATION:"Stable reconciliation"};
 const purpose=segment.videoPurpose?segment.videoPurpose.replaceAll("_"," ").toLowerCase():"";
 const planned:Record<SegmentKind,string>={
 ATTACK:`${subject} attacks ${object}`,
 TURN:`${subject} turns${object?" on "+object:""}`,
 CONTRACT_SIGNING:`${subject} meets for a contract signing`,
 INTERFERENCE:`${subject} interferes against ${object}`,
 DEBUT:`${subject} makes an in-person debut`,
 VIDEO_PACKAGE:`A ${purpose} package features ${subject}`,
 STABLE_EXIT:`${subject} leaves the stable`,
 STABLE_RECONCILIATION:`${subject} attempts to reconcile with ${object}`};
 const base=planned[segment.kind];
 const summary=segment.outcome==="HAPPENS"?base+".":
  segment.outcome==="REFUSED"?`The planned moment does not happen: ${base}.`:
  `The moment is interrupted before completion: ${base}.`;
 return {slotId:segment.slotId,position:segment.position,kind:segment.kind,
  outcome:segment.outcome,headline:labels[segment.kind],summary,
  actorIds:[...segment.actorIds],targetIds:[...segment.targetIds]};
}
export function describeShowSegments(
 segments:readonly BookedSegmentPayload[],names:ReadonlyMap<string,string>,
):SegmentResult[]{
 if(segments.length>100)throw new Error("Too many segments");
 const seen=new Set<string>();
 return [...segments].sort((a,b)=>a.position-b.position).map(s=>{
  if(seen.has(s.slotId))throw new Error("Duplicate segment slot");
  seen.add(s.slotId);
  return describeAuthoredSegment(s,names);
 });
}
