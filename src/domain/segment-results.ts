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
 ATTACK:"Ambush / assault",INTERRUPTION:"Unexpected interruption",
 RESCUE:"A timely rescue",POST_MATCH_ASSAULT:"Post-match assault",
 TURN:"A change of allegiance",
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
 INTERRUPTION:`${subject} interrupts ${object}`,
 RESCUE:`${actors[0]??"An attacker"} assaults ${object} before ${actors[1]??"a rescuer"} intervenes`,
 POST_MATCH_ASSAULT:`${subject} attacks ${object} after their bout`,
 TURN:actors.length>1?
   `${subject} turn${object?" on "+object:""}${segment.turnTargetAlignment?
    " and become "+(segment.turnTargetAlignment==="FACE"?"faces":segment.turnTargetAlignment==="HEEL"?"heels":"tweeners"):""}`:
   `${subject} turns${object?" on "+object:""}${segment.turnTargetAlignment?
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
 const scene=segment.scene;
 const located=scene?" "+(scene.location==="IN_RING"?"in the ring":
  scene.location==="ENTRANCE_RAMP"?"on the entrance ramp":
  scene.location==="BACKSTAGE"?"backstage":
  scene.location==="LOCKER_ROOM"?"in the locker room":
  scene.location==="PARKING_LOT"?"in the parking lot":
  "in the office"):"";
 const visual=scene&&segment.outcome==="HAPPENS"?
  scene.visual==="BLOODIED"?" The target was left visibly bloodied; this does not establish a medical injury.":
  scene.visual==="LEFT_LYING"?" The target was left laid out.":
  scene.visual==="OFFICIALS_SEPARATE"?" Officials intervened to separate the wrestlers.":
  scene.visual==="DRIVEN_OFF"?" The aggressor was driven off.":
  "":"";
 const storyIntent=scene&&segment.outcome==="HAPPENS"?" The intended story was to "+({
  BUILD_RIVALRY:"escalate the rivalry",
  ELEVATE_INITIATOR:"elevate the initiator",
  BUILD_TARGET_SYMPATHY:"build sympathy for the victim",
  SET_UP_MATCH:"set up a future match",
  MAKE_STATEMENT:"make a statement"
 } as const)[scene.purpose]+".":"";
 const base=planned[segment.kind]+located;
 // The authored on-screen ending changes the write-up, not simulation
 // facts. A failed rescue must never read like the attacker was beaten.
 const beat=segment.creativeBeat;
 let ending="";
 if(segment.outcome==="HAPPENS"&&beat){
  switch(beat.kind){
   case "INTERRUPTION":
    ending=beat.ending==="VERBAL_EXCHANGE"?"Both sides traded words.":
     beat.ending==="INTERRUPTER_PREVAILS"?subject+" got the last word.":
     beat.ending==="SPEAKER_PREVAILS"?(object||"The interrupted speaker")+" got the last word.":
     "The exchange erupted into a brawl.";break;
   case "RESCUE":
    ending=beat.ending==="RESCUER_STANDS_TALL"?(actors[1]??"The rescuer")+" stood tall.":
     beat.ending==="ATTACKER_ESCAPES"?subject+" escaped before justice could be served.":
     "The rescue was overwhelmed.";break;
   case "POST_MATCH_ASSAULT":
    ending=beat.ending==="ATTACKER_STANDS_TALL"?subject+" stood tall.":
     beat.ending==="VICTIM_FIGHTS_BACK"?(object||"The victim")+" fought back.":
     "Officials rushed in to separate them.";break;
   case "CHALLENGE":
    ending=beat.response==="ACCEPTED"?"The challenge was accepted.":
     beat.response==="REFUSED"?"The challenge was refused.":
     "No answer was given yet.";break;
   case "CONTRACT_SIGNING":
    ending=beat.ending==="SIGNED"?"The on-screen agreement was signed.":
     beat.ending==="REJECTED"?"The proposed on-screen signing was rejected.":
     beat.ending==="WALKOUT"?"The signing ended with a walkout.":
     "The signing erupted into a brawl.";break;
   case "INTERFERENCE":
    ending=beat.presentation==="DISTRACTION"?
     "A distraction disrupted the action.":
     beat.presentation==="REFEREE_DIVERSION"?
      "The referee's attention was diverted.":"The interference came from ringside.";break;
   case "ATTACK":
    ending=beat.presentation==="PULL_APART_BRAWL"?
     "Officials had to pull the wrestlers apart.":
     beat.presentation==="BLINDSIDE"?"The ambush came without warning.":
     "The beatdown was sustained.";break;
  }
 }
 const summary=segment.outcome==="HAPPENS"?base+"."+(ending?" "+ending:"")+visual+storyIntent:
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
